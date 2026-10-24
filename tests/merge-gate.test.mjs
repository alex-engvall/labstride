import { removeDeploymentOrderingMigration } from './helpers/migration-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mergeFixture } from './helpers/merge-fixture.mjs';
import { validated } from '../packages/storage-sqlite/validation.ts';
import { localAuthority, context } from './helpers/configuration-fixture.mjs';
import { GitHubMergeProvider } from '../packages/provider-github/merges.ts';

const run = f => f.adapter().start(f.op, {});
function blocked(result) { assert.equal(result.result.status, 'accepted'); assert.ok(result.result.outputs.blocker); }

test('merge gate sends expected head exactly once and records independently observed merge SHA', async t => {
  const f = await mergeFixture(t), result = await run(f);
  assert.equal(result.result.status, 'succeeded');
  assert.equal(result.result.outputs.mergeSha, 'e'.repeat(40));
  assert.equal(f.store.mergeRecord(f.op.operationId).outcome, 'confirmed');
  assert.deepEqual(f.target.effects().map(e => JSON.parse(e.body)), [{ sha: f.op.source.sha, merge_method: 'merge' }]);
  assert.equal((await f.adapter().reconcile(f.op, null)).result.status, 'succeeded');
  assert.equal(f.target.puts().length, 1);
  const protectedRead = f.target.requests.find(r => r.path.endsWith('/protection'));
  assert.equal(protectedRead.credential, 'Bearer secret:project');
  assert.ok(f.store.mergeRecord(f.op.operationId).evidence.qualification.qualified);
});

test('AC13: a new head after green evidence prevents any merge submission', async t => {
  const f = await mergeFixture(t); let reads = 0;
  f.target.patch = (path, value) => {
    if (path === '/pulls/11' && ++reads === 3) { f.target.state.head = '9'.repeat(40); value.head.sha = f.target.state.head; }
    return value;
  };
  blocked(await run(f)); assert.equal(f.target.puts().length, 0); assert.equal(f.store.mergeRecord(f.op.operationId), null);
});

test('AC14: one absent required check keeps delivery waiting even when every returned result is green', async t => {
  const f = await mergeFixture(t);
  f.target.patch = (path, value) => path.endsWith('/check-runs') && value.total_count ? { total_count: 1, check_runs: value.check_runs.filter(check => check.name !== 'DCO') } : value;
  const result = await run(f); blocked(result); assert.equal(result.result.outputs.blocker, 'merge_required_check_missing'); assert.equal(f.target.puts().length, 0);
});

for (const conclusion of ['pending','failure','cancelled','skipped','neutral','timed_out']) test(`required check ${conclusion} blocks submission`, async t => {
  const f = await mergeFixture(t);
  f.target.patch = (path, value) => {
    if (path.endsWith('/check-runs')) for (const check of value.check_runs) if (check.name === 'build') {
      check.conclusion = conclusion; if (conclusion === 'pending') check.status = 'in_progress';
    }
    return value;
  };
  blocked(await run(f)); assert.equal(f.target.puts().length, 0);
});

for (const scenario of ['wrong-app','legacy-status','wrong-pr','old-base','rerun','workflow-changed','test-merge-stale','truncated-inventory']) test(`untrusted CI evidence: ${scenario}`, async t => {
  const f = await mergeFixture(t);
  f.target.patch = (path, value) => {
    if (scenario === 'wrong-app' && path.endsWith('/check-runs')) for (const check of value.check_runs) check.app.id = 999;
    if (scenario === 'legacy-status' && path.endsWith('/statuses')) return [{ context: 'build', state: 'success' }];
    if (path.startsWith('/actions/runs/31')) {
      if (scenario === 'wrong-pr') value.pull_requests[0].number = 99;
      if (scenario === 'old-base') value.pull_requests[0].base.sha = '0'.repeat(40);
      if (scenario === 'rerun' && path === '/actions/runs/31') value.run_attempt = 2;
    }
    if (scenario === 'workflow-changed' && path.endsWith('/ci.yml')) value.sha = '0'.repeat(40);
    if (scenario === 'test-merge-stale' && path.startsWith('/git/commits/')) value.parents[0].sha = '0'.repeat(40);
    if (scenario === 'truncated-inventory' && path.endsWith('/check-runs')) value.total_count = 3;
    return value;
  };
  blocked(await run(f)); assert.equal(f.target.puts().length, 0);
});

for (const scenario of ['unreadable','non-strict','admin-bypass','app-bypass','missing-enforcement','queue','unknown-bypass']) test(`unsupported protections: ${scenario}`, async t => {
  const f = await mergeFixture(t);
  f.target.patch = (path, value) => {
    if (path.endsWith('/protection')) {
      if (scenario === 'unreadable') return { httpStatus: 403 };
      if (scenario === 'non-strict') value.required_status_checks.strict = false;
      if (scenario === 'admin-bypass') value.enforce_admins.enabled = false;
      if (scenario === 'app-bypass') value.required_pull_request_reviews.bypass_pull_request_allowances.apps = [{ id: f.e.appId }];
      if (scenario === 'missing-enforcement') { value.required_status_checks.checks.pop(); value.required_status_checks.contexts.pop(); }
      if (scenario === 'unknown-bypass') value.required_pull_request_reviews.bypass_pull_request_allowances.apps = [{}];
    }
    if (scenario === 'queue' && path.startsWith('/rules/branches/')) return [{ type: 'merge_queue', ruleset_id: 3 }];
    return value;
  };
  blocked(await run(f)); assert.equal(f.target.puts().length, 0);
});

test('a changed base between complete gate snapshots invalidates earlier green evidence', async t => {
  const f = await mergeFixture(t); let read = 0;
  f.target.patch = (path, value) => {
    if (path === '/pulls/11' && ++read === 3) { f.target.state.base = '8'.repeat(40); value.base.sha = f.target.state.base; }
    return value;
  };
  const result = await run(f); blocked(result); assert.equal(f.target.puts().length, 0);
});

test('an unqualified downstream event cannot enable merge', async t => {
  const f = await mergeFixture(t);
  f.target.patch = (path, value) => { if (path === '/actions/runs/41') value.event = 'workflow_dispatch'; return value; };
  const qualification = await f.provider.qualify(f.e, f.e.qualification.mergeSha, f.e.qualification.runId);
  assert.equal(qualification.qualified, false);
  blocked(await run(f)); assert.equal(f.target.puts().length, 0);
});

test('opaque or incorrectly bound merge credentials fail before provider access', async t => {
  const f = await mergeFixture(t);
  for (const identity of [null, { appId: 999 }, { appId: f.e.appId, installationId: f.e.installationId, contents: 'write', repositoryIds: [] }]) {
    const provider = new GitHubMergeProvider({ credential: async () => 'not-a-proof', identity: () => identity, fetch: () => { throw Error('must not read'); } });
    await assert.rejects(provider.gate(f.e, f.input), e => e.code === 'merge_credential_not_qualified');
  }
});

test('policy revocation after independent reads prevents the one-time intent', async t => {
  const f = await mergeFixture(t); let reads = 0;
  f.target.patch = (path, value) => {
    if (path === '/actions/runs/31' && ++reads === 2) f.store.applyPolicyChange({ schemaVersion: '1.0', id: 'revoke', installationId: f.f.config.installationId,
      expectedRevision: 1, change: { kind: 'restrict', runId: null, paused: false, actorIds: [], repositoryIds: [], targetIds: [], actions: [{ id: 'labstride.github-merge', version: '1.0.0' }] } }, localAuthority, context);
    return value;
  };
  blocked(await run(f)); assert.equal(f.target.puts().length, 0);
});

test('expected-head rejection is terminal and cannot authorize an automatic resubmission', async t => {
  const f = await mergeFixture(t); f.target.reject = true;
  assert.equal((await run(f)).result.status, 'failed');
  f.target.reject = false;
  assert.equal((await f.adapter().reconcile(f.op, null)).result.status, 'failed');
  assert.equal(f.target.puts().length, 1); assert.equal(f.target.effects().length, 0);
});

test('lost merge response preserves observed external completion and never resubmits after restart', async t => {
  const f = await mergeFixture(t); f.target.lost = true;
  assert.equal((await run(f)).result.status, 'outcome_unknown');
  assert.equal(f.target.effects().length, 1); f.close(); f.reopen();
  assert.equal((await f.adapter().reconcile(f.op, null)).result.status, 'outcome_unknown');
  const record = f.store.mergeRecord(f.op.operationId);
  assert.equal(record.outcome, 'observed_external'); assert.equal(record.mergeSha, f.target.state.mergeSha);
  assert.equal(f.target.puts().length, 1);
});

test('branch claims serialize independent issues and uncertainty retains the hold', async t => {
  const f = await mergeFixture(t), other = f.admit(':second');
  assert.throws(() => f.store.claim(other.operationId, 'other', 'other-attempt'), e => e.code === 'resource_busy');
  f.target.lost = true; await run(f); f.close(); f.reopen();
  assert.throws(() => f.store.claim(other.operationId, 'other', 'other-attempt'), e => e.code === 'resource_busy');
});

test('pinned loading rejects tampering and typed input rejects credentials or authority fields', async t => {
  const f = await mergeFixture(t);
  for (const extra of [{ credentialRef: 'secret:attacker' }, { bypass: true }, { expectedHead: 'invalid' }, { schemaVersion: '2.0' }]) {
    assert.throws(() => validated('merge-input', { ...f.input, ...extra }));
  }
  writeFileSync(f.pin.artifactPath, readFileSync(f.pin.artifactPath, 'utf8') + ' ');
  await assert.rejects(f.adapter().validate(f.op), e => e.code === 'integrity_mismatch');
  assert.equal(f.target.puts().length, 0);
});

test('the normal durable worker executes the enrolled merge action', async t => {
  const f = await mergeFixture(t, { prepared: true }), worker = f.worker();
  await worker.tick(); await worker.drain();
  assert.equal(f.store.get('operation', f.op.operationId).state, 'succeeded');
  assert.equal(f.target.effects().length, 1);
});

test('actual coordinator death after remote effect preserves one merge across recovery', async t => {
  const f = await mergeFixture(t, { prepared: true }), dataFile = f.root + '/child.json';
  writeFileSync(dataFile, JSON.stringify({ operationId: f.op.operationId, state: f.state, host: f.f.dependencies.host, enrollment: f.e, url: f.target.url }));
  f.close(); f.target.hold = true;
  let effect;
  const effectSeen = new Promise(resolve => { effect = resolve; }); f.target.afterMerge = effect;
  const child = spawn(process.execPath, ['tests/helpers/merge-process.mjs', dataFile], { stdio: ['ignore','pipe','pipe','ipc'] });
  let stderr = ''; child.stderr.on('data', bytes => stderr += bytes);
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  await Promise.race([effectSeen, once(child, 'exit').then(() => { throw Error(stderr || 'child exited before effect'); }), new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('effect timeout: ' + stderr)), 15000); timer.unref(); })]);
  const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
  f.reopen();
  const recovered = await f.adapter().reconcile(f.op, null);
  assert.equal(recovered.result.status, 'outcome_unknown'); assert.equal(f.target.effects().length, 1);
  assert.equal(f.store.mergeRecord(f.op.operationId).outcome, 'observed_external');
  await f.adapter().reconcile(f.op, null); assert.equal(f.target.puts().length, 1);
});

for (const scenario of ['ruleset-check','ruleset-bypass','unknown-rule','read-failure','base-ref-race','duplicate-check','old-check-head','new-attempt-between-gates','changed-protection','unproven-merge-actor','wrong-final-run-id']) test(`independent gate boundary: ${scenario}`, async t => {
  const f = await mergeFixture(t); let freshRunReads = 0, protectionReads = 0;
  f.target.patch = (path, value) => {
    if (path.startsWith('/rules/branches/')) {
      if (scenario === 'ruleset-check') return [{ type: 'required_status_checks', ruleset_id: 3, parameters: { required_status_checks: [{ context: 'security', integration_id: 927 }] } }];
      if (scenario === 'ruleset-bypass') return [{ type: 'pull_request', ruleset_id: 3 }];
      if (scenario === 'unknown-rule') return [{ type: 'unrecognized', ruleset_id: 3 }];
      if (scenario === 'read-failure') return { httpStatus: 503 };
    }
    if (scenario === 'ruleset-bypass' && path === '/rulesets/3') value.bypass_actors = [{ actor_type: 'Integration', actor_id: f.e.appId }];
    if (scenario === 'base-ref-race' && path.startsWith('/git/ref/heads/')) value.object.sha = '9'.repeat(40);
    if (scenario === 'changed-protection' && path.endsWith('/protection') && ++protectionReads >= 3) value.required_pull_request_reviews.required_approving_review_count = 2;
    if (scenario === 'new-attempt-between-gates' && path === '/actions/runs/31' && ++freshRunReads === 2) value.run_attempt = 2;
    if (scenario === 'unproven-merge-actor' && path === '/pulls/10') value.merged_by.id = 999;
    if (scenario === 'wrong-final-run-id' && path === '/actions/runs/31') value.id = 999;
    if (path.endsWith('/check-runs') && value.total_count) {
      if (scenario === 'duplicate-check') { value.check_runs.push({ ...value.check_runs[0], id: 63 }); value.total_count++; }
      if (scenario === 'old-check-head') value.check_runs[0].head_sha = '9'.repeat(40);
    }
    return value;
  };
  blocked(await run(f)); assert.equal(f.target.puts().length, 0);
});

test('expired deadline after provider reads blocks the intent', async t => {
  const f = await mergeFixture(t); let reads = 0;
  f.target.patch = (path, value) => { if (path === '/actions/runs/31' && ++reads === 2) f.setNow('2100-01-01T00:00:00Z'); return value; };
  blocked(await run(f)); assert.equal(f.target.puts().length, 0);
});

test('unconfirmed remote completion and mismatched readback cannot report merge success', async t => {
  const f = await mergeFixture(t); f.target.state.mergedBy = 999;
  const result = await run(f); assert.equal(result.result.status, 'outcome_unknown');
  assert.equal(f.store.mergeRecord(f.op.operationId).outcome, 'observed_external');
  assert.equal(f.target.effects().length, 1);
});

test('migration 16 preserves an existing operation without inventing a merge intent', async t => {
  const f = await mergeFixture(t);
  const before = f.store.get('operation', f.op.operationId); f.close();
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(f.state + '/state.sqlite');
  removeDeploymentOrderingMigration(db);
  db.exec('DROP TABLE merge_intents; DELETE FROM schema_migrations WHERE version=16; PRAGMA user_version=15'); db.close();
  f.reopen();
  assert.deepEqual(f.store.get('operation', f.op.operationId).request, before.request);
  assert.equal(f.store.mergeRecord(f.op.operationId), null); assert.equal(f.target.puts().length, 0);
});

for (const mode of ['before-intent','after-intent','after-response']) test(`actual coordinator SIGKILL at ${mode} keeps the original effect boundary`, async t => {
  const f = await mergeFixture(t, { prepared: true }), dataFile = f.root + '/crash.json';
  writeFileSync(dataFile, JSON.stringify({ state: f.state, host: f.f.dependencies.host, enrollment: f.e, url: f.target.url, mode }));
  f.close();
  const child = spawn(process.execPath, ['tests/helpers/merge-process.mjs', dataFile], { stdio: ['ignore','pipe','pipe','ipc'] });
  let errors = ''; child.stderr.on('data', bytes => errors += bytes);
  const exited = once(child, 'exit');
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; } });
  const received = await Promise.race([once(child, 'message', { signal: AbortSignal.timeout(15000) }), exited.then(() => { throw Error(errors || 'child exited before boundary'); })]);
  assert.equal(received[0].stage, mode); child.kill('SIGKILL'); await exited; f.reopen();
  const result = await f.adapter().reconcile(f.op, null);
  assert.equal(f.target.effects().length, mode === 'after-intent' ? 0 : 1);
  assert.equal(result.result.status, mode === 'after-intent' ? 'outcome_unknown' : 'succeeded');
  await f.adapter().reconcile(f.op, null);
  assert.equal(f.target.puts().length, mode === 'after-intent' ? 0 : 1);
});

test('a terminal readback conflict retains the branch hold and cannot replace the acknowledged SHA', async t => {
  const f = await mergeFixture(t);
  f.target.patch = (path, value, _query, method) => {
    if (path === '/pulls/11' && value.merged) value.merge_commit_sha = '8'.repeat(40);
    return value;
  };
  assert.equal((await run(f)).result.status, 'outcome_unknown');
  const record = f.store.mergeRecord(f.op.operationId);
  assert.equal(record.outcome, 'conflict'); assert.equal(record.responseSha, 'e'.repeat(40));
  assert.equal(record.mergeSha, '8'.repeat(40));
  f.close(); f.reopen(); await f.adapter().reconcile(f.op, null); assert.equal(f.target.puts().length, 1);
});

test('missing proof or misbound gate evidence cannot authorize a merge intent', async t => {
  const f = await mergeFixture(t), evidence = await f.provider.gate(f.e, f.input);
  for (const patch of [{ qualification: { ...evidence.qualification, repositoryId: 99 } }, { head: '9'.repeat(40) }, { checks: [evidence.checks[0]] }]) {
    assert.throws(() => f.store.beginMergeIntent(f.op.operationId, { ...evidence, ...patch }));
  }
  assert.equal(f.store.mergeRecord(f.op.operationId), null); assert.equal(f.target.puts().length, 0);
});

for (const boundary of ['before-intent','during-readback']) test(`a restore epoch change ${boundary} rejects stale observation`, async t => {
  const f = await mergeFixture(t); let reads = 0, restored = false;
  f.target.patch = (path, value) => {
    if (!restored && (boundary === 'before-intent' && path === '/actions/runs/31' && ++reads === 2 || boundary === 'during-readback' && path === '/pulls/11' && value.merged)) {
      restored = true; f.store.enterRestore(context);
    }
    return value;
  };
  const result = await run(f);
  assert.ok(restored);
  if (boundary === 'before-intent') { blocked(result); assert.equal(f.target.puts().length, 0); }
  else { assert.equal(result.result.status, 'outcome_unknown'); assert.equal(f.store.mergeRecord(f.op.operationId).outcome, 'pending'); assert.equal(f.target.puts().length, 1); }
});

test('existing installation format defaults to review-only and merge workflow requires explicit enablement', async () => {
  const { installationShape } = await import('../packages/operations/runtime.ts');
  const spec = JSON.parse(readFileSync(new URL('../examples/operational-installation.json', import.meta.url), 'utf8'));
  assert.equal(Object.hasOwn(spec, 'mergeEnabled'), false);
  validated('operational-installation', spec); installationShape(spec);
  const steps = Object.values(spec.configuration.workflows)[0];
  steps.push({ id: 'merge-opt-in', action: 'labstride.github-merge', inputs: {} });
  assert.throws(() => installationShape(spec), /merge_not_enabled/);
});

test('the coordinator leaves merge unavailable unless its trusted embedding registers it', async t => {
  const f = await mergeFixture(t, { prepared: true }); f.close();
  const { startExecution } = await import('../apps/coordinator/runtime.ts');
  const runtime = startExecution(f.state, { dependencies: f.dependencies,
    actions: { executorId: 'no-merge', nextAttempt: () => 'unused', adapters: new Map() }, observations: { sessions: new Map(), projections: new Map() } });
  try {
    await runtime.tick(); await runtime.drain();
    assert.equal(runtime.store.delivery(`operation:${f.op.operationId}`).lastError, 'unsupported_capability');
    assert.equal(f.target.puts().length, 0);
  } finally { await runtime.close(); }
});

test('a skipped optional job does not replace or block successful platform-required checks', async t => {
  const f = await mergeFixture(t);
  f.target.patch = (path, value) => {
    if (path.endsWith('/check-runs') && value.total_count) {
      value.check_runs.push({ ...value.check_runs[0], id: 90, name: 'Optional deployment', conclusion: 'skipped' }); value.total_count++;
    }
    return value;
  };
  assert.equal((await run(f)).result.status, 'succeeded'); assert.equal(f.target.effects().length, 1);
});

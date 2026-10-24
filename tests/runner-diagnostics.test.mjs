import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet } from 'jose';
import { publicFixture } from './helpers/public-installation-fixture.mjs';
import { runnerDiagnostics, probeReady, probeBinding, brokerReachable } from '../packages/operations/runner-probe.ts';
import { openDiagnosticsOnly } from '../packages/operations/runtime.ts';
import { createWorkflowBroker } from '../packages/workflow-broker/server.ts';
import { acquireServiceLock } from '../packages/operations/loop.ts';
import { cli } from '../apps/cli/main.ts';

async function fixture(t) {
  const f = publicFixture(t);
  const policy = JSON.parse(readFileSync(new URL('../tools/oidc-probe/policy.example.json', import.meta.url)));
  f.spec.configuration.github.repositories = [policy.repository];
  f.spec.configuration.broker = { url: 'https://broker.example.test', oidcAudience: policy.audience };
  f.spec.brokerProbe = { policy, maxAgeSeconds: 60 }; f.spec.brokerListener = { port: 8789 };
  const now = Math.floor(Date.now()/1000), pair = await generateKeyPair('RS256'), jwk = await exportJWK(pair.publicKey);
  let reads = 0;
  const dependencies = { getKey: createLocalJWKSet({ keys: [{ ...jwk, kid: 'fixture', alg: 'RS256' }] }), currentDate: new Date(now*1000), async readRun() { reads++; return {
    id: Number(policy.runId), run_attempt: Number(policy.runAttempt), repository: { id: Number(policy.repositoryId), full_name: policy.repository, owner: { id: Number(policy.ownerId), login: policy.repository.split('/')[0] } },
    head_repository: { id: Number(policy.repositoryId), full_name: policy.repository }, path: policy.workflowPath, head_branch: policy.ref.slice(11), head_sha: policy.workflowSha, event: 'push', status: 'in_progress',
  }; } };
  const sign = (patch = {}) => new SignJWT({ iss: 'https://token.actions.githubusercontent.com', aud: policy.audience, sub: 'fixture', jti: 'never-persist-token-jti', iat: now, nbf: now, exp: now+300,
    repository: policy.repository, repository_id: policy.repositoryId, repository_owner_id: policy.ownerId, workflow_ref: `${policy.repository}/${policy.workflowPath}@${policy.ref}`,
    workflow_sha: policy.workflowSha, ref: policy.ref, sha: policy.workflowSha, run_id: policy.runId, run_attempt: policy.runAttempt, event_name: 'push', runner_environment: 'github-hosted', ...patch }).setProtectedHeader({ alg: 'RS256', kid: 'fixture' }).sign(pair.privateKey);
  const handler = runnerDiagnostics(f.spec, dependencies);
  // Mount on the actual broker listener. Any operation store access in diagnostics is a failure.
  const store = new Proxy({}, { get() { return () => assert.fail('diagnostics must not access operation effects'); } });
  const server = createWorkflowBroker(store, {}, undefined, { handler, allowEffects: () => false });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const post = async (token, body = { schemaVersion: '1.0', probeId: 'probe-test' }) => fetch(origin+'/v1/discovery/oidc-probe', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer '+token }, body: JSON.stringify(body) });
  return { ...f, post, sign, reads: () => reads, origin };
}

test('broker diagnostics verify signed OIDC and independent run identity before durable redacted evidence', async t => {
  const f = await fixture(t); assert.equal(probeReady(f.spec),false);
  const token = await f.sign(); const response = await f.post(token); assert.equal(response.status,200); const result = await response.json();
  assert.equal(result.result,'verified_discovery_identity'); assert.equal(f.reads(),1); assert.equal(probeReady(f.spec),true);
  const data = readFileSync(join(f.spec.stateDirectory,'runner-probe.json'),'utf8');
  assert.equal(data.includes(token),false); assert.equal(data.includes('never-persist-token-jti'),false);
  assert.equal(JSON.parse(data).bindingDigest,probeBinding(f.spec));
  assert.equal(probeReady({...f.spec,configuration:{...f.spec.configuration,enabled:true}}),true);
  assert.equal(probeReady(f.spec,Date.now()+61000),false);
  const changed = structuredClone(f.spec); changed.configuration.limits.development++;
  assert.equal(probeReady(changed),false);
  assert.equal(existsSync(join(f.spec.stateDirectory,'state.sqlite')),false);
  const transport = async url => { assert.equal(String(url),'https://broker.example.test/v1/diagnostics/status'); return fetch(f.origin+'/v1/diagnostics/status'); };
  assert.equal(await brokerReachable(f.spec,transport),true);
  assert.equal(await brokerReachable(changed,transport),false);
});

for (const [label,patch] of [['audience',{aud:'wrong'}],['repository',{repository_id:'999999'}],['workflow',{workflow_sha:'f'.repeat(40)}],['expired',{iat:1,nbf:1,exp:2}]]) test(`broker diagnostic rejects wrong ${label} without saving evidence`,async t=>{
  const f=await fixture(t); const response=await f.post(await f.sign(patch)); assert.equal(response.status,403);
  assert.equal(f.reads(),0); assert.equal(probeReady(f.spec),false); assert.equal(existsSync(join(f.spec.stateDirectory,'runner-probe.json')),false);
});

test('health, malformed requests and negative profiles never qualify a runner; ambiguous acknowledgement retains the original proof',async t=>{
  const f=await fixture(t),token=await f.sign();
  assert.equal((await fetch(f.origin+'/v1/diagnostics/status')).status,200); assert.equal(probeReady(f.spec),false);
  assert.equal((await f.post(token,{schemaVersion:'2.0',probeId:'bad'})).status,400);
  assert.equal((await f.post(token,{schemaVersion:'1.0',probeId:'bad',policy:{audience:'caller-controlled'}})).status,400);
  assert.equal((await f.post(token,{schemaVersion:'1.0',probeId:'bad',padding:'x'.repeat(4096)})).status,413);
  for(const name of ['wrong-repository','wrong-workflow','wrong-run','wrong-attempt']) assert.equal((await f.post(token,{schemaVersion:'1.0',probeId:'negative',case:name})).status,403);
  assert.equal(probeReady(f.spec),false);
  const response=await f.post(token); await response.body.cancel();
  assert.equal(probeReady(f.spec),true); const first=JSON.parse(readFileSync(join(f.spec.stateDirectory,'runner-probe.json')));
  assert.equal((await f.post(token)).status,200); assert.equal(JSON.parse(readFileSync(join(f.spec.stateDirectory,'runner-probe.json'))).bindingDigest,first.bindingDigest);
});

test('disabled diagnostics-only listener creates no execution DB and exposes no operation route',async t=>{
  const f=publicFixture(t),policy=JSON.parse(readFileSync(new URL('../tools/oidc-probe/policy.example.json',import.meta.url)));
  f.spec.configuration.github.repositories=[policy.repository];f.spec.configuration.broker={url:'https://broker.example.test',oidcAudience:policy.audience};f.spec.brokerProbe={policy};
  const portServer=createServer();portServer.listen(0,'127.0.0.1');await once(portServer,'listening');const port=portServer.address().port;await new Promise(resolve=>portServer.close(resolve));f.spec.brokerListener={port};
  const runtime=await openDiagnosticsOnly(f.spec);t.after(()=>runtime.close());
  const denied=await fetch(`http://127.0.0.1:${port}/v1/operations/any/claim`,{method:'POST'});assert.equal(denied.status,404);
  await runtime.tick();assert.deepEqual(readdirSync(f.spec.stateDirectory),[]);
  f.spec.configuration.enabled=true;await assert.rejects(openDiagnosticsOnly(f.spec),/broker_configuration_invalid/);
});

test('recovery begin excludes an active coordinator lock and preserves the database',async t=>{
  const f=publicFixture(t);f.write();await cli(['state','init','--config',f.path],()=>{});
  const release=await acquireServiceLock(f.spec.stateDirectory);
  try{await assert.rejects(cli(['recovery','begin','--config',f.path]),/service_lock_present/);}finally{await release();}
  const output=[];await cli(['recovery','status','--config',f.path],value=>output.push(value));assert.equal(output[0].paused,false);
});

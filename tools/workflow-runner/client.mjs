import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, lstatSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : value && typeof value === 'object'
  ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
async function json(response, limit = 262144) {
  let size = 0; const chunks = [];
  if (!response.body) throw Error('invalid_response');
  for await (const chunk of response.body) { size += chunk.length; if (size > limit) throw Error('invalid_response'); chunks.push(Buffer.from(chunk)); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function settings(options) {
  const { endpoint, audience, operationId, requestDigest, env = process.env } = options;
  const broker = new URL(endpoint), oidc = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
  if ([broker, oidc].some(url => url.protocol !== 'https:' || url.username || url.password || url.hash) || broker.pathname !== '/' || broker.search ||
    !/^[!-~]{1,256}$/.test(audience ?? '') || !/^[A-Za-z0-9_.:-]{1,256}$/.test(operationId ?? '') || !/^[a-f0-9]{64}$/.test(requestDigest ?? '') ||
    !/^[1-9][0-9]{0,31}$/.test(env.GITHUB_RUN_ID ?? '') || !/^[1-9][0-9]{0,8}$/.test(env.GITHUB_RUN_ATTEMPT ?? '') || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) throw Error('invalid_runner_configuration');
  return { broker, oidc, env };
}
async function send(options, phase, body) {
  const { broker, oidc, env } = settings(options), fetcher = options.fetcher ?? fetch;
  oidc.searchParams.set('audience', options.audience);
  const response = await fetcher(oidc, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` } });
  if (response.status !== 200) throw Error('identity_unavailable');
  const { value: token } = await json(response, 32768);
  if (typeof token !== 'string' || token.length > 16384 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) throw Error('identity_unavailable');
  const reply = await fetcher(new URL(`/v1/operations/${options.operationId}/${phase}`, broker), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const result = await json(reply);
  if (reply.status !== 200 || result.schemaVersion !== '1.0') throw Error('broker_request_denied_or_unknown');
  return result;
}
export function validateClaim(options, value) {
  const { env } = settings(options), op = value?.operation, enrollment = value?.enrollment, claim = value?.claim;
  const { requestDigest: ignored, ...contents } = op ?? {};
  const workflowRef = `${env.GITHUB_REPOSITORY}/${claim?.executor?.workflowPath}@${enrollment?.ref}`;
  if (value?.schemaVersion !== '1.0' || op?.schemaVersion !== '1.0' || op.operationId !== options.operationId ||
    op.requestDigest !== options.requestDigest || digest(contents) !== options.requestDigest || op.actionId !== 'labstride.github-workflow' || op.actionVersion !== '1.0.0' ||
    !sha(op.source?.sha) || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(op.source?.repository ?? '') ||
    !/^[A-Za-z0-9_.:-]{1,256}$/.test(op.targetId ?? '') || !Number.isFinite(Date.parse(op.deadline)) || Date.parse(op.deadline) <= (options.now?.() ?? Date.now()) ||
    op.inputs?.target !== op.targetId || digest(op.inputs?.source) !== digest(op.source) ||
    enrollment?.schemaVersion !== '1.0' || enrollment.targetId !== op.targetId || enrollment.repository?.id !== env.GITHUB_REPOSITORY_ID ||
    enrollment.repository?.name !== env.GITHUB_REPOSITORY || enrollment.ref !== env.GITHUB_REF || enrollment.workflowSha !== env.GITHUB_WORKFLOW_SHA ||
    claim?.schemaVersion !== '1.0' || claim.operationId !== op.operationId || claim.requestDigest !== op.requestDigest ||
    !/^[A-Za-z0-9_.:-]{1,256}$/.test(claim.claimId ?? '') || !Number.isSafeInteger(claim.fencingNumber) || claim.fencingNumber < 1 ||
    claim.executor?.provider !== 'github-actions' || claim.executor.repositoryId !== env.GITHUB_REPOSITORY_ID || claim.executor.runId !== env.GITHUB_RUN_ID ||
    claim.executor.runAttempt !== Number(env.GITHUB_RUN_ATTEMPT) || claim.executor.workflowSha !== env.GITHUB_WORKFLOW_SHA ||
    claim.executor.workflowPath !== enrollment.workflowPath || !/^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/.test(enrollment.workflowPath ?? '') ||
    workflowRef !== env.GITHUB_WORKFLOW_REF) throw Error('invalid_bound_request');
  return structuredClone(value);
}
export async function claimOperation(options) {
  return validateClaim(options, await send(options, 'claim', { schemaVersion: '1.0', requestDigest: options.requestDigest }));
}
export async function executeClaim(options, input, { observeSource, effect, saveReceipt = () => {} }) {
  const value = validateClaim(options, input), { operation: op, claim } = value;
  if (await observeSource(op) !== op.source.sha) throw Error('source_revision_mismatch');
  const permit = await send(options, 'authorize-effect', { schemaVersion: '1.0', requestDigest: op.requestDigest, claimId: claim.claimId });
  if (permit.authorized !== true || permit.claimId !== claim.claimId) throw Error('effect_not_authorized');
  // There is deliberately no retry loop around authorization or the effect.
  let result;
  try { result = await effect(structuredClone(value)); }
  catch { result = { conclusion: 'outcome_unknown', resources: [], outputs: {}, error: { code: 'outcome_unknown', message: 'Observe the original target before recovery.', retryClass: 'reconcile' } }; }
  if (!result || !['succeeded','failed','cancelled','outcome_unknown'].includes(result.conclusion) || !Array.isArray(result.resources) ||
    !result.outputs || typeof result.outputs !== 'object' || Array.isArray(result.outputs)) throw Error('invalid_effect_result');
  const receipt = { schemaVersion: '1.0', operationId: op.operationId, requestDigest: op.requestDigest, claimId: claim.claimId,
    fencingNumber: claim.fencingNumber, executor: claim.executor, sourceSha: op.source.sha, targetId: op.targetId,
    conclusion: result.conclusion, observedAt: new Date(options.now?.() ?? Date.now()).toISOString(), resources: result.resources, outputs: result.outputs,
    ...(result.error ? { error: result.error } : {}) };
  await saveReceipt(receipt); // Preserve the exact receipt before a possibly lost HTTP reply.
  await reportReceipt(options, receipt);
  return receipt;
}
export async function reportReceipt(options, receipt) {
  if (receipt?.operationId !== options.operationId || receipt.requestDigest !== options.requestDigest) throw Error('invalid_receipt');
  const response = await send(options, 'receipt', receipt);
  if (response.received !== true) throw Error('invalid_receipt_acknowledgement');
}
function readBounded(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.size > 262144) throw Error('invalid_local_record');
  return JSON.parse(readFileSync(path, 'utf8'));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const env = process.env, options = { endpoint: env.LABSTRIDE_BROKER_URL, audience: env.LABSTRIDE_OIDC_AUDIENCE,
      operationId: env.LABSTRIDE_OPERATION_ID, requestDigest: env.LABSTRIDE_REQUEST_DIGEST };
    if (process.argv[2] === 'claim') {
      const value = await claimOperation(options);
      writeFileSync(env.LABSTRIDE_CLAIM_FILE, JSON.stringify(value), { flag: 'wx', mode: 0o600 });
      if (env.GITHUB_OUTPUT) writeFileSync(env.GITHUB_OUTPUT, `source_sha=${value.operation.source.sha}\nsource_repository=${value.operation.source.repository}\n`, { flag: 'a' });
    } else if (process.argv[2] === 'execute') {
      const source = resolve(env.LABSTRIDE_SOURCE_DIRECTORY), modulePath = resolve(env.LABSTRIDE_EFFECT_MODULE);
      if (modulePath === source || modulePath.startsWith(source + sep)) throw Error('untrusted_effect_module');
      const receipt = await executeClaim(options, readBounded(env.LABSTRIDE_CLAIM_FILE), {
        observeSource() {
          const result = spawnSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8', env: { PATH: process.env.PATH }, timeout: 15000 });
          if (result.status !== 0) throw Error('source_observation_failed'); return result.stdout.trim();
        }, async effect(value) {
          const { effect } = await import(pathToFileURL(modulePath).href);
          if (typeof effect !== 'function') throw Error('invalid_effect_module');
          return effect(value);
        }, saveReceipt(receipt) { writeFileSync(env.LABSTRIDE_RECEIPT_FILE, JSON.stringify(receipt), { flag: 'wx', mode: 0o600 }); },
      });
      if (receipt.conclusion !== 'succeeded') process.exitCode = 1;
    } else if (process.argv[2] === 'report') await reportReceipt(options, readBounded(env.LABSTRIDE_RECEIPT_FILE));
    else throw Error('invalid_command');
  } catch { process.stderr.write('workflow_request_denied_or_unknown; observe the original operation\n'); process.exitCode = 1; }
}

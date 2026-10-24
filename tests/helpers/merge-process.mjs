import { readFileSync } from 'node:fs';
import { startExecution } from '../../apps/coordinator/runtime.ts';
import { policyDependencies } from './configuration-fixture.mjs';
import { GitHubMergeProvider } from '../../packages/provider-github/merges.ts';
const data = JSON.parse(readFileSync(process.argv[2], 'utf8')), e = data.enrollment;
const provider = new GitHubMergeProvider({ credential: async reference => reference,
  identity: () => ({ appId: e.appId, installationId: e.installationId, repositoryIds: [e.repository.id], contents: 'write' }),
  fetch: (url, init) => { const u = new URL(url); return fetch(data.url + u.pathname + u.search, init); } });
const pause = async () => { process.send({ stage: data.mode }); await new Promise(() => {}); };
if (data.mode === 'before-intent') {
  const gate = provider.gate.bind(provider); let calls = 0;
  provider.gate = async (...args) => { const evidence = await gate(...args); if (++calls === 2) await pause(); return evidence; };
}
if (data.mode === 'after-intent') provider.merge = pause;
if (data.mode === 'after-response') {
  const observe = provider.observe.bind(provider);
  provider.observe = async (...args) => { const observation = await observe(...args); await pause(); return observation; };
}
const runtime = startExecution(data.state, { dependencies: { ...policyDependencies, clock: { now: () => '2026-10-24T12:00:00.000Z' } },
  actions: { executorId: 'merge-child', nextAttempt: () => 'child-attempt', adapters: new Map() },
  observations: { sessions: new Map(), projections: new Map() }, githubMerge: { host: data.host, provider } });
await runtime.tick(); await runtime.drain();
process.send({ completed: true });
await runtime.close();

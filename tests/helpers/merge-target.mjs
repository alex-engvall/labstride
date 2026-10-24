import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { once } from 'node:events';

// Independent durable provider fixture. The coordinator cannot write its DB.
export async function mergeTarget(t, root, enrollment, head) {
  const db = new DatabaseSync(root + '/github.sqlite');
  db.exec('CREATE TABLE effects(id INTEGER PRIMARY KEY, body TEXT); CREATE TABLE state(id INTEGER PRIMARY KEY, payload TEXT)');
  const state = { head, base: 'b'.repeat(40), testMerge: 'c'.repeat(40), merged: false, mergeSha: 'e'.repeat(40), mergedBy: enrollment.actorId };
  db.prepare('INSERT INTO state VALUES (1,?)').run(JSON.stringify(state));
  const requests = [], responses = [], e = enrollment, repo = { id: e.repository.id, node_id: e.repository.nodeId };
  const checks = () => [
    { id: 61, name: 'build', head_sha: state.head, app: { id: 15368 }, check_suite: { id: 51 }, status: 'completed', conclusion: 'success' },
    { id: 62, name: 'DCO', head_sha: state.head, app: { id: 927 }, check_suite: { id: 52 }, status: 'completed', conclusion: 'success' },
  ];
  const run = () => ({ id: 31, run_attempt: 1, workflow_id: 201, path: '.github/workflows/ci.yml', repository: repo, head_repository: repo,
    event: 'pull_request', head_sha: state.head, status: 'completed', conclusion: 'success', check_suite_id: 51,
    pull_requests: [{ number: 11, head: { sha: state.head }, base: { sha: state.base } }] });
  const classic = () => ({ enforce_admins: { enabled: true }, required_status_checks: { strict: true, contexts: ['build','DCO'],
    checks: [{ context: 'build', app_id: 15368 }, { context: 'DCO', app_id: 927 }] },
    required_pull_request_reviews: { bypass_pull_request_allowances: { apps: [], users: [], teams: [] } },
    allow_force_pushes: { enabled: false }, allow_deletions: { enabled: false } });
  const control = { state, requests, responses, patch: (_path, value) => value, lost: false, reject: false, hold: false, afterMerge: null,
    effects: () => db.prepare('SELECT * FROM effects').all(), puts: () => requests.filter(r => r.method === 'PUT'),
    save() { db.prepare('UPDATE state SET payload=? WHERE id=1').run(JSON.stringify(state)); } };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://fixture'), path = url.pathname.replace(`/repos/${e.repository.name}`, ''), query = url.searchParams;
      let bytes = ''; for await (const part of req) bytes += part;
      const body = bytes ? JSON.parse(bytes) : null;
      requests.push({ path, query: url.search, method: req.method, credential: req.headers.authorization, body });
      let value;
      if (req.method === 'PUT') {
        if (path !== '/pulls/11/merge') throw Error('unexpected effect');
        if (control.reject || body.sha !== state.head) { res.writeHead(409); res.end('{}'); return; }
        db.exec('BEGIN IMMEDIATE'); db.prepare('INSERT INTO effects(body) VALUES (?)').run(JSON.stringify(body));
        state.merged = true; control.save(); db.exec('COMMIT');
        control.afterMerge?.();
        if (control.lost) { res.destroy(); return; }
        if (control.hold) { responses.push(res); return; }
        value = { merged: true, sha: state.mergeSha };
      } else if (path === '') value = { ...repo, full_name: e.repository.name, archived: false, permissions: { admin: false }, allow_merge_commit: true, allow_squash_merge: true, allow_rebase_merge: true };
      else if (path === '/pulls/10') value = { number: 10, merged: true, merge_commit_sha: e.qualification.mergeSha, merged_by: { id: e.actorId }, base: { ref: e.baseBranch, repo } };
      else if (path === '/pulls/11') value = { number: 11, base: { sha: state.base, ref: e.baseBranch, repo }, head: { sha: state.head, repo }, state: state.merged ? 'closed' : 'open',
        merged: state.merged, draft: false, mergeable: true, mergeable_state: 'clean', merge_commit_sha: state.merged ? state.mergeSha : state.testMerge, merged_by: state.merged ? { id: state.mergedBy } : null };
      else if (path.startsWith('/git/ref/heads/')) value = { ref: `refs/heads/${e.baseBranch}`, object: { type: 'commit', sha: state.base } };
      else if (path.startsWith('/rulesets/')) value = { id: Number(path.split('/').at(-1)), enforcement: 'active', bypass_actors: [] };
      else if (path.includes('/compare/')) value = { status: 'ahead', merge_base_commit: { sha: state.base } };
      else if (path.endsWith('/protection')) value = classic();
      else if (path.startsWith('/rules/branches/')) value = [];
      else if (path.startsWith('/git/commits/')) value = { sha: state.testMerge, parents: [{ sha: state.base }, { sha: state.head }] };
      else if (path.endsWith('/check-runs')) value = { total_count: path.includes(state.head) ? 2 : 0, check_runs: path.includes(state.head) ? checks() : [] };
      else if (path.endsWith('/statuses')) value = [];
      else if (path === '/actions/runs') value = { total_count: 1, workflow_runs: [run()] };
      else if (path.startsWith('/contents/')) {
        const workflow = path.endsWith('ci.yml') ? e.workflows[0] : e.downstream;
        value = { type: 'file', path: workflow.path, sha: workflow.blobSha };
      } else if (path.startsWith('/actions/runs/31')) value = run();
      else if (path === `/actions/runs/${e.qualification.runId}`) value = { id: e.qualification.runId, run_attempt: 1, workflow_id: e.downstream.id,
        path: e.downstream.path, repository: repo, head_repository: repo, event: 'push', head_sha: e.qualification.mergeSha,
        head_branch: e.baseBranch, actor: { id: e.actorId }, triggering_actor: { id: e.actorId }, status: 'completed', conclusion: 'success', check_suite_id: 71 };
      else if (path === '/check-suites/71') value = { id: 71, app: { id: e.downstream.appId }, head_sha: e.qualification.mergeSha, status: 'completed', conclusion: 'success' };
      else throw Error('unexpected read: ' + path);
      const patched = await control.patch(path, structuredClone(value), query, req.method);
      if (patched?.httpStatus) { res.writeHead(patched.httpStatus); res.end('{}'); return; }
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(patched));
    } catch (error) { res.writeHead(500); res.end(JSON.stringify({ fixtureError: error.message })); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  control.url = `http://127.0.0.1:${server.address().port}`;
  control.transport = (url, init) => { const u = new URL(url); return fetch(control.url + u.pathname + u.search, init); };
  t.after(async () => { for (const res of responses) res.destroy(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); db.close(); });
  return control;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { ReportJournal } from '../packages/operations/report-journal.ts';

const binding = { runId: 'run-test', workspaceId: 'workspace-test', path: '/owned/checkout', receiptDigest: 'a'.repeat(64) };
const report = { schemaVersion: '1.0', runId: binding.runId, sessionId: 'session-test', turnId: 'turn-test', commitSha: 'a'.repeat(40),
  status: 'ready', summary: 'Committed', prTitle: 'Implement task', prBody: 'Verified', issueComplete: true };
const rootFor = t => {
  const root = mkdtempSync(join(tmpdir(), 'labstride-report-journal-'));
  t.after(() => rmSync(root, { recursive: true, force: true })); return root;
};

test('a committed report survives actual writer SIGKILL and remains bound to its original receipt and turn', t => {
  const root = rootFor(t);
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import { ReportJournal } from ${JSON.stringify(new URL('../packages/operations/report-journal.ts', import.meta.url).href)};
    const journal = new ReportJournal(${JSON.stringify(root)});
    journal.record(${JSON.stringify(binding)}, 'native-call', ${JSON.stringify(report)});
    process.kill(process.pid, 'SIGKILL');
  `], { encoding: 'utf8', timeout: 10000 });
  assert.equal(child.error, undefined); assert.equal(child.signal, 'SIGKILL', child.stderr);
  const reader = new ReportJournal(root); t.after(() => reader.close());
  assert.deepEqual(reader.read(binding, report.sessionId, report.turnId), report);
  assert.equal(reader.read({ ...binding, receiptDigest: 'b'.repeat(64) }, report.sessionId, report.turnId), null);
  assert.equal(reader.read(binding, 'another-session', report.turnId), null);
  assert.equal(reader.read(binding, report.sessionId, 'another-turn'), null);
  reader.record(binding, 'native-call', report);
  assert.throws(() => reader.record(binding, 'native-call', { ...report, commitSha: 'b'.repeat(40) }), /report_conflict/);
  assert.deepEqual(reader.read(binding, report.sessionId, report.turnId), report);
});

test('an unmanaged journal file is preserved and a symlinked report directory is rejected', t => {
  const root = rootFor(t), directory = join(root, 'managed-reports'); mkdirSync(directory, { mode: 0o700 });
  const file = join(directory, 'reports.sqlite'); writeFileSync(file, 'UNMANAGED', { mode: 0o600 });
  assert.throws(() => new ReportJournal(root));
  assert.equal(readFileSync(file, 'utf8'), 'UNMANAGED');
  const other = rootFor(t); symlinkSync(directory, join(other, 'managed-reports'));
  assert.throws(() => new ReportJournal(other));
  assert.equal(readFileSync(file, 'utf8'), 'UNMANAGED');
});

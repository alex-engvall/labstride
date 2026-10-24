import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import Ajv from 'ajv/dist/2020.js';

const revision = 'a'.repeat(40);
const validate = new Ajv().compile(JSON.parse(readFileSync(new URL('../schemas/cli-version.schema.json', import.meta.url))));

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'labstride-version-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // Reproduce the installed application layout without Git, dependencies,
  // configuration, state, credentials, or a coordinator.
  for (const file of ['apps/cli/main.ts', 'packages/operations/version.ts']) {
    mkdirSync(join(root, file, '..'), { recursive: true });
    copyFileSync(new URL('../' + file, import.meta.url), join(root, file));
  }
  writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  const cwd = join(root, 'unrelated'); mkdirSync(cwd);
  // A working-directory manifest must never supply release identity.
  writeFileSync(join(cwd, 'release-manifest.json'), JSON.stringify({ schemaVersion: '1.0', revision: 'b'.repeat(40) }));
  const run = (args = ['version', '--json'], cliRoot = root) => spawnSync(process.execPath,
    ['--permission', '--allow-fs-read=' + cliRoot, join(cliRoot, 'apps/cli/main.ts'), ...args], {
      cwd, encoding: 'utf8', timeout: 10000,
      // Node permissions prohibit all writes and subprocess creation.
      // No inherited credential/configuration variables and no executable Git.
      env: { PATH: cwd, HOME: cwd, NODE_NO_WARNINGS: '1' },
    });
  return { root, cwd, run, manifest: value => writeFileSync(join(root, 'release-manifest.json'), typeof value === 'string' ? value : JSON.stringify(value)) };
}

function success(result, source, installedRevision) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const value = JSON.parse(result.stdout);
  assert.deepEqual(value, { schemaVersion: '1.0', source, installedRevision, nodeVersion: process.version });
  assert.equal(result.stdout.trim().split('\n').length, 1);
  assert.equal(validate(value), true, JSON.stringify(validate.errors));
}

function failure(result, code) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, '');
  assert.deepEqual(JSON.parse(result.stderr), { schemaVersion: '1.0', code });
}

test('installed release reports packaged source revision and actual Node with no operational access', t => {
  const f = fixture(t);
  f.manifest({ schemaVersion: '1.0', revision, nodeVersion: 'v0.0.0', files: [] });
  success(f.run(), 'release', revision);
  success(f.run(['version']), 'release', revision);
  assert.deepEqual(readdirSync(f.cwd), ['release-manifest.json']);
});

test('development layout reports null without Git, metadata, configuration or writable state', t => {
  const f = fixture(t);
  success(f.run(), 'development', null);
  // Also exercise the actual development checkout, including its package scope.
  success(f.run(['version', '--json'], fileURLToPath(new URL('../', import.meta.url))), 'development', null);
});

test('malformed release metadata fails honestly instead of inventing or falling back to a revision', t => {
  const f = fixture(t);
  for (const value of ['{', 'null', '[]', {}, { schemaVersion: '2.0', revision },
    { schemaVersion: '1.0' }, { schemaVersion: '1.0', revision: 'main' },
    { schemaVersion: '1.0', revision: revision + '\n' }, { schemaVersion: '1.0', revision: null }, { schemaVersion: '1.0', revision: 'a'.repeat(39) }]) {
    f.manifest(value); failure(f.run(), 'release_metadata_invalid');
  }
});

test('unreadable release metadata is an error rather than a development identity', t => {
  const f = fixture(t);
  // EISDIR is deterministic even when the test runner has administrative access.
  mkdirSync(join(f.root, 'release-manifest.json'));
  failure(f.run(), 'release_metadata_unreadable');
});

test('permission-denied release metadata is an error', { skip: process.getuid?.() === 0 ? 'root bypasses file read permissions' : false }, t => {
  const f = fixture(t); f.manifest({ schemaVersion: '1.0', revision });
  chmodSync(join(f.root, 'release-manifest.json'), 0);
  failure(f.run(), 'release_metadata_unreadable');
});

test('unsupported version arguments produce stable usage errors before operational initialization', t => {
  const f = fixture(t);
  for (const args of [['version', 'extra'], ['version', '--json', '--json'], ['version', '--config', 'missing.json'], ['version', '--json', 'extra']]) {
    failure(f.run(args), 'usage');
  }
});

test('output schema rejects conflicting source/revision pairs', () => {
  const base = { schemaVersion: '1.0', nodeVersion: process.version };
  assert.equal(validate({ ...base, source: 'release', installedRevision: null }), false);
  assert.equal(validate({ ...base, source: 'development', installedRevision: revision }), false);
});


test('operational CLI init still creates a disabled template and refuses overwrite', async t => {
  const f = fixture(t);
  const { cli } = await import('../apps/cli/main.ts');
  const destination = join(f.root, 'disabled-installation.json'), output = [];
  await cli(['init', destination], value => output.push(value));
  assert.deepEqual(output, [{ schemaVersion: '1.0', enabled: false, code: 'configure_before_activation' }]);
  assert.equal(JSON.parse(readFileSync(destination)).configuration.enabled, false);
  await assert.rejects(cli(['init', destination]), { code: 'EEXIST' });
});

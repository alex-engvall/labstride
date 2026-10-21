import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'labstride-type-generator-'));
  try {
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, 'schemas'));
    mkdirSync(join(root, 'contracts/generated'), { recursive: true });
    copyFileSync(new URL('../scripts/generate_types.mjs', import.meta.url), join(root, 'scripts/generate_types.mjs'));
    // Resolve the installed compiler without copying or modifying its dependencies.
    symlinkSync(fileURLToPath(new URL('../node_modules', import.meta.url)), join(root, 'node_modules'), 'dir');
    const schema = (name, value) => writeFileSync(join(root, 'schemas', name), JSON.stringify(value));
    schema('a.schema.json', { title: 'A', type: 'object', properties: { value: { $ref: 'z.schema.json' } }, required: ['value'] });
    schema('z.schema.json', { title: 'Z', type: 'string' });
    const generate = (...args) => spawnSync(process.execPath, [join(root, 'scripts/generate_types.mjs'), ...args],
      { encoding: 'utf8', timeout: 15000 });
    run({ root, schema, generate });
  } finally { rmSync(root, { recursive: true }); }
}

const rejected = (result, pattern) => {
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stderr, pattern);
};

test('generator resolves inventory references, detects drift and restores reproducible output', () => fixture(({ root, generate }) => {
  let result = generate(); assert.equal(result.status, 0, result.stderr);
  const output = join(root, 'contracts/generated/a.ts');
  const original = readFileSync(output, 'utf8');
  assert.match(original, /value: Z/);
  result = generate('--check'); assert.equal(result.status, 0, result.stderr);
  writeFileSync(output, original + '// drift\n');
  rejected(generate('--check'), /Stale generated type: a.ts/);
  assert.equal(readFileSync(output, 'utf8'), original + '// drift\n');
  result = generate(); assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(output, 'utf8'), original);
}));

test('generator validates every transitive reference before compilation or writes', () => fixture(({ root, schema, generate }) => {
  const output = join(root, 'contracts/generated/a.ts'); writeFileSync(output, 'PRESERVE');
  // Outside bytes are deliberately invalid JSON: only the inventory rejection should be observed.
  writeFileSync(join(root, 'outside.schema.json'), 'INVALID OUTSIDE JSON');
  for (const ref of ['../outside.schema.json', 'https://example.invalid/schema.json', 'file:///unmanaged.schema.json']) {
    schema('z.schema.json', { type: 'object', properties: { value: { $ref: ref } } });
    rejected(generate(), /Unapproved schema reference/);
    assert.equal(readFileSync(output, 'utf8'), 'PRESERVE');
  }
}));

test('generator refuses symlinked schema files', () => fixture(({ root, generate }) => {
  const source = join(root, 'schemas/z.schema.json');
  const outside = join(root, 'unmanaged.schema.json');
  copyFileSync(source, outside); rmSync(source); symlinkSync(outside, source);
  rejected(generate(), /Expected regular file without links/);
}));

for (const kind of ['symbolic', 'hard']) test(`generator preserves ${kind} linked output and every earlier output`, () => fixture(({ root, generate }) => {
  const outside = join(root, 'unmanaged.txt'); writeFileSync(outside, 'PRESERVE');
  const earlier = join(root, 'contracts/generated/a.ts'); writeFileSync(earlier, 'EARLIER');
  const destination = join(root, 'contracts/generated/z.ts');
  if (kind === 'symbolic') symlinkSync(outside, destination);
  else linkSync(outside, destination);
  for (const args of [[], ['--check']]) {
    rejected(generate(...args), /Expected regular file without links/);
    assert.equal(readFileSync(outside, 'utf8'), 'PRESERVE');
    assert.equal(readFileSync(earlier, 'utf8'), 'EARLIER');
  }
}));

test('generator refuses linked output directories and parents', () => {
  for (const name of ['contracts', 'contracts/generated']) fixture(({ root, generate }) => {
    const outside = join(root, 'unmanaged'); mkdirSync(outside);
    const marker = join(outside, 'marker'); writeFileSync(marker, 'PRESERVE');
    const destination = join(root, name); rmSync(destination, { recursive: true });
    symlinkSync(outside, destination, 'dir');
    rejected(generate(), /Expected directory without links/);
    assert.equal(readFileSync(marker, 'utf8'), 'PRESERVE');
  });
});

test('generator preserves unmanaged entries before writing any output', () => fixture(({ root, generate }) => {
  const earlier = join(root, 'contracts/generated/a.ts'); writeFileSync(earlier, 'EARLIER');
  const unmanaged = join(root, 'contracts/generated/notes.txt'); writeFileSync(unmanaged, 'PRESERVE');
  rejected(generate(), /Unmanaged generated-directory entry/);
  assert.equal(readFileSync(earlier, 'utf8'), 'EARLIER');
  assert.equal(readFileSync(unmanaged, 'utf8'), 'PRESERVE');
}));

test('generator preserves directories occupying expected file names', () => fixture(({ root, generate }) => {
  mkdirSync(join(root, 'contracts/generated/z.ts'));
  rejected(generate(), /Expected regular file without links/);
}));

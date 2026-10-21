import { compileFromFile } from 'json-schema-to-typescript';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const schemas = path.join(root, 'schemas');
const output = path.join(root, 'contracts/generated');
const check = process.argv.includes('--check');
const names = (await readdir(schemas)).filter(n => n.endsWith('.schema.json')).sort();
// Resolve only the reviewed local schema inventory, never HTTP or outside paths.
function checkReferences(value) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.$ref === 'string' && !value.$ref.startsWith('#')) {
    const [file] = value.$ref.split('#');
    if (!names.includes(file)) throw new Error(`Unapproved schema reference: ${file}`);
  }
  for (const child of Object.values(value)) checkReferences(child);
}
const expected = new Map();
for (const name of names) {
  const source = path.join(schemas, name);
  const schema = JSON.parse(await readFile(source, 'utf8'));
  checkReferences(schema);
  if (name === 'contract-common.schema.json') continue;
  const text = await compileFromFile(source, {
    bannerComment: '/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */',
    unknownAny: true,
    unreachableDefinitions: false,
    $refOptions: { resolve: { http: false } },
  });
  expected.set(name.replace('.schema.json', '.ts'), text);
}
let current = [];
try { current = await readdir(output); } catch (e) { if (e.code !== 'ENOENT') throw e; }
for (const name of current) {
  if (!expected.has(name)) throw new Error(`Unmanaged generated-directory entry: ${name}; preserved`);
}
if (!check) await mkdir(output, { recursive: true });
for (const [name, text] of expected) {
  const destination = path.join(output, name);
  if (check) {
    let actual;
    try { actual = await readFile(destination, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (actual !== text) throw new Error(`Stale generated type: ${name}; run npm run generate:types`);
  } else {
    await writeFile(destination, text);
  }
}
console.log(`${check ? 'Checked' : 'Generated'} ${expected.size} schema-derived TypeScript files`);

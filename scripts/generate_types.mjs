import { compile } from 'json-schema-to-typescript';
import { readFile, readdir, mkdir, writeFile, lstat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const schemas = path.join(root, 'schemas');
const output = path.join(root, 'contracts/generated');
const check = process.argv.includes('--check');

async function directory(location, optional = false) {
  let stat;
  try { stat = await lstat(location); } catch (error) {
    if (optional && error.code === 'ENOENT') return;
    throw error;
  }
  if (!stat.isDirectory()) throw new Error(`Expected directory without links: ${location}; preserved`);
}

async function regularFile(location) {
  const stat = await lstat(location);
  if (!stat.isFile() || stat.nlink !== 1) throw new Error(`Expected regular file without links: ${location}; preserved`);
}

await directory(schemas);
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
// Snapshot and validate the entire inventory before the compiler resolves any reference.
const inventory = new Map();
for (const name of names) {
  const source = path.join(schemas, name);
  await regularFile(source);
  const schema = JSON.parse(await readFile(source, 'utf8'));
  checkReferences(schema);
  inventory.set(source, schema);
  inventory.set(pathToFileURL(source).href, schema);
}

// Preflight every output before writing any of them. Preserve unmanaged paths.
await directory(path.dirname(output), true);
await directory(output, true);
const expectedNames = new Set(names.filter(n => n !== 'contract-common.schema.json').map(n => n.replace('.schema.json', '.ts')));
let current = [];
try { current = await readdir(output); } catch (e) { if (e.code !== 'ENOENT') throw e; }
for (const name of current) {
  if (!expectedNames.has(name)) throw new Error(`Unmanaged generated-directory entry: ${name}; preserved`);
  await regularFile(path.join(output, name));
}

const expected = new Map();
for (const name of names) {
  if (name === 'contract-common.schema.json') continue;
  const source = path.join(schemas, name);
  const text = await compile(inventory.get(source), source.replace(/\.json$/, ''), {
    cwd: schemas,
    bannerComment: '/* Generated from schemas/*.schema.json. Run npm run generate:types; do not edit. */',
    unknownAny: true,
    unreachableDefinitions: false,
    $refOptions: { resolve: {
      file: false, http: false,
      inventory: {
        order: 1,
        canRead: true,
        read(file) {
          if (!inventory.has(file.url)) throw new Error(`Unapproved schema location: ${file.url}`);
          return JSON.stringify(inventory.get(file.url));
        },
      },
    } },
  });
  expected.set(name.replace('.schema.json', '.ts'), text);
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

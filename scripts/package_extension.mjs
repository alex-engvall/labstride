// Package an operator-reviewed, self-contained ESM source; no install, download or source rewriting.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { validate } from '../tools/conformance/schema.mjs';
if (process.argv.length !== 4) throw new Error('Usage: node scripts/package_extension.mjs SOURCE_DIRECTORY NEW_ARTIFACT_PATH');
const directory = resolve(process.argv[2]);
const manifest = JSON.parse(readFileSync(join(directory, 'extension.json'), 'utf8'));
// Inline reviewed local references for the loader's deliberately local-only
// artifact schemas. No URL, package or user-payload reference is resolved.
function bundled(name) {
  const inventory = new Map();
  function expand(value, source) {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(item => expand(item, source));
    if (value.$ref) {
      const [file, fragment = ''] = value.$ref.split('#');
      if (file && !/^[a-z0-9-]+\.schema\.json$/.test(file)) throw Error('Unapproved schema reference');
      const key = file || source;
      if (!inventory.has(key)) inventory.set(key, JSON.parse(readFileSync(new URL(`../schemas/${key}`, import.meta.url), 'utf8')));
      let selected = inventory.get(key);
      if (fragment) for (const part of fragment.replace(/^\//, '').split('/')) selected = selected[part];
      return expand(selected, key);
    }
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== '$schema').map(([key, item]) => [key, expand(item, source)]));
  }
  return expand({ $ref: `${name}.schema.json` }, `${name}.schema.json`);
}
const connector = manifest.kind === 'connector';
if (connector && manifest.id !== 'labstride.connector.ssh') throw Error('Provide reviewed schemas for this connector');
const sessionCommand = manifest.kind === 'action' && manifest.id === 'labstride.session-command';
const workspace = manifest.kind === 'action' && manifest.id === 'labstride.workspace-create';
const runtime = manifest.kind === 'action' && manifest.id === 'labstride.runtime-create';
const githubProvider = manifest.kind === 'provider' && manifest.id === 'labstride.github.native';
const selfBuild = manifest.kind === 'action' && manifest.id === 'labstride.self-build';
const runtimeConnector = connector && manifest.capabilities.includes('runtime.create.v1');
const artifact = validate('extension-artifact', { schemaVersion: '1.0',
  manifest,
  module: readFileSync(join(directory, 'index.mjs'), 'utf8'), schemas: {
    configuration: JSON.parse(readFileSync(join(directory, 'configuration.schema.json'), 'utf8')),
    input: githubProvider ? {type:'object'} : connector ? { anyOf: [bundled('ssh-helper-request'),bundled('ssh-workspace-request'),...(runtimeConnector?[bundled('ssh-runtime-request')]:[])] } : selfBuild ? bundled('self-build-input') : runtime ? bundled('runtime-create-input') : workspace ? bundled('workspace-create-input') : sessionCommand ? {type:'object',additionalProperties:false,properties:{sessionCommand:bundled('session-command')},required:['sessionCommand']} : JSON.parse(readFileSync(new URL('../schemas/session-request.schema.json', import.meta.url), 'utf8')),
    output: githubProvider ? {type:'object'} : connector ? { anyOf: [bundled('ssh-helper-response'),bundled('ssh-workspace-response'),...(runtimeConnector?[bundled('ssh-runtime-response')]:[])] } : runtime || workspace || sessionCommand || selfBuild ? bundled('execution-record') : JSON.parse(readFileSync(new URL('../schemas/session-observation.schema.json', import.meta.url), 'utf8')),
  } });
const bytes = Buffer.from(JSON.stringify(artifact));
if (bytes.length > 262144) throw new Error('Artifact exceeds 256 KiB');
writeFileSync(resolve(process.argv[3]), bytes, { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify({ id: artifact.manifest.id, version: artifact.manifest.version, integrity: createHash('sha256').update(bytes).digest('hex') }));

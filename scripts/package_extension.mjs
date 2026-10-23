// Package an operator-reviewed, self-contained ESM source; no install, download or source rewriting.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { validate } from '../tools/conformance/schema.mjs';
if (process.argv.length !== 4) throw new Error('Usage: node scripts/package_extension.mjs SOURCE_DIRECTORY NEW_ARTIFACT_PATH');
const directory = resolve(process.argv[2]);
const artifact = validate('extension-artifact', { schemaVersion: '1.0',
  manifest: JSON.parse(readFileSync(join(directory, 'extension.json'), 'utf8')),
  module: readFileSync(join(directory, 'index.mjs'), 'utf8'), schemas: {
    configuration: JSON.parse(readFileSync(join(directory, 'configuration.schema.json'), 'utf8')),
    input: JSON.parse(readFileSync(new URL('../schemas/session-request.schema.json', import.meta.url), 'utf8')),
    output: JSON.parse(readFileSync(new URL('../schemas/session-observation.schema.json', import.meta.url), 'utf8')),
  } });
const bytes = Buffer.from(JSON.stringify(artifact));
if (bytes.length > 262144) throw new Error('Artifact exceeds 256 KiB');
writeFileSync(resolve(process.argv[3]), bytes, { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify({ id: artifact.manifest.id, version: artifact.manifest.version, integrity: createHash('sha256').update(bytes).digest('hex') }));

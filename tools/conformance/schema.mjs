import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readdirSync, readFileSync } from 'node:fs';

const directory = new URL('../../schemas/', import.meta.url);
const ajv = new Ajv2020({ strict: true, strictRequired: false, allowUnionTypes: true });
addFormats(ajv, { mode: 'full' });
for (const name of readdirSync(directory).filter(n => n.endsWith('.schema.json'))) {
  const url = new URL(name, directory);
  ajv.addSchema(JSON.parse(readFileSync(url, 'utf8')), url.href);
}
export function validate(name, value) {
  const bytes = Buffer.byteLength(JSON.stringify(value));
  if (bytes > 256 * 1024) throw new Error('validation_failed: payload exceeds 256 KiB');
  const validator = ajv.getSchema(new URL(`${name}.schema.json`, directory).href);
  if (!validator || !validator(value)) throw new Error(`validation_failed: ${name}`);
  return value;
}

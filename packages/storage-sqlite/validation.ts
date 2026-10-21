import { Ajv2020 } from 'ajv/dist/2020.js';
import type { FormatsPlugin } from 'ajv-formats';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { LifecycleError } from '../core/lifecycle.ts';
import type { LifecycleRecord, AuditRecord } from '../core/lifecycle.ts';

const directory = new URL('../../schemas/', import.meta.url);
const ajv = new Ajv2020({ strict: true, strictRequired: false, allowUnionTypes: true });
const addFormats: FormatsPlugin = createRequire(import.meta.url)('ajv-formats');
addFormats(ajv, { mode: 'full' });
for (const name of readdirSync(directory).filter(name => name.endsWith('.schema.json')))
  ajv.addSchema(JSON.parse(readFileSync(new URL(name, directory), 'utf8')), new URL(name, directory).href);

export function validated<T extends LifecycleRecord | AuditRecord>(name: 'lifecycle-record' | 'lifecycle-audit', value: T): T {
  try {
    const serialized = JSON.stringify(value, (_key, item: unknown) => {
      if (item === undefined || ['function', 'symbol', 'bigint'].includes(typeof item) ||
        (typeof item === 'number' && !Number.isFinite(item))) throw new Error();
      return item;
    });
    if (Buffer.byteLength(serialized) > 256 * 1024) throw new Error();
    const copy: unknown = JSON.parse(serialized);
    if (!ajv.getSchema(new URL(`${name}.schema.json`, directory).href)!(copy)) throw new Error();
    return copy as T;
  } catch { throw new LifecycleError('invalid_payload'); }
}

import type { LabstrideInstallationConfigurationV1 as Configuration } from '../../contracts/generated/config.ts';
import { canonical } from './json.ts';

export type Field = Configuration['fields'][string];
export type Value = string | number | boolean | null | string[];
export class ConfigurationError extends Error {
  readonly code: 'configuration_invalid' | 'unsupported_capability' | 'invalid_value' | 'binding_invalid' | 'rule_conflict';
  readonly path: string;
  constructor(code: ConfigurationError['code'], path: string, message: string) {
    super(message); this.code = code; this.path = path;
  }
}
export function invalid(path: string, message: string): never {
  throw new ConfigurationError('configuration_invalid', path, message);
}
export const own = <T>(map: Record<string, T>, key: string): T | undefined => Object.hasOwn(map, key) ? map[key] : undefined;
const normalized = (value: unknown): unknown => Array.isArray(value) && value.every(item => typeof item === 'string') ? [...value].sort() : value;
export const same = (a: unknown, b: unknown): boolean => canonical(normalized(a)) === canonical(normalized(b));
export function fieldValue(field: Field, value: Value, logical = false): Value {
  const path = '/fields';
  if (value === null) return null;
  const option = (key: string): string => {
    if (!logical) {
      if (!Object.values(field.options ?? {}).includes(key)) throw new ConfigurationError('invalid_value', path, 'Refresh unknown option IDs; no default is applied.');
      return key;
    }
    const id = own(field.options ?? {}, key);
    if (!id) invalid(path, 'Configure every referenced logical option.');
    return id;
  };
  switch (field.type) {
    case 'string': if (typeof value === 'string') return value; break;
    case 'boolean': if (typeof value === 'boolean') return value; break;
    case 'number': if (typeof value === 'number' && Number.isFinite(value)) return value; break;
    case 'date':
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value) return value;
      break;
    case 'single-select': if (typeof value === 'string') return option(value); break;
    case 'multi-select': if (Array.isArray(value) && value.every(x => typeof x === 'string') && new Set(value).size === value.length)
      return value.map(option).sort(); break;
  }
  throw new ConfigurationError('invalid_value', path, 'Supply a value of the configured field type.');
}

import { readFileSync } from 'node:fs';
import type { LabstrideVersionV1 } from '../../contracts/generated/cli-version.ts';

/** Release identity comes from the installer-verified, protected release root. */
export function versionInfo(): LabstrideVersionV1 {
  let raw: string;
  try {
    raw = readFileSync(new URL('../../release-manifest.json', import.meta.url), 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { schemaVersion: '1.0', source: 'development', installedRevision: null, nodeVersion: process.version };
    }
    throw Error('release_metadata_unreadable');
  }
  let manifest: unknown;
  try { manifest = JSON.parse(raw); } catch { throw Error('release_metadata_invalid'); }
  if (!manifest || typeof manifest !== 'object' || !('schemaVersion' in manifest) || manifest.schemaVersion !== '1.0' ||
      !('revision' in manifest) || typeof manifest.revision !== 'string' || manifest.revision.length !== 40 || !/^[a-f0-9]{40}$/.test(manifest.revision)) {
    throw Error('release_metadata_invalid');
  }
  return { schemaVersion: '1.0', source: 'release', installedRevision: manifest.revision, nodeVersion: process.version };
}

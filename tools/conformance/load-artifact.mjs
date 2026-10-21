// A bounded fixture gate for trusted synthetic modules, not a production loader or sandbox.
import { createHash } from 'node:crypto';
import { validate } from './schema.mjs';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export async function loadFixture(bytes, pin, host) {
  const strings = value => Array.isArray(value) && value.every(x => typeof x === 'string' && x.length > 0);
  if (!host || !Number.isInteger(host.protocol?.major) || host.protocol.major < 1 ||
      !Number.isInteger(host.protocol?.minor) || host.protocol.minor < 0 || host.protocol.minor > 65535 ||
      !['capabilities', 'extensionCapabilities', 'permissions'].every(key => strings(host[key])) ||
      (host.requiredExtensionCapabilities !== undefined && !strings(host.requiredExtensionCapabilities))) {
    throw new Error('invalid_host_profile');
  }
  if (!Buffer.isBuffer(bytes) || bytes.length > 256 * 1024) throw new Error('invalid_artifact');
  // Hash the exact bytes that will be parsed/imported, including the manifest.
  if (!/^[a-f0-9]{64}$/.test(pin.integrity) || sha256(bytes) !== pin.integrity) throw new Error('integrity_mismatch');
  const artifact = JSON.parse(bytes.toString('utf8'));
  if (Object.keys(artifact).sort().join(',') !== 'manifest,module,schemaVersion' ||
      artifact.schemaVersion !== '1.0' || typeof artifact.module !== 'string') throw new Error('invalid_artifact');
  const manifest = validate('extension', artifact.manifest);
  if (manifest.id !== pin.id || manifest.version !== pin.version || manifest.kind !== pin.kind) throw new Error('identity_mismatch');
  if (manifest.protocol.major !== host.protocol.major) throw new Error('protocol_major_mismatch');
  for (const capability of manifest.requiredCapabilities) {
    if (!host.capabilities.includes(capability)) throw new Error('unsupported_required_capability');
  }
  for (const permission of manifest.permissions) {
    if (!host.permissions.includes(permission)) throw new Error('forbidden_permission');
  }
  const capabilities = manifest.capabilities.filter(c => host.extensionCapabilities.includes(c)).sort();
  for (const capability of host.requiredExtensionCapabilities ?? []) {
    if (!capabilities.includes(capability)) throw new Error('missing_extension_capability');
  }
  const protocol = { major: host.protocol.major, minor: Math.min(host.protocol.minor, manifest.protocol.minor) };
  const module = await import(`data:text/javascript;base64,${Buffer.from(artifact.module).toString('base64')}`);
  return { module, protocol, capabilities };
}

export function validateRequest(request) {
  validate('contract-request', request);
  if (request.family === 'session-provider' && request.method !== 'capabilities' &&
      request.input.providerId !== request.extensionId) throw new Error('identity_mismatch');
  if (request.family === 'action' && request.input.operation &&
      request.input.operation.actionId !== request.extensionId) throw new Error('identity_mismatch');
  return request;
}

export function validateResponse(request, response) {
  validateRequest(request);
  validate('contract-result', response);
  for (const key of ['requestId', 'extensionId', 'family', 'method']) {
    if (request[key] !== response[key]) throw new Error('identity_mismatch');
  }
  if (request.protocol.major !== response.protocol.major || request.protocol.minor !== response.protocol.minor) {
    throw new Error('protocol_mismatch');
  }
  if (response.outcome === 'ok') {
    if (request.family === 'session-provider' && request.method !== 'capabilities' &&
        (response.result.providerId !== request.extensionId || response.result.workspaceId !== request.input.workspaceId ||
         (request.method !== 'start' && response.result.sessionId !== request.input.sessionId))) throw new Error('identity_mismatch');
    if (request.family === 'provider' && request.input.subjectId &&
        response.result.subjectId !== request.input.subjectId) throw new Error('identity_mismatch');
    if (request.family === 'connector' && request.method === 'probe' &&
        response.result.targetId !== request.input.targetId) throw new Error('identity_mismatch');
  }
  return response;
}

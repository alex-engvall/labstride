import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { freezeProfile } from '../../packages/extensions/loader.ts';
import { digest, requestDigest } from '../../packages/storage-sqlite/execution.ts';
import { bindCommand } from '../../packages/core/sessions.ts';
import { seed, startPlan, eventInput, context } from './execution-fixture.mjs';
export { context };
export const host = { protocol: { major: 1, minor: 0 }, capabilities: [], permissions: ['session.manage','filesystem.workspace'] };
export function installed(root, kind = 'fixture', configuration = {}) {
  const dir = new URL(`../../packages/session-${kind}/`, import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('extension.json',dir),'utf8'));
  const artifact = { schemaVersion: '1.0', manifest, module: readFileSync(new URL('index.mjs',dir),'utf8'), schemas: {
    configuration: JSON.parse(readFileSync(new URL('configuration.schema.json',dir),'utf8')),
    input: JSON.parse(readFileSync(new URL('../../schemas/session-request.schema.json',import.meta.url),'utf8')),
    output: JSON.parse(readFileSync(new URL('../../schemas/session-observation.schema.json',import.meta.url),'utf8')),
  } };
  const bytes = Buffer.from(JSON.stringify(artifact)), artifactPath = join(root,`${kind}.artifact.json`);
  writeFileSync(artifactPath,bytes);
  return { artifact, bytes, pin: { id: manifest.id, version: manifest.version, kind: manifest.kind,
    integrity: createHash('sha256').update(bytes).digest('hex'), artifactPath,
    permissions: manifest.permissions, capabilities: manifest.capabilities,
    configuration: { providerId: manifest.id, backendIdentity: 'test-backend', databasePath: join(root,`${kind}-backend.sqlite`), ...configuration } } };
}
export function setup(store, root, kind = 'fixture', configuration = {}) {
  seed(store);
  const plan = startPlan(), pkg = installed(root,kind,configuration);
  const profile = freezeProfile(plan.run.id,plan.run.configRevision,pkg.pin,host);
  const request = { schemaVersion: '1.0', operationId: plan.operation.id, workspaceId: plan.workspace.id,
    providerId: pkg.pin.id, command: 'start', sessionId: null, expectedLastTurnId: null, expectedHumanActivityRevision: 0, input: {} };
  const command = { schemaVersion: '1.0', enrollmentId: 'enrollment-test', backendIdentity: 'test-backend', profileDigest: digest(profile), request };
  plan.operation = bindCommand(plan.operation,command); plan.operation.request.requestDigest=requestDigest(plan.operation.request);
  plan.projections=[];
  store.scheduleStart(store.receive(eventInput()).id,plan,context);store.pinProfile(profile,context);store.registerSessionCommand(plan.operation.id,command,context);
  return { store, root, plan, pkg, profile, command };
}
export function follow(f, name, command, automation) {
  const operation=structuredClone(f.plan.operation),outbox=structuredClone(f.plan.outbox);
  operation.id=`operation:${name}`;operation.request.operationId=operation.id;
  const session=f.store.get('session',f.command.enrollmentId);
  const descriptor={...f.command,request:{...f.command.request,operationId:operation.id,command,sessionId:session.sessionId,
    expectedLastTurnId:session.lastTurnId,expectedHumanActivityRevision:session.humanActivityRevision}};
  const bound=bindCommand(operation,descriptor);bound.request.requestDigest=requestDigest(bound.request);
  outbox.id=`outbox:${name}`;outbox.operationId=operation.id;outbox.intentKey=`intent:${name}`;outbox.payload.operationId=operation.id;
  f.store.scheduleOperation({operation:bound,outbox,resourceKey:`session:${session.id}`,automation},context);
  f.store.registerSessionCommand(operation.id,descriptor,context);return {operation:bound,command:descriptor};
}

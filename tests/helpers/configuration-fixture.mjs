import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileConfiguration } from '../../packages/configuration/compiler.ts';
import { startPlan, context, timestamp } from './execution-fixture.mjs';
import { requestDigest } from '../../packages/storage-sqlite/execution.ts';
export { context, timestamp };

export function configurationFixture(root, variant = 'a') {
  const names = variant === 'a' ? { request: 'request', status: 'status', keep: 'keep', note: 'note' } :
    { request: 'dispatch', status: 'technical', keep: 'retain', note: 'message' };
  const markerPath = join(root, `imported-${variant}`), databasePath = join(root, `effects-${variant}.sqlite`);
  const host = { protocol: { major: 1, minor: 0 }, capabilities: [], permissions: ['network.github','network.ssh','filesystem.workspace'] };
  const source = startPlan().operation.request.source;
  const config = {
    schemaVersion: '1.0', installationId: `installation-${variant}`, enabled: true,
    broker: { url: 'https://coordinator.test', oidcAudience: `labstride:${variant}` },
    github: { repositories: [source.repository], actorIds: [context.actorId], credentialRef: 'secret:repository', projectCredentialRef: 'secret:project', pollIntervalSeconds: 60 },
    fields: {
      [names.request]: { source: 'project_v2', scopeId: `scope-${variant}`, fieldId: `request-${variant}`, type: 'single-select', options: { go: `go-${variant}`, wait: `wait-${variant}` } },
      [names.status]: { source: 'project_v2', scopeId: `scope-${variant}`, fieldId: `status-${variant}`, type: 'single-select', options: { busy: `busy-${variant}` } },
      [names.keep]: { source: 'native_issue', scopeId: `repo-${variant}`, fieldId: `keep-${variant}`, type: 'boolean' },
      [names.note]: { source: 'native_issue', scopeId: `repo-${variant}`, fieldId: `note-${variant}`, type: 'string' },
    },
    targets: { [`target-${variant}`]: { connector: 'test.connector', configuration: { root: join(root, `owned-${variant}`) } } },
    extensions: [], extensionConfiguration: {},
    limits: { activeRuns: 2, perIssue: 1, perDeploymentTarget: 1, metadataRetentionDays: 90 },
    rules: [{ id: 'start', event: 'field.changed', condition: { field: names.request, op: 'changedTo', value: 'go' }, workflow: 'prepare' }],
    workflows: { prepare: [{ id: 'record', action: 'test.action', inputs: { target: `target-${variant}`, source: 'context.source', note: { binding: 'field', field: names.note } } }] },
    projections: [{ fact: 'workspace.preparing', field: names.status, value: 'busy' }],
    controls: { keep: { field: names.keep, enabledValues: [true], disabledValues: [false] } },
  };
  const descriptors = Object.fromEntries(Object.entries(config.fields).map(([name, field]) => [field.fieldId, {
    schemaVersion: '1.0', providerId: 'test.provider', credentialRef: field.source === 'project_v2' ? 'secret:project' : 'secret:repository',
    source: field.source, scopeId: field.scopeId, fieldId: field.fieldId, type: field.type, optionIds: Object.values(field.options ?? {}),
    operators: ['equals','notEquals','contains','exists','changedTo'], readable: true, writable: true, history: true, actorAttribution: true,
    evidenceRefs: [`test:qualified-${name}`],
  }]));
  const inputSchema = { type: 'object', additionalProperties: false, properties: {
    target: { type: 'string' }, source: { type: 'object', additionalProperties: false, properties: { repositoryId: { type:'string' }, repository: { type:'string' }, sha: { type:'string', pattern:'^[a-f0-9]{40}$' } }, required:['repositoryId','repository','sha'] },
    note: { type: 'string' }, count: { type: 'number' }, literal: { anyOf: ['object','array','string','number','boolean','null'].map(type => ({ type })) },
  }, required: ['target','source','note'] };
  const actionModule = `import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';
writeFileSync(${JSON.stringify(markerPath)}, 'imported');
export function createExtension(configuration) {
  function open() { const db = new DatabaseSync(configuration.databasePath); db.exec('CREATE TABLE IF NOT EXISTS calls (id INTEGER PRIMARY KEY, operation_id TEXT, inputs TEXT); CREATE TABLE IF NOT EXISTS results (id TEXT PRIMARY KEY, payload TEXT)'); return db; }
  return {
    async validate() {},
    async start(operation) {
      const db = open();
      const result = { schemaVersion:'1.0', kind:'result', operationId:operation.operationId, requestDigest:operation.requestDigest,
        result:{status:'succeeded',handle:operation.operationId,resources:[],outputs:{},evidenceRefs:['test:durable-action'],error:null} };
      db.exec('BEGIN IMMEDIATE'); db.prepare('INSERT INTO calls(operation_id,inputs) VALUES (?,?)').run(operation.operationId,JSON.stringify(operation.inputs));
      db.prepare('INSERT OR IGNORE INTO results VALUES (?,?)').run(operation.operationId,JSON.stringify(result)); db.exec('COMMIT'); db.close(); return result;
    },
    async reconcile(operation) {
      const db=open(); const row=db.prepare('SELECT payload FROM results WHERE id=?').get(operation.operationId); db.close();
      if(row) return JSON.parse(row.payload);
      return {schemaVersion:'1.0',kind:'result',operationId:operation.operationId,requestDigest:operation.requestDigest,
        result:{status:'outcome_unknown',handle:null,resources:[],outputs:{},evidenceRefs:[],error:{code:'outcome_unknown',message:'No recorded result',evidenceId:null,retryClass:'reconcile'}}};
    },
  };
}`;
  const lock = { schemaVersion: '1.0', extensions: ['provider','connector','action'].map(kind => {
    const id = `test.${kind}`, permissions = [kind === 'provider' ? 'network.github' : kind === 'connector' ? 'network.ssh' : 'filesystem.workspace'];
    const configuration = kind === 'action' ? { databasePath } : kind === 'connector' ? config.targets[`target-${variant}`].configuration : {};
    const configurationSchema = { type: 'object', additionalProperties: false, properties: kind === 'action' ? { databasePath: { type:'string' } } : kind === 'connector' ? { root: { type:'string' } } : {}, required: Object.keys(configuration) };
    const artifact = { schemaVersion:'1.0', manifest: { schemaVersion:'1.0', id, version:'1.0.0', kind, protocol:{major:1,minor:0}, entrypoint:'module',
      capabilities:[`test.${kind}.v1`], requiredCapabilities:[], permissions, inputSchema:'input', outputSchema:'output' },
      schemas: { configuration: configurationSchema, input: kind === 'action' ? inputSchema : { type:'object' }, output: { type:'object' } },
      module: kind === 'action' ? actionModule : 'export function createExtension() { throw Error("preflight must not evaluate modules"); }',
    };
    const artifactPath = join(root, `${kind}-${variant}.artifact.json`), bytes = JSON.stringify(artifact);
    writeFileSync(artifactPath, bytes);
    // Artifact integrity hashes bytes, not the canonical JSON digest.
    return { id, version:'1.0.0', kind, artifactPath, configuration, permissions, capabilities:[`test.${kind}.v1`], integrity: '' };
  }) };
  // Kept separate so mutations to config cannot select a different artifact path.
  const dependencies = { lock, host, secrets: { exists: reference => ['secret:repository','secret:project'].includes(reference) },
    provider: { describeField(field) { const descriptor = descriptors[field.fieldId]; if (!descriptor) throw Error('not found'); return structuredClone(descriptor); } } };
  return { root, names, config, descriptors, dependencies, source, markerPath, databasePath, inputSchema,
    async compile() {
      const { createHash } = await import('node:crypto');
      for (const pin of lock.extensions) if (!pin.integrity) pin.integrity = createHash('sha256').update(readFileSync(pin.artifactPath)).digest('hex');
      if (!config.extensions.length) config.extensions = lock.extensions.map(({ id,version,integrity }) => ({ id,version,integrity }));
      return compileConfiguration(config, dependencies);
    },
  };
}
export function observation(f, compiled, fields = {}) {
  return { schemaVersion:'1.0', configDigest: compiled.snapshot.digest, initialSync:false, generation:1,
    event:{schemaVersion:'1.0',eventId:'configured-event',installationId:f.config.installationId,provider:'test.provider',kind:'field.changed',origin:'human',externalId:'configured-event',subjectId:'issue-test',actorId:context.actorId,occurredAt:timestamp,observedAt:timestamp,sourceVersion:'opaque-v1',facts:{}},
    current:{[f.names.request]:{present:true,value:f.config.fields[f.names.request].options.go},[f.names.note]:{present:true,value:'literal field text'},[f.names.keep]:{present:true,value:false},...fields},
    previous:{[f.names.request]:{present:true,value:f.config.fields[f.names.request].options.wait}},
  };
}
export function planFor(f, compiled, suffix = '') {
  return (steps, observed) => {
    const plan = startPlan();
    for (const key of ['request','run','workspace','operation','outbox']) plan[key].id += suffix;
    plan.request.installationId = f.config.installationId; plan.request.providerId = observed.event.provider; plan.request.issueId=observed.event.subjectId;plan.request.generation=observed.generation;
    plan.run.requestId=plan.request.id; plan.run.configRevision=compiled.snapshot.digest;
    plan.workspace.runId=plan.run.id; plan.workspace.targetId=`target-${f.config.installationId.slice(-1)}`; plan.workspace.locator+=suffix;plan.workspace.branch+=suffix;
    plan.operation.runId=plan.run.id;plan.operation.workspaceId=plan.workspace.id;
    Object.assign(plan.operation.request,{runId:plan.run.id,workspaceId:plan.workspace.id,operationId:plan.operation.id,targetId:plan.workspace.targetId,
      actionId:steps[0].actionId,actionVersion:steps[0].actionVersion,inputs:steps[0].inputs,configDigest:compiled.snapshot.digest});
    plan.operation.request.requestDigest=requestDigest(plan.operation.request);
    Object.assign(plan.outbox,{runId:plan.run.id,operationId:plan.operation.id,intentKey:`configured:${suffix}`});plan.outbox.payload.operationId=plan.operation.id;
    plan.projections=[];
    return plan;
  };
}

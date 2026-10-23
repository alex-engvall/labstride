// Explicit operator probe; not GitHub admission or full AC36 evidence.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { validated } from '../packages/storage-sqlite/validation.ts';
import { digest,requestDigest } from '../packages/storage-sqlite/execution.ts';
import { readProtected,assertPrivateDatabase } from '../packages/target-helper/filesystem.ts';
import { workspaceTargetResolver } from '../packages/connector-ssh/workspaces.ts';
import { freezeProfile } from '../packages/extensions/loader.ts';
import type { WorkspaceOperatorProbeV1 } from '../contracts/generated/workspace-probe.ts';
import type { WorkspaceRequest } from '../packages/target-helper/workspace-contracts.ts';
process.umask(0o077);
try {
  if(process.argv.length<3 || process.argv.length>4 || process.argv.length===4&&process.argv[3]!=='--dispatch')throw Error('validation_failed');
  const spec=validated<WorkspaceOperatorProbeV1>('workspace-probe',JSON.parse(readProtected(process.argv[2]).toString('utf8')));
  const op=spec.operation;if(op.requestDigest!==requestDigest(op)||op.targetId!==spec.configuration.targetId)throw Error('identity_mismatch');
  const bytes=readFileSync(spec.artifactPath);if(createHash('sha256').update(bytes).digest('hex')!==spec.artifactIntegrity)throw Error('identity_mismatch');
  const pin={id:'labstride.connector.ssh',version:'1.1.0',kind:'connector' as const,artifactPath:spec.artifactPath,integrity:spec.artifactIntegrity,
    configuration:spec.configuration,permissions:['network.ssh'],capabilities:['workspace.probe.v1','workspace.create.v1','workspace.inspect.v1']};
  const host={protocol:{major:1,minor:0},capabilities:[],permissions:['network.ssh']};
  const connector=await workspaceTargetResolver(host).resolve(freezeProfile(op.runId,op.configDigest,pin,host));
  const base={schemaVersion:'2.0' as const,requestId:op.operationId,installationId:spec.installationId,targetId:op.targetId,targetRevision:spec.configuration.revision};
  const probe=await connector.invoke({...base,method:'probe'});if(probe.outcome!=='ok')throw Error('unsupported_capability');
  const request:WorkspaceRequest={...base,method:'create',operation:op};await connector.validate(request);
  assertPrivateDatabase(spec.stateDirectory,'workspace-probe-intents.sqlite');
  const db=new DatabaseSync(join(spec.stateDirectory,'workspace-probe-intents.sqlite'));
  let response;
  try {
    const version=db.prepare('PRAGMA user_version').get()!.user_version;
    const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name).join(',');
    if(version!==0&&version!==1 || version===0&&tables!=='' || version===1&&tables!=='intents')throw Error('identity_mismatch');
    db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS intents (operation_id TEXT PRIMARY KEY,digest TEXT NOT NULL,dispatched INTEGER NOT NULL DEFAULT 0); PRAGMA user_version=1');
    const specDigest=digest(spec);
    db.prepare('INSERT OR IGNORE INTO intents(operation_id,digest) VALUES (?,?)').run(op.operationId,specDigest);
    const prior=db.prepare('SELECT digest,dispatched FROM intents WHERE operation_id=?').get(op.operationId)!;
    if(prior&&prior.digest!==specDigest)throw Error('identity_mismatch');
    response=await connector.invoke({...request,method:'inspect'});
    if(response.outcome==='outcome_unknown'&&process.argv[3]==='--dispatch'&&prior.dispatched===0) {
      db.exec('BEGIN IMMEDIATE');
      try {const claim=db.prepare('UPDATE intents SET dispatched=1 WHERE operation_id=? AND digest=? AND dispatched=0').run(op.operationId,specDigest);if(claim.changes!==1)throw Error('outcome_unknown');db.exec('COMMIT');}
      catch(error){if(db.isTransaction)db.exec('ROLLBACK');throw error;}
      response=await connector.invoke(request);
    }
  }finally{db.close();}
  process.stdout.write(JSON.stringify({acceptance:'unverified',response})+'\n');
} catch(error) {
  const code=error instanceof Error&&['identity_mismatch','unsupported_capability','outcome_unknown','authentication_failed','transient_unavailable','forbidden'].includes(error.message)?error.message:'validation_failed';
  process.stderr.write(code+'\n');process.exitCode=1;
}

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { rootIdentity } from '../../packages/target-helper/filesystem.ts';
import { EnrollmentStore } from '../../packages/connector-ssh/enrollment.ts';
import { freezeProfile } from '../../packages/extensions/loader.ts';
import { targetResolver } from '../../packages/connector-ssh/runtime.ts';
import { startPlan } from './execution-fixture.mjs';
import { requestDigest } from '../../packages/storage-sqlite/execution.ts';
export const host = { protocol: { major: 1, minor: 0 }, capabilities: [], permissions: ['network.ssh'] };
export function targetFixture(t, parent = tmpdir()) {
  const root = mkdtempSync(join(parent, 'labstride-target-'));
  for (const name of ['registry','workspaces','enrollment']) mkdirSync(join(root, name), { mode: 0o700 });
  const policy = { schemaVersion:'1.0', installationId:'installation-test', targetId:'target-test', targetRevision:1,
    helperUid:process.getuid(), codingUid: process.getuid() === 65534 ? 65533 : 65534, stateDir:join(root,'registry'),
    roots:[{id:'source',path:join(root,'workspaces'),identity:rootIdentity(join(root,'workspaces'))}] };
  const policyFile=join(root,'policy.json'); writeFileSync(policyFile,JSON.stringify(policy),{mode:0o600});
  const operation=startPlan().operation.request;
  Object.assign(operation,{actionId:'labstride.target-reserve',actionVersion:'1.0.0',targetId:'target-test',inputs:{rootId:'source'}});
  operation.requestDigest=requestDigest(operation);
  const request={schemaVersion:'1.0',requestId:operation.operationId,installationId:policy.installationId,targetId:policy.targetId,
    targetRevision:1,method:'reserve',operation};
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  return {root,policy,policyFile,operation,request};
}
export function enrollFixture(f, options = {}) {
  const key=join(f.root,'identity');
  execFileSync('ssh-keygen',['-q','-t','ed25519','-N','','-f',key]);
  const hostKey=readFileSync(key+'.pub','utf8').split(' ').slice(0,2).join(' ');
  const enrollment={schemaVersion:'1.0',installationId:f.policy.installationId,targetId:f.policy.targetId,revision:1,
    host:'127.0.0.1',port:65534,user:process.getuid()===0?'root':process.env.USER,hostKey,identityFile:key,
    helperCommand:'/usr/local/bin/labstride-target-helper',rootIds:['source'],timeoutMs:3000,...options};
  const store=new EnrollmentStore(join(f.root,'enrollment'));
  const configuration=store.publish(enrollment,0,{actorId:'test-operator',reason:'Explicit disposable enrollment'});
  return {enrollment,store,configuration};
}
export async function installedConnector(f, configuration) {
  const path=join(f.root,`connector-${configuration.revision}-${configuration.digest.slice(0,8)}.artifact.json`);
  execFileSync(process.execPath,['scripts/package_extension.mjs','packages/connector-ssh',path]);
  const pin={id:'labstride.connector.ssh',version:'1.2.0',kind:'connector',artifactPath:path,
    integrity:createHash('sha256').update(readFileSync(path)).digest('hex'),permissions:['network.ssh'],
    capabilities:['target.probe.v1','target.reserve.v1','target.inspect.v1'],configuration};
  const profile=freezeProfile(f.operation.runId,f.operation.configDigest,pin,host);
  return {pin,profile,connector:await targetResolver(host).resolve(profile)};
}

import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { workspaceFixture } from './workspace-fixture.mjs';
import { WorkspaceRegistry } from '../../packages/target-helper/workspaces.ts';
import { RuntimeRegistry } from '../../packages/target-helper/runtimes.ts';
import { requestDigest, digest } from '../../packages/storage-sqlite/execution.ts';
export async function runtimeFixture(t,parent) {
  let root;
  // Fixture teardown only; production exposes no kill or delete operation.
  t.after(()=>{
    if(!root||!existsSync(join(root,'services')))return;
    for(const name of readdirSync(join(root,'services'))) {
      try {const ready=JSON.parse(readFileSync(join(root,'services',name,'ready.json'),'utf8'));
        if(ready.pid&&readFileSync(`/proc/${ready.pid}/stat`,'utf8').split(' ')[21]===ready.processStart) {
          const command=readFileSync(`/proc/${ready.pid}/cmdline`,'utf8');
          if(command.includes(join(root,'driver.mjs'))&&command.includes(join(root,'services',name)))process.kill(ready.pid,'SIGTERM');
        }
      }catch{}
    }
  });
  const f=workspaceFixture(t,parent);root=f.root;
  for(const n of ['runtime-state','services'])mkdirSync(join(root,n),{mode:0o700});
  const driver=join(root,'driver.mjs');copyFileSync(resolve('examples/runtime-recipes/node-resources.mjs'),driver);chmodSync(driver,0o600);
  const installed={path:driver,integrity:createHash('sha256').update(readFileSync(driver)).digest('hex')};
  const recipe=(id,kind,type,trigger)=>({id,version:'1.0.0',driver:installed,configuration:{kind,root:join(root,'services')},
    resources:[{key:kind==='http'?'http':'db',type}],cleanup:{actionId:'example.runtime-stop',actionVersion:'1.0.0',trigger},timeoutMs:10000});
  const recipes=[recipe('example.sqlite','sqlite','database','workspace.completed'),recipe('example.http','http','url','operator.request')];
  const installation={schemaVersion:'3.0',workspacePolicy:f.policy,runtimePolicy:{schemaVersion:'1.0',installationId:f.policy.installationId,
    targetId:f.policy.targetId,targetRevision:1,helperUid:process.getuid(),stateDir:join(root,'runtime-state'),recipes}};
  const source=new WorkspaceRegistry(f.policy,f.dependencies),created=await source.handle(f.request);source.close();
  if(created.outcome!=='ok')throw Error(JSON.stringify(created));
  const operationFor=(index=0,change={})=>{
    const r=recipes[index],op={...structuredClone(f.operation),operationId:'operation-runtime-'+index,actionId:'labstride.runtime-create',
      inputs:{target:f.policy.targetId,rootId:'source',workspaceOperationId:f.operation.operationId,recipe:{id:r.id,version:r.version,digest:digest(r)}},...change};
    op.requestDigest=requestDigest(op);return op;
  };
  const requestFor=(index=0,change={})=>({schemaVersion:'3.0',requestId:operationFor(index,change).operationId,installationId:f.policy.installationId,targetId:f.policy.targetId,targetRevision:1,method:'create',operation:operationFor(index,change)});
  const policyFile=join(root,'runtime-policy.json');writeFileSync(policyFile,JSON.stringify(installation),{mode:0o600});
  return {...f,installation,recipes,created:created.workspace,operationFor,requestFor,runtimePolicyFile:policyFile,
    open:(barrier)=>new RuntimeRegistry(installation,barrier)};
}

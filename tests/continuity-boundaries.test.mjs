import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {bridgeGitHub} from '../tools/workspace-continuity/transport.mjs';
import {configurationFixture} from './helpers/configuration-fixture.mjs';
import {setup} from './helpers/session-fixture.mjs';
import {startCoordinator} from '../apps/coordinator/main.ts';
import {installedSessionAction} from '../packages/extensions/session-action.ts';
import {sessionResolver} from '../packages/extensions/session-provider.ts';
import {requestDigest} from '../packages/storage-sqlite/execution.ts';
const directory=t=>{const root=mkdtempSync(join(tmpdir(),'labstride-continuity-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return root;};
test('stdio GitHub bridge keeps the actual credential local and fixes the remote API destination',async t=>{
  const stdout=new PassThrough(),stdin=new PassThrough();let returned='';stdin.on('data',data=>returned+=data);let calls=0;
  t.mock.method(globalThis,'fetch',async(url,options)=>{calls++;assert.equal(url,'https://api.github.com/graphql');assert.equal(options.headers.authorization,'Bearer local-only-secret');
    assert.deepEqual(JSON.parse(options.body),{query:'query { viewer { id } }',variables:{}});return new Response(JSON.stringify({data:{viewer:{id:'actor'}}}),{status:200});});
  const pending=bridgeGitHub({stdout,stdin},{credential:async()=> 'local-only-secret'});
  stdout.end(JSON.stringify({kind:'github-request',id:1,url:'https://untrusted.invalid',authorization:'remote-forgery',query:'query { viewer { id } }',variables:{}})+'\n');await pending;
  assert.equal(calls,1);assert.equal(returned.includes('local-only-secret'),false);const frame=JSON.parse(returned);assert.equal(frame.id,1);assert.equal(frame.status,200);
});
test('invalid or oversized bridge requests are refused before credential access or network effects',async()=>{
  for(const frame of [{kind:'github-request',id:'not-an-id',query:'query {}',variables:{}},{kind:'github-request',id:1,query:'x'.repeat(70000),variables:{}}]){
    const stdout=new PassThrough(),stdin=new PassThrough();let credentials=0;
    const pending=bridgeGitHub({stdout,stdin},{credential:async()=>{credentials++;return 'never-read';}});
    stdout.end(JSON.stringify(frame)+'\n');await assert.rejects(pending);assert.equal(credentials,0);
  }
});
test('managed session action validates the compiled pin before the actual provider and rechecks altered artifact bytes',async t=>{
  const root=directory(t),configuration=configurationFixture(root);configuration.dependencies.host.permissions.push('session.manage');
  const artifactPath=join(root,'session-action.artifact.json');execFileSync(process.execPath,['scripts/package_extension.mjs','packages/action-session-command',artifactPath]);
  const pin={id:'labstride.session-command',version:'1.0.0',kind:'action',artifactPath,integrity:createHash('sha256').update(readFileSync(artifactPath)).digest('hex'),permissions:['session.manage'],capabilities:['session.command.v1'],configuration:{}};
  configuration.dependencies.lock.extensions.push(pin);const compiled=await configuration.compile();assert.equal(compiled.ok,true,JSON.stringify(compiled));
  const runtime=startCoordinator(join(root,'state'));t.after(()=>runtime.store.close());const session=setup(runtime.store,root);
  const resolver=sessionResolver(configuration.dependencies.host);t.after(()=>resolver.close());let validations=0;
  const port={runConfiguration:()=>compiled.configuration.snapshot,command:runtime.store.command.bind(runtime.store),profile:runtime.store.profile.bind(runtime.store),
    recordSessionReply:runtime.store.recordSessionReply.bind(runtime.store),savedSessionReply:runtime.store.savedSessionReply.bind(runtime.store)};
  const action=installedSessionAction(port,configuration.dependencies.host,async profile=>{const actual=await resolver.resolve(profile);return{...actual,async validate(request){validations++;await actual.validate(request);}};});
  const operation=structuredClone(session.plan.operation.request);operation.configDigest=compiled.configuration.snapshot.digest;operation.requestDigest=requestDigest(operation);
  await action.validate(operation);assert.equal(validations,1);
  writeFileSync(artifactPath,readFileSync(artifactPath,'utf8')+'\n');await assert.rejects(action.validate(operation),error=>error.code==='integrity_mismatch');assert.equal(validations,1);
  assert.equal(runtime.store.get('operation',operation.operationId).effectBoundary,'not_crossed');
});

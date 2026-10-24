import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, readdirSync, lstatSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { workspaceFixture } from './helpers/workspace-fixture.mjs';
import { WorkspaceRegistry } from '../packages/target-helper/workspaces.ts';
import { inspectCleanup } from '../packages/target-helper/cleanup.ts';
import { digest } from '../packages/configuration/json.ts';
const policy={schemaVersion:'1.0',trigger:'operator_request',actionId:'labstride.workspace-cleanup',actionVersion:'1.0.0',completion:'merge_only',regenerableIgnoredPaths:[]};
const git=(path,args)=>execFileSync('/usr/bin/git',['-c',`safe.directory=${path}`,...args],{cwd:path,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
function fingerprint(root){const hash=createHash('sha256');function visit(path){for(const name of readdirSync(path).sort()){const file=join(path,name),s=lstatSync(file);hash.update(name+':'+s.mode);if(s.isDirectory())visit(file);else if(s.isFile())hash.update(readFileSync(file));}}visit(root);return hash.digest('hex');}
async function fixture(t){const f=workspaceFixture(t),registry=new WorkspaceRegistry(f.policy,f.dependencies);const reply=await registry.handle(f.request);registry.close();assert.equal(reply.outcome,'ok');const receipt=reply.workspace,path=f.sourcePath(receipt);mkdirSync(join(path,'.git/info'),{recursive:true});
const request={schemaVersion:'4.0',method:'inspect',requestId:'cleanup-test',installationId:f.policy.installationId,targetId:f.policy.targetId,targetRevision:f.policy.targetRevision,workspaceId:receipt.workspaceId,creationOperationId:receipt.operationId,receiptDigest:digest(receipt),policy:structuredClone(policy)};
return {...f,path,receipt,request,async inspect(){const before=fingerprint(path);const response=await inspectCleanup(f.policy,request,f.dependencies,{remote:f.repository,allowFileTransport:true});assert.equal(fingerprint(path),before,'source bytes/index/refs/config are unchanged');assert.equal(response.outcome,'ok');return response.inspection;}};}
test('AC18 clean source inspection independently reads remote without changing checkout',async t=>{const f=await fixture(t);const inspection=await f.inspect();assert.deepEqual(inspection.blockers,[]);assert.ok(inspection.remoteRefsDigest);});
for(const [name,change,blocker] of [
['tracked',f=>writeFileSync(join(f.path,'hello.txt'),'changed'),'tracked_changes'],
['staged',f=>{writeFileSync(join(f.path,'hello.txt'),'staged');git(f.path,['add','hello.txt']);},'tracked_changes'],
['untracked',f=>writeFileSync(join(f.path,'odd\nname.txt'),'untracked'),'untracked_work'],
['ignored',f=>{writeFileSync(join(f.path,'.git/info/exclude'),'cache/\n');mkdirSync(join(f.path,'cache'));writeFileSync(join(f.path,'cache','precious'),'work');},'undeclared_ignored_work'],
['unpushed',f=>{writeFileSync(join(f.path,'hello.txt'),'commit');git(f.path,['add','.']);git(f.path,['-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','local']);},'unpushed_commits'],
['other branch',f=>git(f.path,['branch','saved',f.receipt.source.sha]),null],
['stash',f=>{writeFileSync(join(f.path,'hello.txt'),'saved');git(f.path,['stash','push','-m','retained']);},'unpushed_commits'],
['assume unchanged',f=>{git(f.path,['update-index','--assume-unchanged','hello.txt']);writeFileSync(join(f.path,'hello.txt'),'hidden');},'index_flags_unsupported'],
])test(`AC18 ${name} preserves original source`,async t=>{const f=await fixture(t);change(f);const inspected=await f.inspect();if(blocker)assert.ok(inspected.blockers.includes(blocker),JSON.stringify(inspected));else assert.deepEqual(inspected.blockers,[]);});
test('only explicitly declared ignored caches avoid blockers; untracked declaration cannot discard work',async t=>{const f=await fixture(t);writeFileSync(join(f.path,'.git/info/exclude'),'cache/\n');mkdirSync(join(f.path,'cache'));writeFileSync(join(f.path,'cache','artifact'),'cache');f.request.policy.regenerableIgnoredPaths=['cache'];assert.deepEqual((await f.inspect()).blockers,[]);writeFileSync(join(f.path,'valuable'),'work');f.request.policy.regenerableIgnoredPaths.push('valuable');assert.ok((await f.inspect()).blockers.includes('untracked_work'));});
test('detached local commit and a branch outside HEAD are protected',async t=>{const f=await fixture(t);git(f.path,['checkout','--detach']);writeFileSync(join(f.path,'hello.txt'),'detached');git(f.path,['add','.']);git(f.path,['-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','saved']);assert.ok((await f.inspect()).blockers.includes('unpushed_commits'));git(f.path,['branch','saved']);git(f.path,['checkout','--detach',f.receipt.source.sha]);assert.ok((await f.inspect()).blockers.includes('unpushed_commits'));});
test('stale tracking refs do not prove delivery; fresh remote branch removal blocks',async t=>{const f=await fixture(t);writeFileSync(join(f.path,'hello.txt'),'pushed');git(f.path,['add','.']);git(f.path,['-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','saved']);git(f.path,['push',f.repository,'HEAD:refs/heads/temporary']);assert.deepEqual((await f.inspect()).blockers,[]);git(f.path,['update-ref','refs/remotes/origin/temporary',git(f.path,['rev-parse','HEAD'])]);git(f.repository,['branch','-D','temporary']);assert.ok((await f.inspect()).blockers.includes('unpushed_commits'));});
test('shallow and symlinked metadata are unknown; hooks and source config never execute',async t=>{const f=await fixture(t);const marker=join(f.root,'executed');git(f.path,['config','core.fsmonitor',`touch ${marker}`]);git(f.path,['config','include.path','/not/a/real/config']);assert.deepEqual((await f.inspect()).blockers,[]);assert.equal(readdirSync(f.root).includes('executed'),false);writeFileSync(join(f.path,'.git/shallow'),'f'.repeat(40)+'\n');assert.ok((await f.inspect()).blockers.includes('git_inspection_unknown'));});
test('ownership mismatch and foreign paths cannot obtain inspection evidence',async t=>{const f=await fixture(t);f.request.receiptDigest='a'.repeat(64);const reply=await inspectCleanup(f.policy,f.request,f.dependencies);assert.equal(reply.outcome,'outcome_unknown');assert.equal(reply.inspection,null);});
test('metadata symlinks and unavailable remote evidence conservatively block inspection',async t=>{
 const f=await fixture(t);symlinkSync(join(f.repository,'hello.txt'),join(f.path,'.git/info/exclude'));
 assert.ok((await f.inspect()).blockers.includes('git_inspection_unknown'));
 const clean=await fixture(t),before=fingerprint(clean.path);
 const reply=await inspectCleanup(clean.policy,clean.request,clean.dependencies,{remote:join(clean.root,'missing-remote'),allowFileTransport:true});
 assert.ok(reply.inspection.blockers.includes('git_inspection_unknown'));assert.equal(fingerprint(clean.path),before);
});

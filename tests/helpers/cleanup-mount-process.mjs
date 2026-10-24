import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deletionFixture } from './cleanup-delete-fixture.mjs';
import { walkOwned } from '../../packages/target-helper/cleanup-filesystem.ts';
import { requestDigest } from '../../packages/storage-sqlite/execution.ts';
const cleanups=[],t={after:fn=>cleanups.push(fn)},kind=process.argv[2];let mounted,attached=false;
try {
 const f=await deletionFixture(t),foreign=join(f.root,'foreign');mkdirSync(foreign);writeFileSync(join(foreign,'keep'),'survive');
 walkOwned(f.path,f.receipt.directoryIdentity,f.policy);
 if(kind==='wrapper'){chmodSync(foreign,0o750);mkdirSync(join(foreign,'source'),{mode:0o2770});mounted=f.path;}
 else {
  mkdirSync(join(f.path,'source','.git','info'),{recursive:true});writeFileSync(join(f.path,'source','.git','info','exclude'),'cache\n');
  mkdirSync(join(f.path,'source','cache'));mounted=join(f.path,'source','cache');
  f.op.inputs.policy.regenerableIgnoredPaths=['cache'];f.op.requestDigest=requestDigest(f.op);
  if(kind==='file'){mounted=join(mounted,'mounted');writeFileSync(mounted,'placeholder');}
 }
 execFileSync('/usr/bin/mount',['--bind',kind==='file'?join(foreign,'keep'):foreign,mounted]);attached=true;
 const result=f.call();assert.notEqual(result.state,'deleted');assert.ok(result.blockers.includes('identity_mismatch'),JSON.stringify(result));
 assert.equal(readFileSync(join(foreign,'keep'),'utf8'),'survive');
} finally {
 if(attached)execFileSync('/usr/bin/umount',[mounted]);
 for(const cleanup of cleanups)await cleanup();
}

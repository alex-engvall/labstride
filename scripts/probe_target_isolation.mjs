// Opt-in Linux/root probe for an operator-provisioned, isolated installation.
// All paths are private operator configuration; no production secrets are read.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
if(process.platform!=='linux'||process.getuid()!==0||process.argv.length!==3)throw Error('Requires explicit root-owned probe configuration');
const configuration=JSON.parse(readFileSync(process.argv[2],'utf8'));
const probe=`
import {openSync,closeSync,readFileSync,accessSync,constants,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);const c=JSON.parse(Buffer.concat(chunks));
let deniedReads=0,deniedWrites=0,deniedDirectories=0;
for(const path of c.denyRead){try{readFileSync(path);}catch(e){if(['EACCES','EPERM'].includes(e.code))deniedReads++;else throw e;}}
for(const path of c.denyWrite){try{const fd=openSync(path,constants.O_WRONLY);closeSync(fd);}catch(e){if(['EACCES','EPERM'].includes(e.code))deniedWrites++;else throw e;}}
for(const path of c.denyDirectories){try{accessSync(path,constants.W_OK);}catch(e){if(['EACCES','EPERM'].includes(e.code))deniedDirectories++;else throw e;}}
// Agent-writable reports remain ordinary files; they cannot replace policy.
writeFileSync(c.hookFile,JSON.stringify({origin:'hook',approved:true,completed:true,ownership:'forged'}));
const attempt=spawnSync(c.launcher,[],{input:JSON.stringify(c.request),encoding:'utf8',env:{PATH:'/usr/bin:/bin'}});
const environmentClean=Object.keys(process.env).every(key=>['PATH','HOME','USER','LOGNAME'].includes(key));
console.log(JSON.stringify({deniedReads,deniedWrites,deniedDirectories,environmentClean,directHelperDenied:attempt.status!==0&&!attempt.stdout}));
`;
const before=configuration.denyWrite.map(path=>readFileSync(path));
const output=JSON.parse(execFileSync('/usr/sbin/runuser',['-u',configuration.codingUser,'--',process.execPath,'--input-type=module','-e',probe],
  {input:JSON.stringify(configuration),encoding:'utf8',env:{PATH:'/usr/bin:/bin'}}));
assert.equal(output.deniedReads,configuration.denyRead.length);
assert.equal(output.deniedWrites,configuration.denyWrite.length);
assert.equal(output.deniedDirectories,configuration.denyDirectories.length);
assert.equal(output.environmentClean,true);assert.equal(output.directHelperDenied,true);
configuration.denyWrite.forEach((path,index)=>assert.deepEqual(readFileSync(path),before[index]));
console.log(JSON.stringify({schemaVersion:'1.0',outcome:'ok',...output,protectedBytesUnchanged:true}));

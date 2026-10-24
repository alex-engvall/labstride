import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { targetFixture } from './ssh-fixture.mjs';
import { requestDigest } from '../../packages/storage-sqlite/execution.ts';
import { runGit } from '../../packages/target-helper/workspace-git.ts';
export function workspaceFixture(t,parent,{priorHistory=false}={}) {
  const f=targetFixture(t,parent),repository=join(f.root,'upstream');mkdirSync(repository,{mode:0o700});
  const git=args=>execFileSync('/usr/bin/git',args,{cwd:repository,encoding:'utf8',env:{PATH:'/usr/bin:/bin',HOME:'/',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'},stdio:['ignore','pipe','pipe']}).trim();
  git(['init','--template=','.']);
  if(priorHistory){
    writeFileSync(join(repository,'history.txt'),'history before pinned baseline\n');git(['add','.']);
    git(['-c','user.name=Workspace Test','-c','user.email=workspace@example.test','commit','-m','earlier history']);
  }
  writeFileSync(join(repository,'hello.txt'),'original source\n');git(['add','.']);
  git(['-c','user.name=Workspace Test','-c','user.email=workspace@example.test','commit','-m','exact baseline']);
  const sha=git(['rev-parse','HEAD']);writeFileSync(join(repository,'later.txt'),'not requested\n');git(['add','.']);
  git(['-c','user.name=Workspace Test','-c','user.email=workspace@example.test','commit','-m','later tip']);
  const policy={...f.policy,schemaVersion:'2.0',codingGid:process.getgid(),sources:[{
    repositoryId:'repository-test',repository:'example/source',gitUrl:'https://github.com/example/source.git',apiUrl:'https://api.github.com/repos/example/source',credentialFile:null}]};
  const operation={...f.operation,actionId:'labstride.workspace-create',source:{repositoryId:'repository-test',repository:'example/source',sha},
    inputs:{target:policy.targetId,rootId:'source',source:{repositoryId:'repository-test',repository:'example/source',sha}}};
  operation.requestDigest=requestDigest(operation);
  const request={...f.request,schemaVersion:'2.0',method:'create',operation};
  let fetches=0,observations=0;
  // Test source transport only: actual Git fetch/checkouts use a separate local
  // repository. Live HTTPS/authentication qualification is recorded separately.
  const dependencies={async observeSource(){observations++;},git(directory,args,access){
    if(args[0]==='remote')args=[...args.slice(0,3),repository];
    if(args[0]==='fetch')fetches++;
    return runGit(directory,['-c','protocol.file.allow=always',...args],access);
  }};
  writeFileSync(f.policyFile,JSON.stringify(policy));
  return {...f,policy,request,operation,repository,dependencies,fetches:()=>fetches,observations:()=>observations,
    sourcePath:receipt=>join(policy.roots[0].path,receipt.locator,'source')};
}
export async function httpsSource(t,f,{privateSource=true}={}) {
  const {fork}=await import('node:child_process'),{once}=await import('node:events');
  const certificate=join(f.root,'ca.pem'),key=join(f.root,'ca-key.pem');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',certificate,'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore'});
  chmodSync(certificate,0o600);
  execFileSync('/usr/bin/git',['clone','--bare',f.repository,join(f.root,'source.git')],{stdio:'ignore'});
  execFileSync('/usr/bin/git',['--git-dir='+join(f.root,'source.git'),'config','uploadpack.allowReachableSHA1InWant','true'],{stdio:'ignore'});
  const secret=privateSource?'synthetic-ssh-source-read-secret':null,secretFile=join(f.root,'source-secret');if(secret)writeFileSync(secretFile,secret,{mode:0o600});
  const spec=join(f.root,'https-server.json');writeFileSync(spec,JSON.stringify({root:f.root,key,certificate,secret,repositoryId:f.operation.source.repositoryId,repository:f.operation.source.repository}),{mode:0o600});
  const server=fork(new URL('./workspace-https-server.mjs',import.meta.url),[spec],{stdio:['ignore','pipe','pipe','ipc']});
  const stopped=once(server,'exit');t.after(async()=>{if(server.exitCode===null&&server.signalCode===null){server.kill('SIGTERM');await stopped;}});
  const {port}=(await once(server,'message',{signal:AbortSignal.timeout(10000)}))[0];
  Object.assign(f.policy.sources[0],{gitUrl:`https://127.0.0.1:${port}/source.git`,apiUrl:`https://127.0.0.1:${port}/api`,credentialFile:secret?secretFile:null});
  writeFileSync(f.policyFile,JSON.stringify(f.policy));
  return {certificate,server};
}

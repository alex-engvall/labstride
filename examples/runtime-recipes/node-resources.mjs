// Public, operator-installed example driver. It never executes checkout code.
// Profiles select an isolated SQLite database, or a loopback Node HTTP service.
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { constants, closeSync, fsyncSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
process.umask(0o077);
const fail=()=>{throw Error('outcome_unknown');};
function safe(path,directory=true) {
  if(!isAbsolute(path)||realpathSync(path)!==path)fail();
  let p=path;
  for(;;){const s=lstatSync(p);if(![0,process.getuid()].includes(s.uid)||s.isSymbolicLink()||((s.mode&0o022)&&!(p!==path&&s.uid===0&&(s.mode&0o1000))))fail();if(p==='/')break;p=dirname(p);}
  const s=lstatSync(path);if(directory?!s.isDirectory():!s.isFile()||s.nlink!==1)fail();return s;
}
function read(path) {
  safe(path,false);const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try {const s=fstatSync(fd);if(s.size>65536)fail();return JSON.parse(readFileSync(fd,'utf8'));}finally{closeSync(fd);}
}
function persist(path,value) {
  const fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try {writeFileSync(fd,JSON.stringify(value));fsyncSync(fd);}finally{closeSync(fd);}
  const parent=openSync(dirname(path),constants.O_RDONLY|constants.O_DIRECTORY);try{fsyncSync(parent);}finally{closeSync(parent);}
}
const identity=s=>({device:s.dev,inode:s.ino,uid:s.uid});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function serve(directory) {
  safe(directory);const saved=read(join(directory,'intent.json'));
  if(saved.kind!=='http')fail();
  const body=JSON.stringify({namespace:saved.binding.namespace,bindingDigest:saved.bindingDigest});
  const server=createServer((_req,res)=>{res.writeHead(200,{'content-type':'application/json'});res.end(body);});
  server.requestTimeout=5000;server.headersTimeout=5000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen({host:'127.0.0.1',port:0},resolve);});
  const url=`http://127.0.0.1:${server.address().port}/`;
  const resource=saved.binding.resources[0];
  if(saved.binding.resources.length!==1||resource.type!=='url')fail();
  persist(join(directory,'ready.json'),{bindingDigest:saved.bindingDigest,resource:{...resource,locator:url,state:'ready'},pid:process.pid,
    directoryIdentity:identity(safe(directory)),processStart:readFileSync(`/proc/${process.pid}/stat`,'utf8').split(' ').slice(21,22)[0]});
  process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
}
async function run(request) {
  if(request.schemaVersion!=='1.0'||!['create','inspect'].includes(request.method))fail();
  const {binding,bindingDigest,configuration}=request;
  if(!/^rt-[a-f0-9]{40}$/.test(binding.namespace)||!['sqlite','http'].includes(configuration.kind)||
    Object.keys(configuration).sort().join(',')!=='kind,root')fail();
  if(safe(configuration.root).mode&0o077)fail();
  const directory=join(configuration.root,binding.namespace),intentPath=join(directory,'intent.json');
  if(request.method==='create') {
    // Refuse every pre-existing path, including another operation's directory.
    mkdirSync(directory,{mode:0o700});
    persist(intentPath,{binding,bindingDigest,kind:configuration.kind});
    if(configuration.kind==='sqlite') {
      if(binding.resources.length!==1||binding.resources[0].type!=='database')fail();
      const path=join(directory,'database.sqlite'),db=new DatabaseSync(path);
      try {db.exec('PRAGMA synchronous=FULL; CREATE TABLE labstride_owner (binding_digest TEXT PRIMARY KEY);');db.prepare('INSERT INTO labstride_owner VALUES (?)').run(bindingDigest);}finally{db.close();}
      persist(join(directory,'ready.json'),{bindingDigest,resource:{...binding.resources[0],locator:path,state:'ready'},directoryIdentity:identity(safe(directory)),fileIdentity:identity(safe(path,false))});
    } else {
      const child=spawn(realpathSync(process.execPath),[fileURLToPath(import.meta.url),'--serve',directory],{cwd:'/',detached:true,stdio:'ignore',env:{PATH:'/usr/bin:/bin',LANG:'C',NODE_NO_WARNINGS:'1'}});
      child.unref();
      const end=Date.now()+5000;
      for(;;){try{safe(join(directory,'ready.json'),false);break;}catch{if(Date.now()>end)fail();await new Promise(r=>setTimeout(r,20));}}
    }
  }
  safe(directory);const intent=read(intentPath),ready=read(join(directory,'ready.json'));
  if(intent.bindingDigest!==bindingDigest||JSON.stringify(intent.binding)!==JSON.stringify(binding)||ready.bindingDigest!==bindingDigest||
    !same(ready.directoryIdentity,identity(safe(directory))))fail();
  if(configuration.kind==='sqlite') {
    const path=join(directory,'database.sqlite');if(!same(ready.fileIdentity,identity(safe(path,false))))fail();
    const db=new DatabaseSync(path,{readOnly:true});try{if(db.prepare('SELECT binding_digest FROM labstride_owner').get()?.binding_digest!==bindingDigest)fail();}finally{db.close();}
  } else {
    const response=await fetch(ready.resource.locator,{signal:AbortSignal.timeout(1500),redirect:'error'}),observed=await response.json();
    if(response.status!==200||observed.bindingDigest!==bindingDigest||observed.namespace!==binding.namespace)fail();
    if(readFileSync(`/proc/${ready.pid}/stat`,'utf8').split(' ').slice(21,22)[0]!==ready.processStart)fail();
  }
  return {schemaVersion:'1.0',status:'ready',bindingDigest,resources:[ready.resource],evidenceRefs:[`recipe:node-resources:${binding.namespace}`]};
}
try {
  if(process.argv[2]==='--serve'&&process.argv.length===4)await serve(process.argv[3]);
  else {
    let size=0;const chunks=[];for await(const c of process.stdin){size+=c.length;if(size>262144)fail();chunks.push(c);}
    const result=await run(JSON.parse(Buffer.concat(chunks).toString('utf8')));process.stdout.write(JSON.stringify(result));
  }
}catch{process.stderr.write('outcome_unknown\n');process.exitCode=1;}

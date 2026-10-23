import { createServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
const spec=JSON.parse(readFileSync(process.argv[2],'utf8'));
let api=0,fetches=0,rejected=0;
const server=createServer({key:readFileSync(spec.key),cert:readFileSync(spec.certificate)},(request,response)=>{
  const url=new URL(request.url,'https://127.0.0.1');
  const expected=url.pathname==='/api'?`Bearer ${spec.secret}`:`Basic ${Buffer.from(`x-access-token:${spec.secret}`).toString('base64')}`;
  if(spec.secret&&request.headers.authorization!==expected){rejected++;response.writeHead(401,{'WWW-Authenticate':'Basic realm="fixture"'});response.end();return;}
  if(url.pathname==='/api'){api++;response.setHeader('content-type','application/json');response.end(JSON.stringify({node_id:spec.repositoryId,full_name:spec.repository,clone_url:`https://${request.headers.host}/source.git`}));return;}
  if(!['/source.git/info/refs','/source.git/git-upload-pack'].includes(url.pathname)){response.writeHead(404);response.end();return;}
  if(url.pathname==='/source.git/info/refs'&&url.searchParams.get('service')!=='git-upload-pack'){rejected++;response.writeHead(403);response.end();return;}
  if(url.pathname.endsWith('/git-upload-pack'))fetches++;
  const child=spawn('/usr/bin/git',['http-backend'],{env:{PATH:'/usr/bin:/bin',HOME:'/',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',
    GIT_PROJECT_ROOT:spec.root,GIT_HTTP_EXPORT_ALL:'1',PATH_INFO:url.pathname,QUERY_STRING:url.search.slice(1),REQUEST_METHOD:request.method,
    CONTENT_TYPE:request.headers['content-type']??'',CONTENT_LENGTH:request.headers['content-length']??'',SERVER_PROTOCOL:'HTTP/1.1',REMOTE_USER:'fixture'},stdio:['pipe','pipe','pipe']});
  let header=Buffer.alloc(0),sent=false;
  child.stdout.on('data',chunk=>{if(sent){response.write(chunk);return;}header=Buffer.concat([header,chunk]);const boundary=header.indexOf('\r\n\r\n');if(boundary<0)return;
    const lines=header.subarray(0,boundary).toString().split('\r\n');let status=200;const headers={};for(const line of lines){const colon=line.indexOf(':');const key=line.slice(0,colon),value=line.slice(colon+1).trim();if(key.toLowerCase()==='status')status=parseInt(value);else headers[key]=value;}
    response.writeHead(status,headers);sent=true;response.write(header.subarray(boundary+4));});
  child.once('close',()=>response.end());child.stdin.on('error',()=>{});request.pipe(child.stdin);child.stderr.resume();
});
server.listen(0,'127.0.0.1',()=>process.send({port:server.address().port}));
process.on('message',message=>{if(message==='report')process.send({api,fetches,rejected});if(message==='stop')server.close(()=>process.exit(0));});

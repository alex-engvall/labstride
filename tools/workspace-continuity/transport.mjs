// Verification-only authenticated stdio transport. No credential crosses SSH.
import {createInterface} from 'node:readline';
export function remoteGitHubTransport() {
  const pending=new Map();let sequence=0;
  const lines=createInterface({input:process.stdin,crlfDelay:Infinity});
  lines.on('line',line=>{
    if(Buffer.byteLength(line)>3*1024*1024)return;
    let frame;try{frame=JSON.parse(line);}catch{return;}
    const waiter=pending.get(frame.id);if(frame.kind!=='github-response'||!waiter)return;
    pending.delete(frame.id);clearTimeout(waiter.timer);
    if(frame.error)waiter.reject(Error('transport_unknown'));else waiter.resolve(new Response(frame.body,{status:frame.status,headers:frame.headers}));
  });
  lines.on('close',()=>{for(const waiter of pending.values()){clearTimeout(waiter.timer);waiter.reject(Error('transport_unknown'));}pending.clear();});
  return {async fetch(url,options){
    if(url!=='https://api.github.com/graphql'||options.method!=='POST')throw Error('invalid_configuration');
    const body=JSON.parse(options.body);if(typeof body.query!=='string'||Buffer.byteLength(options.body)>65536)throw Error('invalid_configuration');
    const id=++sequence;
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('transport_unknown'));},30000);pending.set(id,{resolve,reject,timer});process.stdout.write(JSON.stringify({kind:'github-request',id,...body})+'\n');});
  },emit(value){process.stdout.write(JSON.stringify(value)+'\n');},close(){lines.close();}};
}
export async function bridgeGitHub(child,{credential,record}) {
  const lines=createInterface({input:child.stdout,crlfDelay:Infinity});let requests=0;
  for await(const line of lines) {
    if(Buffer.byteLength(line)>3*1024*1024)throw Error('oversized_frame');
    const frame=JSON.parse(line);
    if(frame.kind!=='github-request'){record?.(frame);continue;}
    if(!Number.isSafeInteger(frame.id)||typeof frame.query!=='string'||Buffer.byteLength(line)>65536||++requests>2000)throw Error('invalid_frame');
    try {
      const response=await fetch('https://api.github.com/graphql',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{authorization:`Bearer ${await credential()}`,'content-type':'application/json','user-agent':'Labstride-continuity-verification'},body:JSON.stringify({query:frame.query,variables:frame.variables})});
      const body=await response.text();if(Buffer.byteLength(body)>2*1024*1024)throw Error('oversized_response');
      const headers=Object.fromEntries(['content-type','retry-after','x-ratelimit-reset','x-ratelimit-remaining'].map(name=>[name,response.headers.get(name)]).filter(([,value])=>value!==null));
      child.stdin.write(JSON.stringify({kind:'github-response',id:frame.id,status:response.status,headers,body})+'\n');
    }catch{child.stdin.write(JSON.stringify({kind:'github-response',id:frame.id,error:'transport_unknown'})+'\n');}
  }
}

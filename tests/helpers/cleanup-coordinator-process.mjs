import { readFileSync } from 'node:fs';
import { CleanupStore } from '../../packages/storage-sqlite/cleanup.ts';
import { createCleanupWorker } from '../../packages/core/cleanup-worker.ts';
import { inspectCleanup } from '../../packages/target-helper/cleanup.ts';
import { CleanupDeletionRegistry } from '../../packages/target-helper/cleanup-delete.ts';
import { GitHubMergeProvider } from '../../packages/provider-github/merges.ts';
const spec=JSON.parse(readFileSync(process.argv[2],'utf8')),store=new CleanupStore(spec.state);
const options={host:spec.host,mergeProvider:new GitHubMergeProvider({credential:async reference=>reference,
 fetch:(url,init)=>{const u=new URL(url);return fetch(spec.providerUrl+u.pathname+u.search,init);}}),
 keepItem:async()=>spec.keep,
 inspect:request=>inspectCleanup(spec.policy,request,{}, {remote:spec.repository,allowFileTransport:true}),
 async deleteTarget(request){
  if(spec.stage==='before-prepare'&&request.method==='prepare'){process.send({stage:spec.stage});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);}
  const helper=new CleanupDeletionRegistry(spec.policy,{quiescence(){},git:{remote:spec.repository,allowFileTransport:true}});
  let result;try{result=helper.handle(request);}finally{helper.close();}
  if(spec.stage==='after-delete'&&request.method==='commit'&&result.tombstone){process.send({stage:spec.stage});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);}
  return result;
 }};
process.send({stage:'ready'});
process.once('message',async()=>{try{await createCleanupWorker(store,options).assess(spec.requestId);process.send({stage:'unexpected-completion',execution:store.cleanupExecution(spec.requestId)});}catch(error){process.send({error:error.message});}finally{store.close();}});

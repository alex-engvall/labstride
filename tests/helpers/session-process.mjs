import { startCoordinator } from '../../apps/coordinator/main.ts';
import { createWorker,actionKey } from '../../packages/core/worker.ts';
import { createSessionAction,sessionAction,sessionActionVersion } from '../../packages/core/sessions.ts';
import { sessionResolver } from '../../packages/extensions/session-provider.ts';
import { host } from './session-fixture.mjs';
const [directory,stage]=process.argv.slice(2),runtime=startCoordinator(directory),resolver=sessionResolver(host);
const resolve=async profile=>{
  const provider=await resolver.resolve(profile);
  return {...provider,async invoke(request){
    if(stage==='after-effect'){const result=await provider.invoke(request);process.send({stage,sessionId:result.observation?.sessionId});await new Promise(()=>{});return result;}
    process.send({stage});await new Promise(()=>{});return provider.invoke(request);
  }};
};
const worker=createWorker(runtime.store,{executorId:'crash-test',nextAttempt:()=>crypto.randomUUID(),adapters:new Map([[actionKey(sessionAction,sessionActionVersion),createSessionAction(runtime.store,resolve)]])});
await worker.tick();await worker.drain();

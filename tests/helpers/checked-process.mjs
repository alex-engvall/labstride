import {startCoordinator} from '../../apps/coordinator/main.ts';
import {createObservationWorker} from '../../packages/core/observation-worker.ts';
import {checkedProvider} from './checked-projection.mjs';
const [mode,root,target,id]=process.argv.slice(2),{store}=startCoordinator(root),p=store.get('projection',id),external=checkedProvider(target,p);
const barrier=stage=>{process.send({stage});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);};
if(mode==='before-write'){
  const begin=store.beginProjection.bind(store);store.beginProjection=(...args)=>{const token=begin(...args);barrier(mode);return token;};
}else if(mode==='after-write'){
  const write=external.adapter.write.bind(external.adapter);external.adapter.write=async(...args)=>{const result=await write(...args);barrier(mode);return result;};
}else if(mode==='after-ack'){
  const ack=store.acknowledgeProjection.bind(store);store.acknowledgeProjection=(...args)=>{ack(...args);barrier(mode);};
}
const worker=createObservationWorker(store,{sessions:new Map(),projections:new Map([[p.providerId,external.adapter]])});
process.on('message',async()=>{await worker.tick();process.send({stage:'done'});});process.send({stage:'ready'});

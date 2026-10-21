import {startCoordinator} from '../../apps/coordinator/main.ts';
import {createControlWorker} from '../../packages/core/control-worker.ts';
import {actionKey} from '../../packages/core/worker.ts';
import {startPlan} from './execution-fixture.mjs';
const [mode,root,url]=process.argv.slice(2);const {store}=startCoordinator(root);const plan=startPlan();
const barrier=stage=>{process.send({stage});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);};
if(mode==='boundary'){const original=store.beginCancellation.bind(store);store.beginCancellation=id=>{original(id);barrier('boundary');};}
const adapter={async validate(){},async start(){throw Error();},async reconcile(){throw Error();},
 async cancel(request){const result=await(await fetch(url+'/cancel',{method:'POST',body:JSON.stringify(request)})).json();barrier('effect');return result;}};
const worker=createControlWorker(store,{executorId:'control-test',nextAttempt:()=> 'attempt',adapters:new Map([[actionKey(plan.operation.request.actionId,plan.operation.request.actionVersion),adapter]])});
process.on('message',async()=>{await worker.tick();await worker.drain();process.send({stage:'done'});store.close();process.disconnect();});process.send({stage:'ready'});

import {readFileSync}from'node:fs';
import{startCoordinator}from'../../apps/coordinator/main.ts';
import{createWorker,actionKey}from'../../packages/core/worker.ts';
import{createTargetReservationAction,targetResolver}from'../../packages/connector-ssh/runtime.ts';
import{host}from'./ssh-fixture.mjs';
const spec=JSON.parse(readFileSync(process.argv[2],'utf8'));
const{store}=startCoordinator(spec.state);
const connector=await targetResolver(host).resolve(spec.profile);
const adapter=createTargetReservationAction(async()=>({connector,installationId:spec.installationId,revision:1}));
const barrier=stage=>{process.send({stage});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);};
if(spec.stage==='after-boundary'){const original=store.beginEffect.bind(store);store.beginEffect=(...args)=>{original(...args);barrier(spec.stage);};}
if(spec.stage==='after-reply'){const original=adapter.start;adapter.start=async(...args)=>{const result=await original(...args);barrier(spec.stage);return result;};}
const worker=createWorker(store,{executorId:'ssh-crash-test',nextAttempt:()=> 'attempt',adapters:new Map([[actionKey('labstride.target-reserve','1.0.0'),adapter]])});
process.on('message',async()=>{await worker.tick();await worker.drain();store.close();process.disconnect();});process.send({stage:'ready'});

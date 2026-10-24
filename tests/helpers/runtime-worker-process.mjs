import { readFileSync } from 'node:fs';
import { startCoordinator } from '../../apps/coordinator/main.ts';
import { RuntimeRegistry } from '../../packages/target-helper/runtimes.ts';
import { loadExtension, freezeProfile } from '../../packages/extensions/loader.ts';
import { createWorker, actionKey } from '../../packages/core/worker.ts';
const spec=JSON.parse(readFileSync(process.argv[2],'utf8')),registry=new RuntimeRegistry(spec.installation),runtime=startCoordinator(spec.state);
const loaded=await loadExtension(freezeProfile(spec.operation.runId,spec.operation.configDigest,spec.pin,spec.host),spec.host,{runtime:{
  async binding(){return{installationId:spec.installation.runtimePolicy.installationId,targetRevision:1};},async validate(){},invoke:request=>registry.handle(request)}});
const barrier=stage=>{process.send({stage});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);};
const adapter={...loaded.instance,async start(op,claim){if(spec.stage==='after-boundary')barrier('after-boundary');const result=await loaded.instance.start(op,claim);barrier('after-reply');return result;}};
const worker=createWorker(runtime.store,{executorId:'killed-runtime-worker',nextAttempt:()=> 'owned-attempt',adapters:new Map([[actionKey(spec.pin.id,spec.pin.version),adapter]])});
await worker.tick();await worker.drain();registry.close();runtime.store.close();process.exit(0);

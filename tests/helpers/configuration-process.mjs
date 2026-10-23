import { readFileSync } from 'node:fs';
import { compileConfiguration } from '../../packages/configuration/compiler.ts';
import { startCoordinator } from '../../apps/coordinator/main.ts';
import { planFor, context, policyDependencies } from './configuration-fixture.mjs';
import { freezeProfile, loadExtension } from '../../packages/extensions/loader.ts';
import { createWorker, actionKey } from '../../packages/core/worker.ts';
const [state,path,stage]=process.argv.slice(2);
const fixture=JSON.parse(readFileSync(path,'utf8'));
const result=await compileConfiguration(fixture.configuration,{...fixture.dependencies,secrets:{exists:()=>true},provider:{describeField:field=>fixture.descriptors[field.fieldId]}});
if(!result.ok)throw Error(JSON.stringify(result.diagnostics));
const compiled=result.configuration,{store}=startCoordinator(state,policyDependencies);
const barrier=()=>{process.send({stage});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);};
if(stage==='inside'){
 const original=store.bindStartConfiguration.bind(store);
 store.bindStartConfiguration=(...args)=>{original(...args);barrier();};
}
store.requestConfiguredStart(compiled,fixture.observed,{source:JSON.parse(readFileSync(new URL('../../examples/operation.json',import.meta.url))).source},planFor({config:fixture.configuration},compiled),context);
if(stage==='committed')barrier();
const pin=compiled.snapshot.extensionLock.extensions.find(pin=>pin.kind==='action');
const loaded=await loadExtension(freezeProfile('run-example-001',compiled.snapshot.digest,pin,fixture.dependencies.host),fixture.dependencies.host);
const adapter={...loaded.instance,async start(...args){if(stage==='before_effect')barrier();const result=await loaded.instance.start(...args);if(stage==='after_effect')barrier();return result;}};
const worker=createWorker(store,{executorId:'configured-crash',nextAttempt:()=> 'attempt',adapters:new Map([[actionKey(pin.id,pin.version),adapter]])});
await worker.tick();await worker.drain();

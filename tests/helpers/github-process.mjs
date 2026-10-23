import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {startCoordinator} from '../../apps/coordinator/main.ts';
import {createGitHubWorker} from '../../packages/core/github-worker.ts';
import {configurationFixture,localAuthority,planFor} from './configuration-fixture.mjs';
const [mode,root]=process.argv.slice(2),payload=JSON.parse(readFileSync(join(root,'provider-page.json'),'utf8'));
const f=configurationFixture(root);f.config.projections=[];
for(const [id,binding] of Object.entries(f.descriptors))if(id!=='request-a'){binding.history=false;binding.actorAttribution=false;binding.operators=binding.operators.filter(operator=>operator!=='changedTo');}
const compilation=await f.compile();if(!compilation.ok)throw Error('invalid fixture');const compiled=compilation.configuration;
const {store}=startCoordinator(root,{policyAuthority:localAuthority,clock:{now:()=>payload.now}});
const barrier=stage=>{process.send({stage});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);};
if(mode==='history-uncommitted'){
  const commit=store.commitGitHubHistory.bind(store);
  store.commitGitHubHistory=(...args)=>store.transaction(()=>{commit(...args);barrier(mode);});
}else if(mode==='history-committed'){
  const commit=store.commitGitHubHistory.bind(store);store.commitGitHubHistory=(...args)=>{commit(...args);barrier(mode);};
}else if(mode==='admission-committed'){
  const admit=store.admitGitHubCandidate.bind(store);store.admitGitHubCandidate=(...args)=>{admit(...args);barrier(mode);};
}
const adapter={providerId:'test.provider',beginTick(){},async list(){return{items:[payload.item],hasNextPage:false,endCursor:'list-cursor'};},async item(){return payload.item;},
  async history(){return{schemaVersion:'1.0',events:payload.events,hasNextPage:false,endCursor:'history-cursor'};}};
const worker=createGitHubWorker(store,{compiled,adapter,buildPlan:planFor(f,compiled)});
process.on('message',async()=>{await worker.tick();process.send({stage:'done'});});process.send({stage:'ready'});

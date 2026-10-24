import { readFileSync } from 'node:fs';
import { CleanupDeletionRegistry } from '../../packages/target-helper/cleanup-delete.ts';
const spec=JSON.parse(readFileSync(process.argv[2],'utf8'));
const helper=new CleanupDeletionRegistry(spec.policy,{quiescence(){},git:{remote:spec.repository,allowFileTransport:true},
  barrier(stage){if(stage===spec.stage){process.send({stage});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);}}});
process.send({stage:'ready'});
process.once('message',()=>{try{process.send({result:helper.handle(spec.request)});}finally{helper.close();}});

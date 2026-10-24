import { readFileSync } from 'node:fs';
import { RuntimeRegistry } from '../../packages/target-helper/runtimes.ts';
const spec=JSON.parse(readFileSync(process.argv[2],'utf8'));
const registry=new RuntimeRegistry(spec.installation,stage=>{
  if(stage===spec.stage){process.send({stage});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);}
});
await registry.handle(spec.request);registry.close();process.exit(0);

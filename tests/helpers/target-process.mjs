import { readFileSync } from 'node:fs';
import { TargetRegistry } from '../../packages/target-helper/registry.ts';
const [policyFile,requestFile,stage]=process.argv.slice(2);
process.umask(0o077);
const registry=new TargetRegistry(JSON.parse(readFileSync(policyFile,'utf8')),point=>{
  if(point===stage){process.send({stage:point});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);}
});
process.on('message',()=>{
  const result=registry.handle(JSON.parse(readFileSync(requestFile,'utf8')));
  process.send({stage:'result',result});registry.close();process.disconnect();
});
process.send({stage:'ready'});

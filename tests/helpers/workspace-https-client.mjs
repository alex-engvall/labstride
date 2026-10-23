import {readFileSync} from 'node:fs';
import {WorkspaceRegistry} from '../../packages/target-helper/workspaces.ts';
const spec=JSON.parse(readFileSync(process.argv[2],'utf8'));
const registry=new WorkspaceRegistry(spec.policy);
try{const created=await registry.handle(spec.request);const inspected=await registry.handle({...spec.request,method:'inspect'});process.stdout.write(JSON.stringify({created,inspected}));}
finally{registry.close();}

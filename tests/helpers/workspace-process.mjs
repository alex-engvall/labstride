import { readFileSync,appendFileSync } from 'node:fs';
import { WorkspaceRegistry } from '../../packages/target-helper/workspaces.ts';
import { runGit } from '../../packages/target-helper/workspace-git.ts';
const spec=JSON.parse(readFileSync(process.argv[2],'utf8'));
const registry=new WorkspaceRegistry(spec.policy,{async observeSource(){},git(directory,args,access){
  if(args[0]==='remote')args=[...args.slice(0,3),spec.repository];
  if(args[0]==='fetch')appendFileSync(spec.fetchLog,'fetch\n');
  return runGit(directory,['-c','protocol.file.allow=always',...args],access);
},barrier(stage){if(stage===spec.stage){process.send({stage});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);}}});
process.send({stage:'ready'});
process.once('message',async()=>{try{await registry.handle(spec.request);}finally{registry.close();}});

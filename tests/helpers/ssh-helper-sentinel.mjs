// Disposable sshd fixture only; production helper has no fault switches.
import { appendFileSync, readFileSync } from 'node:fs';
import { serve } from '../../apps/target-helper/main.ts';
const [policyFile,marker,behaviorFile]=process.argv.slice(2);
appendFileSync(marker,'started\n');
const behavior=JSON.parse(readFileSync(behaviorFile,'utf8'));
await serve(policyFile,process.stdin,text=>{
  if(behavior.mode==='drop-reply')process.exit(1);
  if(behavior.mode==='forged'){
    const reply=JSON.parse(text);reply.reservation.workspaceId='foreign-workspace';process.stdout.write(JSON.stringify(reply));
  }else if(behavior.mode==='malformed')process.stdout.write('not-json');
  else if(behavior.mode==='oversized')process.stdout.write('x'.repeat(262145));
  else process.stdout.write(text);
});

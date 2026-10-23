import { readFileSync } from 'node:fs';
import { startCoordinator } from '../../apps/coordinator/main.ts';
import { localAuthority, context } from './configuration-fixture.mjs';
const [state,path,stage]=process.argv.slice(2);
const {store}=startCoordinator(state,{policyAuthority:localAuthority});
const barrier=()=>{process.send({stage});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);};
if(stage==='before') {
 const prepare=store.db.prepare.bind(store.db);
 store.db.prepare=sql=>{const statement=prepare(sql);if(sql.startsWith('INSERT INTO policy_changes'))return {run(...args){const result=statement.run(...args);barrier();return result;}};return statement;};
}
store.applyPolicyChange(JSON.parse(readFileSync(path,'utf8')),localAuthority,context);
barrier();

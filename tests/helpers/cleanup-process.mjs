import { CleanupStore } from '../../packages/storage-sqlite/cleanup.ts';
import { freezeProfile, loadExtension } from '../../packages/extensions/loader.ts';
const [state,requestId,decisionId,stage,hostJson]=process.argv.slice(2),host=JSON.parse(hostJson);
const store=new CleanupStore(state),operation=store.beginCleanupAssessment(requestId,decisionId);
if(stage==='after-assessment'){
 const snapshot=store.runConfiguration(operation.runId),pin=snapshot.extensionLock.extensions.find(pin=>pin.id===operation.actionId);
 const loaded=await loadExtension(freezeProfile(operation.runId,snapshot.digest,pin,host),host);
 await loaded.instance.start(operation);
}
process.send({operationId:operation.operationId});
setInterval(()=>{},1000);

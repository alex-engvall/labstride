// Assessment and deletion have separate immutable operations. Only the trusted
// host supplies the target port; inputs cannot select code, credentials or paths.
export function createExtension(configuration, services) {
  if (Object.keys(configuration).length) throw Error('configuration_invalid');
  const result = operation => ({ schemaVersion:'1.0',kind:'result',operationId:operation.operationId,requestDigest:operation.requestDigest,
    result:{status:'accepted',handle:operation.operationId,resources:[],outputs:{cleanupDisposition:'pending_executor'},
      evidenceRefs:[`cleanup-decision:${operation.inputs.decisionId}`],error:null} });
  const deletion = async (operation, method, authorization=null) => {
    if (!services?.target) throw Error('unsupported_capability');
    const binding = await services.target.binding(operation);
    const request = {schemaVersion:'5.0',requestId:operation.operationId,installationId:binding.installationId,targetId:operation.targetId,
      targetRevision:binding.revision,method,operation,authorization};
    const reply = await services.target.invoke(request);
    return {...result(operation),result:{...result(operation).result,outputs:{deletion:reply}}};
  };
  return {async validate(operation){if(operation.inputs.schemaVersion==='2.0'&&!services?.target)throw Error('unsupported_capability');},
    async start(operation){if(operation.inputs.schemaVersion==='2.0')return deletion(operation,'prepare');return result(operation);},
    async reconcile(operation){return operation.inputs.schemaVersion==='2.0'?deletion(operation,'inspect'):result(operation);},
    async commit(operation,authorization){return deletion(operation,'commit',authorization);},
    async release(operation){return deletion(operation,'release');}};
}

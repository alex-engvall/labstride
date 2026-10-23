// Public pinned action. Only the trusted runtime supplies this connector port;
// workflow/issue inputs cannot provide services, executable code or credentials.
export function createExtension(configuration, services) {
  if (Object.keys(configuration).length || !services?.target) throw new Error('configuration_invalid');
  const target = services.target;
  const request = async (operation, method) => {
    const binding = await target.binding(operation);
    return { schemaVersion:'2.0',requestId:operation.operationId,installationId:binding.installationId,
      targetId:operation.targetId,targetRevision:binding.revision,method,operation };
  };
  const call = async (operation, method) => {
    const reply = await target.invoke(await request(operation,method));
    if (method === 'inspect' && reply.outcome === 'error') throw new Error('outcome_unknown');
    const workspace=reply.workspace;
    return {schemaVersion:'1.0',kind:'result',operationId:operation.operationId,requestDigest:operation.requestDigest,
      result:{status:reply.outcome==='ok'?'succeeded':reply.outcome==='error'?'failed':'outcome_unknown',handle:operation.operationId,
        resources:workspace?[{id:workspace.handle,type:'source-checkout',state:'ready'}]:[],outputs:workspace?{workspace}:{},
        evidenceRefs:[`target:helper-response:${operation.operationId}`],error:reply.error}};
  };
  return {createsWorkspace:true,async validate(operation) {await target.validate(await request(operation,'create'));},
    start:operation=>call(operation,'create'),reconcile:operation=>call(operation,'inspect')};
}

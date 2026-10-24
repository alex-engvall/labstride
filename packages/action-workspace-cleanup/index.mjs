// Eligibility is not a deletion receipt. W05.2 supplies the separately qualified
// filesystem executor; this reference action records a pending handoff only.
export function createExtension(configuration) {
  if (Object.keys(configuration).length) throw Error('configuration_invalid');
  const result = operation => ({ schemaVersion:'1.0',kind:'result',operationId:operation.operationId,requestDigest:operation.requestDigest,
    result:{status:'accepted',handle:operation.operationId,resources:[],outputs:{cleanupDisposition:'pending_executor'},
      evidenceRefs:[`cleanup-decision:${operation.inputs.decisionId}`],error:null} });
  return {async validate(){},async start(operation){return result(operation);},async reconcile(operation){return result(operation);}};
}

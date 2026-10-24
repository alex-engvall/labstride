// Recipe code and credentials are supplied only by the enrolled target helper.
export function createExtension(configuration,services) {
  if(Object.keys(configuration).length || !services?.runtime)throw new Error('configuration_invalid');
  const port=services.runtime;
  const request=async(op,method)=>({schemaVersion:'3.0',requestId:op.operationId,...await port.binding(op),targetId:op.targetId,method,operation:op});
  const call=async(op,method)=>{
    const reply=await port.invoke(await request(op,method));
    if(method==='inspect'&&reply.outcome==='error')throw new Error('outcome_unknown');
    const runtime=reply.runtime;
    return {schemaVersion:'1.0',kind:'result',operationId:op.operationId,requestDigest:op.requestDigest,result:{
      status:reply.outcome==='ok'?'succeeded':reply.outcome==='error'?'failed':'outcome_unknown',handle:op.operationId,
      resources:runtime?runtime.resources.map(resource=>({id:resource.name,type:resource.type,state:resource.state})):[],
      outputs:runtime?{runtime}:{},evidenceRefs:[`target:runtime:${op.operationId}`],error:reply.error}};
  };
  return {async validate(op){await port.validate(await request(op,'create'));},start:op=>call(op,'create'),reconcile:op=>call(op,'inspect')};
}

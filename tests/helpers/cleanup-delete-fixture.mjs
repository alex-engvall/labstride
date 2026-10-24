import assert from 'node:assert/strict';
import { join } from 'node:path';
import { workspaceFixture } from './workspace-fixture.mjs';
import { WorkspaceRegistry } from '../../packages/target-helper/workspaces.ts';
import { CleanupDeletionRegistry } from '../../packages/target-helper/cleanup-delete.ts';
import { digest, requestDigest } from '../../packages/storage-sqlite/execution.ts';
export async function deletionFixture(t) {
  const f=workspaceFixture(t),registry=new WorkspaceRegistry(f.policy,f.dependencies);
  let receipt;try{const result=await registry.handle(f.request);assert.equal(result.outcome,'ok',JSON.stringify(result));receipt=result.workspace;}finally{registry.close();}
  f.policy.cleanup={profile:'linux-exclusive-writers.v1'};
  const policy={schemaVersion:'1.0',trigger:'operator_request',actionId:'labstride.workspace-cleanup',actionVersion:'1.1.0',completion:'merge_only',regenerableIgnoredPaths:[]};
  const op={...f.operation,operationId:'cleanup-delete-test',actionId:policy.actionId,actionVersion:policy.actionVersion,
    inputs:{schemaVersion:'2.0',workspaceId:receipt.workspaceId,creationOperationId:receipt.operationId,receiptDigest:digest(receipt),decisionId:'a'.repeat(64),policy}};
  op.requestDigest=requestDigest(op);
  const request={schemaVersion:'5.0',requestId:op.operationId,installationId:f.policy.installationId,targetId:f.policy.targetId,targetRevision:1,method:'prepare',operation:op,authorization:null};
  const dependencies={quiescence(){},git:{remote:f.repository,allowFileTransport:true}};
  const call=(input=request,extra={})=>{const helper=new CleanupDeletionRegistry(f.policy,{...dependencies,...extra});try{return helper.handle(input);}finally{helper.close();}};
  const commit=preparation=>({...request,method:'commit',authorization:{decisionId:'b'.repeat(64),preparedDigest:digest(preparation),expiresAt:new Date(Date.now()+30000).toISOString()}});
  return {...f,receipt,op,request,dependencies,call,commit,path:join(f.policy.roots[0].path,receipt.locator),
    destination:join(f.policy.roots[0].path,'.labstride-deleting',digest([f.policy.installationId,f.policy.targetId,op.operationId]))};
}

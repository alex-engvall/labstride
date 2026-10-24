import { validated } from '../storage-sqlite/validation.ts';
import { digest, requestDigest } from '../storage-sqlite/execution.ts';
import { TargetError } from './filesystem.ts';
import type { TrustedRuntimeInstallationV3 } from '../../contracts/generated/ssh-runtime-installation.ts';
import type { TrustedRuntimeHelperRequestV3 } from '../../contracts/generated/ssh-runtime-request.ts';
import type { TrustedRuntimeHelperResponseV3 } from '../../contracts/generated/ssh-runtime-response.ts';
import type { OwnedRuntimeReceiptV1 } from '../../contracts/generated/runtime-receipt.ts';
import type { InstalledRuntimeRecipeV1 } from '../../contracts/generated/runtime-recipe.ts';
import type { RuntimeCreateInputV1 } from '../../contracts/generated/runtime-create-input.ts';
export type RuntimeInstallation=TrustedRuntimeInstallationV3;
export type RuntimeRequest=TrustedRuntimeHelperRequestV3;
export type RuntimeResponse=TrustedRuntimeHelperResponseV3;
export type RuntimeReceipt=OwnedRuntimeReceiptV1;
export type RuntimeRecipe=InstalledRuntimeRecipeV1;
export type RuntimeInput=RuntimeCreateInputV1;
export const runtimeAction='labstride.runtime-create';
export const runtimeVersion='1.0.0';
export const runtimeCapabilities=['runtime.probe.v1','runtime.create.v1','runtime.inspect.v1'] as const;
export function runtimeNamespace(installationId:string,targetId:string,workspaceId:string,recipe:RuntimeInput['recipe']):string {
  return 'rt-'+digest([installationId,targetId,workspaceId,recipe]).slice(0,40);
}
export function validateRuntimeRequest(installation:RuntimeInstallation,input:unknown):RuntimeRequest {
  const r=validated('ssh-runtime-request',input as RuntimeRequest),p=installation.runtimePolicy;
  if(r.installationId!==p.installationId || r.targetId!==p.targetId || r.targetRevision!==p.targetRevision)throw new TargetError('identity_mismatch');
  if(r.method==='probe')return r;
  const op=r.operation!,i=validated('runtime-create-input',op.inputs as unknown as RuntimeInput);
  if(op.actionId!==runtimeAction || op.actionVersion!==runtimeVersion || op.operationId!==r.requestId || op.targetId!==r.targetId ||
    op.requestDigest!==requestDigest(op) || i.target!==r.targetId)throw new TargetError('identity_mismatch');
  if(!installation.workspacePolicy.roots.some(root=>root.id===i.rootId))throw new TargetError('forbidden');
  const recipe=p.recipes.find(recipe=>recipe.id===i.recipe.id && recipe.version===i.recipe.version);
  if(!recipe)throw new TargetError('forbidden');
  if(digest(recipe)!==i.recipe.digest)throw new TargetError('identity_mismatch');
  return r;
}

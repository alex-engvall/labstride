import type { GitHubItem } from '../core/github.ts';
import type { LabstrideInstallationConfigurationV1 as Configuration } from '../../contracts/generated/config.ts';
import type { ProviderDescription } from '../configuration/compiler.ts';
interface ProjectionProvider {
  withConfiguration(configuration:Configuration):ProjectionProvider;
  item(id:string):Promise<GitHubItem|null>;
  describeField(field:Configuration['fields'][string],credentialRef:string):Promise<ProviderDescription>;
  setField(scopeId:string,itemId:string,fieldId:string,type:string,value:unknown,token:string):Promise<void>;
}
import type { GitHubStore } from '../storage-sqlite/github.ts';
import { githubFingerprint } from '../storage-sqlite/github.ts';
import type { ProjectionAdapter, ProjectionView } from '../core/observations.ts';
import type { RecordOf } from '../core/lifecycle.ts';
import { LifecycleError } from '../core/lifecycle.ts';
import { PreEffectTransient } from '../core/worker.ts';
import { same } from '../configuration/values.ts';
import { GitHubError } from '../core/github.ts';

export function createGitHubProjection(store:GitHubStore,adapter:ProjectionProvider):ProjectionAdapter{
  const read=async(projection:RecordOf<'projection'>):Promise<ProjectionView>=>{
    const context=store.githubProjectionContext(projection),scoped=adapter.withConfiguration(context.configuration);
    const item=await scoped.item(context.itemId);
    if(!item||item.scopeId!==context.scopeId)throw new LifecycleError('identity_conflict');
    const state=item.fields[context.logical];if(!state)throw new LifecycleError('invalid_payload');
    return{schemaVersion:'1.0',providerId:projection.providerId,subjectId:projection.subjectId,fieldId:projection.fieldId,generation:context.generation,
      version:githubFingerprint(item,context.logical),value:state.present?state.value:null,appliedToken:null};
  };
  return{
    capabilities:{schemaVersion:'1.0',mode:'checked',durableWriteIdentity:false},
    async read(projection){return read(projection);},
    async write(projection,token){
      // This is a second, immediate pre-read after the durable attempt boundary.
      // GitHub has no field CAS; the remaining remote race is explicit.
      let context,field,scoped;
      try{
        const before=await read(projection);
        if(before.version!==projection.payload.expectedFingerprint||before.generation!==projection.generation||!store.projectionAllowed(projection.runId))
          throw new PreEffectTransient('Projection precondition rejected before mutation');
        context=store.githubProjectionContext(projection);field=context.configuration.fields[context.logical];
        scoped=adapter.withConfiguration(context.configuration);
        const descriptor=await scoped.describeField(field,field.source==='project_v2'?context.configuration.github.projectCredentialRef:context.configuration.github.credentialRef);
        if(!descriptor.writable)throw new PreEffectTransient('Projection binding is not writable');
      }catch{throw new PreEffectTransient('Read-only preflight failed before mutation');}
      // No remote observation after the final policy/generation check and before
      // mutation. Platform permissions still apply independently.
      if(!store.projectionAllowed(projection.runId)||store.githubProjectionContext(projection).generation!==projection.generation)
        throw new PreEffectTransient('Projection generation or policy changed');
      try{await scoped.setField(context.scopeId,context.itemId,projection.fieldId,field.type,projection.payload.value,token);}
      catch(error){
        if(error instanceof GitHubError&&['budget_exhausted','credential_unavailable','invalid_value','unsupported_binding'].includes(error.code))throw new PreEffectTransient('Mutation was not submitted');
        throw error;
      }
      const after=await read(projection);
      if(!same(after.value,projection.payload.value))throw new LifecycleError('identity_conflict');
      return after;
    },
  };
}

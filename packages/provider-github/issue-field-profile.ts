import type {GitHubIssueFieldProfile} from '../../contracts/generated/github-issue-field-profile.ts';
import type {LabstrideInstallationConfigurationV1 as Configuration} from '../../contracts/generated/config.ts';
import {validated} from '../storage-sqlite/validation.ts';
import {GitHubError} from '../core/github.ts';
// This profile is installation configuration. Issue values cannot change it.
// A caller installs the returned fragment through ordinary compile/preflight and
// policy activation; this function neither activates a service nor grants access.
export function issueFieldConfiguration(input:GitHubIssueFieldProfile):Pick<Configuration,'fields'|'rules'|'projections'> {
  const profile=validated('github-issue-field-profile',input),fields=profile.fields;
  for(const [name,field] of Object.entries(fields)){
    if(field.source!=='organization_issue_field'||field.scopeId!==profile.repositoryId||field.type!==(['session','path'].includes(name)?'string':'single-select'))throw new GitHubError('binding_invalid');
  }
  if(new Set(Object.values(fields).map(field=>field.fieldId)).size!==6)throw new GitHubError('binding_invalid');
  for(const name of ['approved','provisioning','ready'])if(!fields.request.options?.[name])throw new GitHubError('binding_invalid');
  if(profile.sourceRoot.split('/').some(part=>part==='.'||part==='..'))throw new GitHubError('binding_invalid');
  for(const name of ['aiMode','model','reasoning'] as const){
    const mapping=profile.runtimeValues[name];
    if(Object.keys(mapping).some(id=>!Object.values(fields[name].options??{}).includes(id)))throw new GitHubError('binding_invalid');
  }
  return {fields:{...fields,request:{...fields.request,allowManagedProgress:true}},
    rules:[{id:'workspace-request',event:'field.changed',condition:{field:'request',op:'changedTo',value:'approved'},workflow:profile.workflow}],
    projections:[{fact:'run.preparing',field:'request',value:'provisioning'},{fact:'workspace.ready',field:'request',value:'ready'},
      {fact:'workspace.ready',field:'path',valueFrom:{kind:'workspace-source-path',targetId:profile.targetId,rootId:profile.rootId,rootPath:profile.sourceRoot}},
      {fact:'session.ready',field:'session',valueFrom:{kind:'session-id'}}]};
}
export function issueFieldSessionInputs(input:GitHubIssueFieldProfile){
  const profile=validated('github-issue-field-profile',input);issueFieldConfiguration(profile);
  return Object.fromEntries((['aiMode','model','reasoning'] as const).map(name=>[name,{binding:'field' as const,field:name,mapping:profile.runtimeValues[name]}]));
}

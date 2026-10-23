import type { LabstrideInstallationConfigurationV1 as Configuration } from '../../contracts/generated/config.ts';
import type { ProviderDescription } from '../configuration/compiler.ts';
import type { GitHubHistory, GitHubHistoryEvent, GitHubItem, GitHubReader } from '../core/github.ts';
import { GitHubError } from '../core/github.ts';
import { GitHubClient, object, string, nodes, pageInfo } from './client.ts';
import { validated } from '../storage-sqlite/validation.ts';
import { createGitHubProjection } from './projection.ts';
import type { GitHubStore } from '../storage-sqlite/github.ts';
import type { GitHubHistoryQualification } from '../../contracts/generated/github-history-qualification.ts';

const itemFields=`id updatedAt project{id} content{
  __typename ... on Issue{id title body state repository{id nameWithOwner defaultBranchRef{target{oid}}}}
  ... on PullRequest{id title body state repository{id nameWithOwner defaultBranchRef{target{oid}}}}
} fieldValues(first:100){pageInfo{hasNextPage endCursor} nodes{
  __typename ... on ProjectV2ItemFieldSingleSelectValue{optionId name field{... on ProjectV2SingleSelectField{id}}}
  ... on ProjectV2ItemFieldTextValue{text field{... on ProjectV2Field{id}}}
  ... on ProjectV2ItemFieldNumberValue{number field{... on ProjectV2Field{id}}}
  ... on ProjectV2ItemFieldDateValue{date field{... on ProjectV2Field{id}}}
}}`;
const fieldFields=`__typename ... on ProjectV2Field{id name dataType}
  ... on ProjectV2SingleSelectField{id name dataType options{id name}}`;
const historyFields=`__typename
 ... on ProjectV2ItemStatusChangedEvent{id createdAt previousStatus status project{id} actor{... on User{id} ... on Bot{id}}}
 ... on AddedToProjectV2Event{id createdAt project{id} actor{... on User{id} ... on Bot{id}}}
 ... on RemovedFromProjectV2Event{id createdAt project{id} actor{... on User{id} ... on Bot{id}}}`;
export type HistoryQualification=GitHubHistoryQualification;
export interface GitHubAdapterOptions {
  providerId:string;
  configuration:Configuration;
  client:GitHubClient;
  // Installation-owned enrollment of the built-in Status field. Qualification
  // must find this independently observed actor-bearing event, using the exact
  // Project credential. Current-state creator metadata is never a substitute.
  historyQualifications:readonly HistoryQualification[];
}
export class GitHubAdapter implements GitHubReader {
  readonly providerId:string;
  #options:GitHubAdapterOptions;
  #fields=new Map<string,Record<string,unknown>[]>();
  #qualified=new Set<string>();
  constructor(options:GitHubAdapterOptions){
    this.providerId=string(options.providerId);this.#options={...options,configuration:structuredClone(options.configuration),historyQualifications:options.historyQualifications.map(value=>validated('github-history-qualification',value))};
  }
  beginTick():void{this.#options.client.beginTick();this.#fields.clear();this.#qualified.clear();}
  withConfiguration(configuration:Configuration):GitHubAdapter{return new GitHubAdapter({...this.#options,configuration});}
  projection(store:GitHubStore){return createGitHubProjection(store,this);}
  private async projectFields(scopeId:string):Promise<Record<string,unknown>[]>{
    const cached=this.#fields.get(scopeId);if(cached)return cached;
    const fields:Record<string,unknown>[]=[];let after:string|null=null;
    do{
      const data=object(await this.#options.client.query(`query LabstrideFields($id:ID!,$after:String){node(id:$id){... on ProjectV2{id viewerCanUpdate fields(first:100,after:$after){nodes{${fieldFields}} pageInfo{hasNextPage endCursor}}}}}`,
        {id:scopeId,after},this.#options.configuration.github.projectCredentialRef));
      const project=object(data.node);if(project.id!==scopeId)throw new GitHubError('binding_invalid');
      const connection=object(project.fields),page=pageInfo(connection.pageInfo);
      fields.push(...nodes(connection.nodes).map(field=>({...field,viewerCanUpdate:project.viewerCanUpdate})));
      if(page.hasNextPage&&page.endCursor===after)throw new GitHubError('invalid_provider_data');
      after=page.hasNextPage?page.endCursor:null;
    }while(after);
    this.#fields.set(scopeId,fields);return fields;
  }
  async describeField(field:Configuration['fields'][string],credentialRef:string):Promise<ProviderDescription>{
    const config=this.#options.configuration;
    if(field.source==='native_issue'){
      if(credentialRef!==config.github.credentialRef||field.type!=='string'||!['title','body','state'].includes(field.fieldId))throw new GitHubError('unsupported_binding');
      const data=object(await this.#options.client.query('query LabstrideRepository($id:ID!){node(id:$id){... on Repository{id nameWithOwner}}}',{id:field.scopeId},credentialRef));
      const repo=object(data.node);if(repo.id!==field.scopeId||!config.github.repositories.includes(string(repo.nameWithOwner)))throw new GitHubError('binding_invalid');
      return {schemaVersion:'1.0',providerId:this.providerId,credentialRef,source:field.source,scopeId:field.scopeId,fieldId:field.fieldId,type:'string',optionIds:[],
        operators:['equals','notEquals','contains','exists'],readable:true,writable:false,history:false,actorAttribution:false,evidenceRefs:[`github:repository:${field.scopeId}`]};
    }
    if(field.source!=='project_v2'||credentialRef!==config.github.projectCredentialRef)throw new GitHubError('unsupported_binding');
    const found=(await this.projectFields(field.scopeId)).find(value=>value.id===field.fieldId);
    const types:Record<string,string>={TEXT:'string',NUMBER:'number',DATE:'date',SINGLE_SELECT:'single-select'};
    if(!found||types[string(found.dataType)]!==field.type)throw new GitHubError('binding_invalid');
    const options=found.options?nodes(found.options):[];
    const qualification=this.#options.historyQualifications.find(value=>value.scopeId===field.scopeId&&value.fieldId===field.fieldId);
    let history=false;
    if(qualification){
      const qualificationKey=JSON.stringify(qualification);
      if(!this.#qualified.has(qualificationKey)){
        let cursor:string|null=null,matched=false;
        do{
          const page=await this.history(qualification.subjectId,cursor);
          const event=page.events.find(event=>event.id===qualification.eventId&&event.scopeId===field.scopeId&&event.kind==='status'&&event.actorId===qualification.actorId);
          if(event){
            // Enrollment records an actual Status event and its independently
            // qualified option ID. Display renames cannot invalidate that ID.
            if(event.status!==qualification.status||options.filter(option=>option.id===qualification.optionId).length!==1)throw new GitHubError('unsupported_history_binding');
            matched=true;
          }
          if(!page.hasNextPage)break;cursor=page.endCursor;
        }while(cursor);
        if(!matched)throw new GitHubError('history_unavailable');
        this.#qualified.add(qualificationKey);
      }
      history=true;
    }
    return {schemaVersion:'1.0',providerId:this.providerId,credentialRef,source:field.source,scopeId:field.scopeId,fieldId:field.fieldId,type:field.type,
      optionIds:options.map(option=>string(option.id)),operators:['equals','notEquals','exists',...(field.type==='string'?['contains' as const]:[]),...(history?['changedTo' as const]:[])],
      readable:true,writable:found.viewerCanUpdate===true,history,actorAttribution:history,evidenceRefs:[`github:field:${field.fieldId}`,...(qualification?[`github:history:${qualification.eventId}`]:[])],
      displayName:string(found.name),optionNames:Object.fromEntries(options.map(option=>[string(option.id),string(option.name)]))};
  }
  private async snapshot(raw:Record<string,unknown>):Promise<GitHubItem|null>{
    const content=raw.content===null?null:object(raw.content);
    if(!content||!['Issue','PullRequest'].includes(string(content.__typename)))return null;
    const repository=object(content.repository),repositoryName=string(repository.nameWithOwner);
    if(!this.#options.configuration.github.repositories.includes(repositoryName))return null;
    const scopeId=string(object(raw.project).id),fields:GitHubItem['fields']={},optionNames:GitHubItem['optionNames']={};
    const connection=object(raw.fieldValues);
    if(pageInfo(connection.pageInfo).hasNextPage)throw new GitHubError('field_page_limit');
    const values=nodes(connection.nodes),descriptors=await this.projectFields(scopeId);
    for(const [logical,field] of Object.entries(this.#options.configuration.fields)){
      if(field.source==='native_issue'&&field.scopeId===repository.id){
        if(!['title','body','state'].includes(field.fieldId)||field.type!=='string')throw new GitHubError('unsupported_binding');
        const value=content[field.fieldId];if(typeof value!=='string')throw new GitHubError('invalid_provider_data');fields[logical]={present:true,value};continue;
      }
      if(field.source!=='project_v2'||field.scopeId!==scopeId)continue;
      const descriptor=descriptors.find(value=>value.id===field.fieldId);
      const types:Record<string,string>={TEXT:'string',NUMBER:'number',DATE:'date',SINGLE_SELECT:'single-select'};
      if(!descriptor||types[string(descriptor.dataType)]!==field.type)throw new GitHubError('binding_invalid');
      const options=descriptor.options?nodes(descriptor.options):[];
      if(Object.values(field.options??{}).some(id=>!options.some(option=>option.id===id)))throw new GitHubError('binding_invalid');
      optionNames[logical]=Object.fromEntries(options.map(option=>[string(option.id),string(option.name)]));
      const value=values.find(value=>value.field&&object(value.field).id===field.fieldId);
      if(!value){fields[logical]={present:false};continue;}
      const property=field.type==='single-select'?'optionId':field.type==='string'?'text':field.type==='number'?'number':'date';
      const current=value[property];
      if(current!==null&&typeof current!==(field.type==='number'?'number':'string'))throw new GitHubError('invalid_provider_data');
      if(field.type==='single-select'&&current!==null&&!options.some(option=>option.id===current))throw new GitHubError('binding_invalid');
      fields[logical]={present:true,value:current as string|number|null};
    }
    const sha=string(object(object(repository.defaultBranchRef).target).oid);
    return validated('github-item',{schemaVersion:'1.0',scopeId,itemId:string(raw.id),subjectId:string(content.id),repositoryId:string(repository.id),repository:repositoryName,
      sourceSha:sha,updatedAt:string(raw.updatedAt),fields,optionNames} as GitHubItem);
  }
  async list(scopeId:string,cursor:string|null):Promise<{items:GitHubItem[];endCursor:string|null;hasNextPage:boolean}>{
    const data=object(await this.#options.client.query(`query LabstrideItems($id:ID!,$after:String){node(id:$id){... on ProjectV2{id items(first:20,after:$after){nodes{${itemFields}} pageInfo{hasNextPage endCursor}}}}}`,
      {id:scopeId,after:cursor},this.#options.configuration.github.projectCredentialRef));
    const project=object(data.node);if(project.id!==scopeId)throw new GitHubError('binding_invalid');
    const connection=object(project.items),page=pageInfo(connection.pageInfo),items:GitHubItem[]=[];
    for(const raw of nodes(connection.nodes)){const item=await this.snapshot(raw);if(item)items.push(item);}
    return{items,...page};
  }
  async item(itemId:string):Promise<GitHubItem|null>{
    const data=object(await this.#options.client.query(`query LabstrideItem($id:ID!){node(id:$id){... on ProjectV2Item{${itemFields}}}}`,{id:itemId},this.#options.configuration.github.projectCredentialRef));
    return data.node===null?null:this.snapshot(object(data.node));
  }
  async history(subjectId:string,cursor:string|null):Promise<GitHubHistory>{
    const data=object(await this.#options.client.query(`query LabstrideHistory($id:ID!,$after:String){node(id:$id){
      ... on Issue{timelineItems(first:100,after:$after,itemTypes:[ADDED_TO_PROJECT_V2_EVENT,REMOVED_FROM_PROJECT_V2_EVENT,PROJECT_V2_ITEM_STATUS_CHANGED_EVENT]){nodes{${historyFields}} pageInfo{hasNextPage endCursor}}}
      ... on PullRequest{timelineItems(first:100,after:$after,itemTypes:[ADDED_TO_PROJECT_V2_EVENT,REMOVED_FROM_PROJECT_V2_EVENT,PROJECT_V2_ITEM_STATUS_CHANGED_EVENT]){nodes{${historyFields}} pageInfo{hasNextPage endCursor}}}
    }}`,{id:subjectId,after:cursor},this.#options.configuration.github.projectCredentialRef));
    const connection=object(object(data.node).timelineItems),page=pageInfo(connection.pageInfo);
    const events:GitHubHistoryEvent[]=nodes(connection.nodes).map(raw=>{
      const type=string(raw.__typename),kind=type==='ProjectV2ItemStatusChangedEvent'?'status':type==='AddedToProjectV2Event'?'added':type==='RemovedFromProjectV2Event'?'removed':null;
      if(!kind)throw new GitHubError('invalid_provider_data');
      const actor=raw.actor===null?null:object(raw.actor);
      return {id:string(raw.id),kind,scopeId:string(object(raw.project).id),actorId:actor?.id?string(actor.id):null,occurredAt:string(raw.createdAt),
        previousStatus:kind==='status'?typeof raw.previousStatus==='string'?raw.previousStatus:null:null,status:kind==='status'?typeof raw.status==='string'?raw.status:null:null};
    });
    return validated('github-history-page',{schemaVersion:'1.0',events,...page});
  }
  async setField(scopeId:string,itemId:string,fieldId:string,type:string,value:unknown,token:string):Promise<void>{
    const clear=value===null;
    const property=type==='single-select'?'singleSelectOptionId':type==='string'?'text':type==='number'?'number':type==='date'?'date':null;
    if(!property)throw new GitHubError('unsupported_binding');
    if(!clear&&(typeof value!==(type==='number'?'number':'string')||typeof value==='number'&&!Number.isFinite(value)))throw new GitHubError('invalid_value');
    const input={projectId:scopeId,itemId,fieldId,clientMutationId:token,...(clear?{}:{value:{[property]:value}})};
    const operation=clear?'clearProjectV2ItemFieldValue':'updateProjectV2ItemFieldValue',inputType=clear?'ClearProjectV2ItemFieldValueInput!':'UpdateProjectV2ItemFieldValueInput!';
    await this.#options.client.query(`mutation LabstrideProjection($input:${inputType}){${operation}(input:$input){clientMutationId}}`,{input},this.#options.configuration.github.projectCredentialRef);
  }
}

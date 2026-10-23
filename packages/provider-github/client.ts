import { GitHubError } from '../core/github.ts';

export interface GitHubClientOptions {
  credential(reference:string):Promise<string>;
  apiUrl?:string;
  fetch?:typeof fetch;
  requestsPerTick?:number;
  timeoutMs?:number;
}
export class GitHubClient {
  #remaining:number;
  #limit:number;
  #options:GitHubClientOptions;
  #url:string;
  constructor(options:GitHubClientOptions){
    this.#options={...options};this.#url=options.apiUrl??'https://api.github.com/graphql';
    const url=new URL(this.#url);
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new GitHubError('invalid_configuration');
    this.#limit=options.requestsPerTick??32;this.#remaining=this.#limit;
    if(!Number.isSafeInteger(this.#limit)||this.#limit<2||this.#limit>1000||
      options.timeoutMs!==undefined&&(!Number.isSafeInteger(options.timeoutMs)||options.timeoutMs<1||options.timeoutMs>120000))throw new GitHubError('invalid_configuration');
  }
  beginTick():void{this.#remaining=this.#limit;}
  async query(query:string,variables:Record<string,unknown>,reference:string):Promise<unknown>{
    if(this.#remaining--<=0)throw new GitHubError('budget_exhausted',1000);
    let token:string;
    try{token=await this.#options.credential(reference);}catch{throw new GitHubError('credential_unavailable');}
    if(!token)throw new GitHubError('credential_unavailable');
    let response:Response;
    try{response=await(this.#options.fetch??fetch)(this.#url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(this.#options.timeoutMs??15000),
      headers:{authorization:`Bearer ${token}`,'content-type':'application/json',accept:'application/vnd.github+json','user-agent':'Labstride'},body:JSON.stringify({query,variables})});}
    catch{throw new GitHubError('transport_unknown');}
    const retry=response.headers.get('retry-after');
    const reset=response.headers.get('x-ratelimit-reset');
    const retryMs=retry&&/^\d+$/.test(retry)?Math.min(Number(retry)*1000,86400000):reset&&/^\d+$/.test(reset)?Math.min(Math.max(Number(reset)*1000-Date.now(),1000),86400000):60000;
    if(response.status===401)throw new GitHubError('credential_expired',60000);
    if(response.status===429||response.status===403&&response.headers.get('x-ratelimit-remaining')==='0')throw new GitHubError('rate_limited',retryMs);
    if(response.status===403)throw new GitHubError('permission_denied',60000);
    if(!response.ok)throw new GitHubError('provider_unavailable');
    const reader=response.body?.getReader();if(!reader)throw new GitHubError('invalid_provider_data');
    const parts:Uint8Array[]=[];let size=0;
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2097152){await reader.cancel();throw new GitHubError('response_too_large');}parts.push(value);}
    let result:Record<string,unknown>;
    try{result=object(JSON.parse(Buffer.concat(parts).toString('utf8')));}catch{throw new GitHubError('invalid_provider_data');}
    if(Array.isArray(result.errors)&&result.errors.length){
      const errors=result.errors.map(object);
      if(errors.some(error=>error.type==='INVALID_CURSOR_ARGUMENTS'))throw new GitHubError('invalid_cursor');
      if(errors.some(error=>error.type==='RATE_LIMITED'))throw new GitHubError('rate_limited',retryMs);
      throw new GitHubError('graphql_errors'); // Partial data never advances a checkpoint.
    }
    if(result.data===undefined||result.data===null)throw new GitHubError('invalid_provider_data');
    return result.data;
  }
}
export function object(value:unknown):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new GitHubError('invalid_provider_data');return value as Record<string,unknown>;
}
export function string(value:unknown):string{if(typeof value!=='string'||!value||value.length>4096)throw new GitHubError('invalid_provider_data');return value;}
export function nodes(value:unknown):Record<string,unknown>[]{if(!Array.isArray(value))throw new GitHubError('invalid_provider_data');return value.map(object);}
export function pageInfo(value:unknown):{endCursor:string|null;hasNextPage:boolean}{
  const page=object(value);if(typeof page.hasNextPage!=='boolean')throw new GitHubError('invalid_provider_data');
  const endCursor=page.endCursor===null?null:string(page.endCursor);
  if(page.hasNextPage&&!endCursor)throw new GitHubError('invalid_provider_data');
  return{endCursor,hasNextPage:page.hasNextPage};
}

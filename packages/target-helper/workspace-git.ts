import { lstatSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readProtected, TargetError } from './filesystem.ts';
import type { WorkspacePolicy } from './workspace-contracts.ts';
export type SourceBinding = WorkspacePolicy['sources'][number];
export interface SourceAccess { binding: SourceBinding; token: string | null }
export function sourceAccess(binding: SourceBinding): SourceAccess {
  for (const address of [binding.gitUrl,binding.apiUrl]) {
    const url = new URL(address);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new TargetError('configuration_invalid');
  }
  if(binding.credentialFile!==null && (lstatSync(binding.credentialFile).mode&0o077)!==0)throw new TargetError('configuration_invalid');
  const token = binding.credentialFile === null ? null : readProtected(binding.credentialFile, process.getuid!(), 8192).toString('utf8').trim();
  if (token !== null && (!token || /[\r\n\0]/.test(token))) throw new TargetError('configuration_invalid');
  return { binding, token };
}
export async function observeSource(access: SourceAccess): Promise<void> {
  const { binding, token } = access;
  try {
    const response = await fetch(binding.apiUrl, { redirect:'error', signal:AbortSignal.timeout(10000), headers: {
      Accept:'application/vnd.github+json', 'User-Agent':'labstride-workspace', ...(token ? { Authorization:`Bearer ${token}` } : {}),
    } });
    if (!response.ok) throw new TargetError([401,403,404].includes(response.status) ? 'authentication_failed' : 'transient_unavailable');
    const reader=response.body?.getReader(); if(!reader)throw new TargetError('operation_failed');
    let size=0; const chunks:Uint8Array[]=[];
    try { for(;;) {const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>65536)throw new TargetError('operation_failed');chunks.push(item.value);} }
    finally {await reader.cancel();}
    const repository = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if ((String(repository.id) !== binding.repositoryId && repository.node_id !== binding.repositoryId) || repository.full_name !== binding.repository || repository.clone_url !== binding.gitUrl)
      throw new TargetError('identity_mismatch');
  } catch(error) { if(error instanceof TargetError)throw error; throw new TargetError('transient_unavailable'); }
}
// No inherited Git configuration, credential helper, templates, filters or
// executable repository hooks. Auth is child-local configuration, never argv or
// on-disk config. The clone's origin always remains credential-free.
export function runGit(directory: string, args: string[], access?: SourceAccess): string {
  const env: NodeJS.ProcessEnv = { PATH:'/usr/bin:/bin', LANG:'C', HOME:'/', GIT_CONFIG_NOSYSTEM:'1', GIT_CONFIG_GLOBAL:'/dev/null',
    GIT_CONFIG_SYSTEM:'/dev/null', GIT_TERMINAL_PROMPT:'0', GIT_ASKPASS:'/bin/false', GIT_LFS_SKIP_SMUDGE:'1' };
  // Optional CA is an operator-owned launcher setting, never request data.
  if(process.env.NODE_EXTRA_CA_CERTS){readProtected(process.env.NODE_EXTRA_CA_CERTS);env.GIT_SSL_CAINFO=process.env.NODE_EXTRA_CA_CERTS;}
  if(access?.token)Object.assign(env,{GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:`http.${access.binding.gitUrl}.extraheader`,
    GIT_CONFIG_VALUE_0:`Authorization: Basic ${Buffer.from(`x-access-token:${access.token}`).toString('base64')}`});
  try {
    return execFileSync('/usr/bin/git', ['-c','protocol.allow=never','-c','protocol.https.allow=always','-c','credential.helper=',
      '-c','http.followRedirects=false','-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false',...args],
      {cwd:directory,env,encoding:'utf8',timeout:30000,maxBuffer:65536,stdio:['ignore','pipe','pipe']}).trim();
  } catch { throw new TargetError('operation_failed'); }
}

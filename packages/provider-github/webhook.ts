import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { GitHubError } from '../core/github.ts';
import type { GitHubStore } from '../storage-sqlite/github.ts';

// Mount this handler only on an operator-configured HTTPS route. The raw bytes
// must survive transport unchanged. A delivery merely wakes reconciliation.
export function createGitHubWebhook(store: GitHubStore, options: {
  installationId: string; secret: () => Promise<string>; maxBytes?: number;
}) {
  const maxBytes=options.maxBytes??262144;
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>1048576)throw new GitHubError('invalid_configuration');
  return async (request:Request):Promise<Response>=>{
    if(request.method!=='POST')return new Response(null,{status:405});
    const length=request.headers.get('content-length');
    if(length&&(!/^\d+$/.test(length)||Number(length)>maxBytes))return new Response(null,{status:413});
    const reader=request.body?.getReader();if(!reader)return new Response(null,{status:400});
    const chunks:Uint8Array[]=[];let size=0;
    for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();return new Response(null,{status:413});}chunks.push(value);}
    const bytes=Buffer.concat(chunks),signature=request.headers.get('x-hub-signature-256')??'';
    if(!/^sha256=[a-f0-9]{64}$/.test(signature))return new Response(null,{status:401});
    const secret=await options.secret();if(!secret)throw new GitHubError('credential_unavailable');
    const expected=createHmac('sha256',secret).update(bytes).digest();
    if(!timingSafeEqual(expected,Buffer.from(signature.slice(7),'hex')))return new Response(null,{status:401});
    // Parse only after authentication; payload actor/approval/origin is inert.
    try{
      const data:unknown=JSON.parse(bytes.toString('utf8'));
      if(!data||typeof data!=='object'||Array.isArray(data))return new Response(null,{status:400});
      const delivery=request.headers.get('x-github-delivery')??'';
      const hash=createHash('sha256').update(request.headers.get('x-github-event')??'').update('\0').update(bytes).digest('hex');
      const receipt=store.receiveGitHubWebhook(options.installationId,delivery,hash);
      return Response.json(receipt,{status:202});
    }catch(error){
      if(error instanceof SyntaxError)return new Response(null,{status:400});
      if((error as {code?:string}).code==='identity_conflict')return new Response(null,{status:409});
      if((error as {code?:string}).code==='invalid_payload')return new Response(null,{status:400});
      throw error; // Storage failure cannot produce an accepted acknowledgement.
    }
  };
}

import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, realpathSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { assertPrivateDatabase, readProtected, TargetError } from './filesystem.ts';
import { WorkspaceRegistry } from './workspaces.ts';
import { digest } from '../storage-sqlite/execution.ts';
import { validated } from '../storage-sqlite/validation.ts';
import { runtimeCapabilities, runtimeNamespace, validateRuntimeRequest } from './runtime-contracts.ts';
import type { RuntimeInstallation, RuntimeRequest, RuntimeResponse, RuntimeReceipt, RuntimeInput, RuntimeRecipe } from './runtime-contracts.ts';
import type { RuntimeRecipeDriverReplyV1 } from '../../contracts/generated/runtime-driver-reply.ts';
import type { WorkspaceReceipt } from './workspace-contracts.ts';
export type RuntimeStage='intent'|'driver-returned'|'committed';
export interface RuntimeBinding {
  installationId:string;targetId:string;targetRevision:number;runId:string;workspaceId:string;operationId:string;
  requestDigest:string;workspaceOperationId:string;workspaceReceiptDigest:string;recipe:RuntimeInput['recipe'];namespace:string;
  resources:{name:string;type:string}[];
}
function driverBytes(recipe:RuntimeRecipe):void {
  const bytes=readProtected(recipe.driver.path,process.getuid!());
  if(createHash('sha256').update(bytes).digest('hex')!==recipe.driver.integrity)throw new TargetError('identity_mismatch');
}
async function invokeDriver(recipe:RuntimeRecipe,method:'create'|'inspect',binding:RuntimeBinding,workspace:WorkspaceReceipt,path:string):Promise<RuntimeRecipeDriverReplyV1> {
  driverBytes(recipe);
  // This executable and its configuration are operator-installed trusted code.
  // No checkout module, shell, inherited credentials or issue arguments run here.
  const payload=validated('runtime-driver-request',{schemaVersion:'1.0',method,binding,bindingDigest:digest(binding),workspace:{path,receipt:workspace},configuration:recipe.configuration});
  const bytes=Buffer.from(JSON.stringify(payload));if(bytes.length>262144)throw new TargetError('validation_failed');
  const raw=await new Promise<Buffer>((resolve,reject)=>{
    const child=spawn(realpathSync(process.execPath),[recipe.driver.path],{cwd:'/',env:{PATH:'/usr/bin:/bin',LANG:'C',NODE_NO_WARNINGS:'1'},stdio:['pipe','pipe','pipe']});
    let size=0,errors=0,exceeded=false;const chunks:Buffer[]=[];
    const timer=setTimeout(()=>{exceeded=true;child.kill('SIGKILL');},recipe.timeoutMs);
    child.stdout.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size<=65536)chunks.push(chunk);else{exceeded=true;child.kill('SIGKILL');}});
    // Never return driver diagnostics: these may contain credentials or source.
    child.stderr.on('data',(chunk:Buffer)=>{errors+=chunk.length;if(errors>16384){exceeded=true;child.kill('SIGKILL');}});
    child.stdin.on('error',()=>{});
    child.once('error',()=>{clearTimeout(timer);reject(new TargetError('outcome_unknown'));});
    child.once('close',code=>{clearTimeout(timer);if(code!==0||exceeded)reject(new TargetError('outcome_unknown'));else resolve(Buffer.concat(chunks));});
    child.stdin.end(bytes);
  });
  return validated('runtime-driver-reply',JSON.parse(raw.toString('utf8')) as RuntimeRecipeDriverReplyV1);
}
export class RuntimeRegistry {
  private db:DatabaseSync;
  private workspaces:WorkspaceRegistry;
  readonly installation:RuntimeInstallation;
  private barrier:(stage:RuntimeStage)=>void;
  constructor(input:RuntimeInstallation,barrier:(stage:RuntimeStage)=>void=()=>{}) {
    const p=this.installation=validated('ssh-runtime-installation',input),runtime=p.runtimePolicy,workspace=p.workspacePolicy;this.barrier=barrier;
    for(const key of ['installationId','targetId','targetRevision','helperUid'] as const)
      if(runtime[key]!==workspace[key])throw new TargetError('identity_mismatch');
    if(new Set(runtime.recipes.map(r=>`${r.id}@${r.version}`)).size!==runtime.recipes.length)throw new TargetError('configuration_invalid');
    const contains=(a:string,b:string)=>{const path=relative(a,b);return !path||(!path.startsWith('..')&&!isAbsolute(path));};
    for(const root of [...workspace.roots,{path:workspace.stateDir}])
      if(contains(root.path,runtime.stateDir)||contains(runtime.stateDir,root.path))throw new TargetError('configuration_invalid');
    for(const recipe of runtime.recipes) {
      if(new Set(recipe.resources.map(resource=>resource.key)).size!==recipe.resources.length)throw new TargetError('configuration_invalid');
      driverBytes(recipe);
    }
    assertPrivateDatabase(runtime.stateDir,'runtimes.sqlite');
    this.workspaces=new WorkspaceRegistry(workspace);
    this.db=new DatabaseSync(join(runtime.stateDir,'runtimes.sqlite'),{timeout:5000});
    try {
      const version=this.db.prepare('PRAGMA user_version').get()!.user_version;
      if(version!==0&&version!==1)throw new TargetError('configuration_invalid');
      if(version===0&&this.db.prepare("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").get())throw new TargetError('configuration_invalid');
      if(version===1&&this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
        .map(row=>row.name).join(',')!=='runtime_identity,runtimes')throw new TargetError('configuration_invalid');
      chmodSync(join(runtime.stateDir,'runtimes.sqlite'),0o600);
      this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; BEGIN IMMEDIATE;
        CREATE TABLE IF NOT EXISTS runtime_identity (id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS runtimes (operation_id TEXT PRIMARY KEY,namespace TEXT UNIQUE NOT NULL,request TEXT NOT NULL CHECK(json_valid(request)),
          recipe TEXT NOT NULL CHECK(json_valid(recipe)),binding TEXT NOT NULL CHECK(json_valid(binding)),receipt TEXT CHECK(receipt IS NULL OR json_valid(receipt)));
        CREATE TRIGGER IF NOT EXISTS runtime_identity_immutable BEFORE UPDATE OF operation_id,namespace,request,recipe,binding ON runtimes BEGIN SELECT RAISE(ABORT,'immutable'); END;
        CREATE TRIGGER IF NOT EXISTS runtime_retained BEFORE DELETE ON runtimes BEGIN SELECT RAISE(ABORT,'immutable'); END;
        PRAGMA user_version=1; COMMIT;`);
      const identity=JSON.stringify([runtime.installationId,runtime.targetId]);
      this.db.prepare('INSERT OR IGNORE INTO runtime_identity VALUES (1,?)').run(identity);
      if(this.db.prepare('SELECT payload FROM runtime_identity WHERE id=1').get()!.payload!==identity)throw new TargetError('identity_mismatch');
    }catch(error){this.db.close();this.workspaces.close();throw error;}
  }
  async handle(value:unknown):Promise<RuntimeResponse> {
    const request=validated('ssh-runtime-request',value as RuntimeRequest),{operation:_operation,...base}=request;
    const reply=(runtime:RuntimeReceipt|null,code:TargetError['code']|null=null):RuntimeResponse=>validated('ssh-runtime-response',{
      ...base,runtime,outcome:code===null?'ok':code==='outcome_unknown'?'outcome_unknown':'error',capabilities:code?[]:[...runtimeCapabilities],
      error:code?{code,message:code,evidenceId:null,retryClass:code==='outcome_unknown'?'reconcile':'none'}:null});
    let crossed=false;
    try {
      validateRuntimeRequest(this.installation,request);
      if(request.method==='probe')return reply(null);
      const op=request.operation!,input=op.inputs as unknown as RuntimeInput;
      const recipe=this.installation.runtimePolicy.recipes.find(r=>r.id===input.recipe.id&&r.version===input.recipe.version)!;
      const source=await this.workspaces.inspectOperation(input.workspaceOperationId);
      const workspace=source.workspace;
      if(source.outcome!=='ok'||!workspace)throw new TargetError('outcome_unknown');
      if(workspace.runId!==op.runId||workspace.workspaceId!==op.workspaceId||workspace.rootId!==input.rootId||digest(workspace.source)!==digest(op.source))throw new TargetError('identity_mismatch');
      this.workspaces.beginUse(op.operationId,op.workspaceId);
      const namespace=runtimeNamespace(request.installationId,request.targetId,op.workspaceId,input.recipe);
      const binding:RuntimeBinding={installationId:request.installationId,targetId:request.targetId,targetRevision:request.targetRevision,
        runId:op.runId,workspaceId:op.workspaceId,operationId:op.operationId,requestDigest:op.requestDigest,
        workspaceOperationId:workspace.operationId,workspaceReceiptDigest:digest(workspace),recipe:input.recipe,namespace,
        resources:recipe.resources.map(resource=>({name:`${namespace}-${resource.key}`,type:resource.type}))};
      this.db.exec('BEGIN IMMEDIATE');
      let saved;
      try {
        saved=this.db.prepare('SELECT * FROM runtimes WHERE operation_id=?').get(op.operationId);
        if(saved) {
          if(saved.request!==JSON.stringify(op)||saved.recipe!==JSON.stringify(recipe)||saved.binding!==JSON.stringify(binding))throw new TargetError('identity_mismatch');
        } else {
          if(request.method==='inspect')throw new TargetError('outcome_unknown');
          if(Date.parse(op.deadline)<=Date.now())throw new TargetError('forbidden');
          if(this.db.prepare('SELECT 1 FROM runtimes WHERE namespace=?').get(namespace))throw new TargetError('resource_busy');
          this.db.prepare('INSERT INTO runtimes VALUES (?,?,?,?,?,NULL)').run(op.operationId,namespace,JSON.stringify(op),JSON.stringify(recipe),JSON.stringify(binding));
        }
        // A failed commit may still have become durable. Never infer replay.
        crossed=true;this.db.exec('COMMIT');
      }catch(error){if(this.db.isTransaction)this.db.exec('ROLLBACK');throw error;}
      if(saved?.receipt) {
        const receipt=validated('runtime-receipt',JSON.parse(String(saved.receipt)) as RuntimeReceipt);
        const {resources:_resources,...expected}=binding;
        for(const key of Object.keys(expected) as (keyof typeof expected)[])
          if(digest(receipt[key])!==digest(expected[key]))throw new TargetError('identity_mismatch');
        if(receipt.handle!==op.operationId || receipt.bindingDigest!==digest(binding) || digest(receipt.cleanup)!==digest(recipe.cleanup) ||
          receipt.resources.length!==binding.resources.length || new Set(receipt.resources.map(r=>r.name)).size!==binding.resources.length ||
          binding.resources.some(e=>!receipt.resources.some(r=>r.name===e.name&&r.type===e.type)))throw new TargetError('identity_mismatch');
        this.workspaces.endUse(op.operationId);return reply(receipt);
      }
      if(!saved)this.barrier('intent');
      const root=this.installation.workspacePolicy.roots.find(root=>root.id===input.rootId)!;
      const observed=await invokeDriver(recipe,saved?'inspect':'create',binding,workspace,join(root.path,workspace.locator,'source'));
      this.barrier('driver-returned');
      if(observed.bindingDigest!==digest(binding))throw new TargetError('identity_mismatch');
      if(observed.status!=='ready')throw new TargetError('outcome_unknown');
      if(observed.resources.length!==binding.resources.length || new Set(observed.resources.map(r=>r.name)).size!==binding.resources.length ||
        binding.resources.some(expected=>!observed.resources.some(r=>r.name===expected.name&&r.type===expected.type)))throw new TargetError('identity_mismatch');
      // URLs are optional driver outputs. Reject credentials and active schemes.
      for(const resource of observed.resources) {
        try {
          const url=new URL(resource.locator);
          if(url.username||url.password||(resource.type==='url'&&!['http:','https:'].includes(url.protocol)))throw new TargetError('validation_failed');
        }catch(error){if(resource.type==='url'||error instanceof TargetError)throw new TargetError('validation_failed');}
      }
      const receipt=validated('runtime-receipt',{schemaVersion:'1.0',...binding,handle:op.operationId,bindingDigest:digest(binding),
        resources:observed.resources,cleanup:recipe.cleanup,evidenceRefs:observed.evidenceRefs} as unknown as RuntimeReceipt);
      // Receipt excludes the allocation-only resources array from binding.
      this.db.exec('BEGIN IMMEDIATE');
      try {
        const prior=this.db.prepare('SELECT receipt FROM runtimes WHERE operation_id=?').get(op.operationId)!;
        if(prior.receipt&&digest(JSON.parse(String(prior.receipt)))!==digest(receipt))throw new TargetError('identity_mismatch');
        this.db.prepare('UPDATE runtimes SET receipt=? WHERE operation_id=?').run(JSON.stringify(receipt),op.operationId);
        this.db.exec('COMMIT');
      }catch(error){if(this.db.isTransaction)this.db.exec('ROLLBACK');throw error;}
      this.barrier('committed');this.workspaces.endUse(op.operationId);return reply(receipt);
    }catch(error){return reply(null,crossed?'outcome_unknown':error instanceof TargetError?error.code:'validation_failed');}
  }
  close(){this.db.close();this.workspaces.close();}
}

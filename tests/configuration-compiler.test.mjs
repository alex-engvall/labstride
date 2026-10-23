import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { configurationFixture, observation } from './helpers/configuration-fixture.mjs';
import { evaluateRules } from '../packages/configuration/rules.ts';
import { compileConfiguration } from '../packages/configuration/compiler.ts';
import { digest } from '../packages/configuration/json.ts';
import { validated } from '../packages/storage-sqlite/validation.ts';

function fixture(t, variant) {
  const root = mkdtempSync(join(tmpdir(), 'labstride-config-compiler-'));
  t.after(() => rmSync(root, { recursive:true, force:true }));
  return configurationFixture(root, variant);
}
async function compiled(f) { const result = await f.compile(); assert.equal(result.ok, true, JSON.stringify(result.diagnostics)); return result.configuration; }
async function rejected(f, path) { const result = await f.compile(); assert.equal(result.ok, false); if(path) assert.ok(result.diagnostics.some(d=>d.path.startsWith(path)),JSON.stringify(result)); return result; }

test('two installations compile different logical names, field IDs and options without evaluating installed code', async t => {
  const first=fixture(t,'a'), second=fixture(t,'b');
  const a=await compiled(first),b=await compiled(second);
  for(const [f,c] of [[first,a],[second,b]]) {
    assert.equal(existsSync(f.markerPath),false);
    assert.equal(existsSync(f.databasePath),false);
    assert.equal(evaluateRules(c.snapshot,observation(f,c)).outcome,'matched');
    const steps=c.bindWorkflow('prepare',observation(f,c).current,{source:f.source});
    assert.equal(steps[0].inputs.target,`target-${f.config.installationId.slice(-1)}`);
    assert.equal(steps[0].inputs.note,'literal field text');
    assert.deepEqual(steps[0].inputs.source,f.source);
    assert.ok(Object.isFrozen(c.snapshot.configuration.fields));
  }
  assert.notEqual(a.snapshot.digest,b.snapshot.digest);
});
for(const [name,mutate,path] of [
  ['unknown core key',f=>f.config.eval='$(touch SHOULD_NOT_EXIST)','/'],
  ['unknown nested key',f=>f.config.github.shell='whoami','/github'],
  ['invalid target identity',f=>f.config.targets['../outside']=f.config.targets['target-a'],'/targets'],
  ['invalid workflow identity',f=>f.config.workflows['../outside']=f.config.workflows.prepare,'/workflows'],
  ['missing field',f=>f.config.rules[0].condition.field='absent','/rules'],
  ['deleted field',f=>delete f.descriptors['request-a'],'/fields'],
  ['changed provider type',f=>f.descriptors['request-a'].type='string','/fields'],
  ['wrong credential boundary',f=>f.descriptors['request-a'].credentialRef='secret:repository','/fields'],
  ['wrong container',f=>f.descriptors['request-a'].scopeId='other','/fields'],
  ['uninstalled provider',f=>f.descriptors['request-a'].providerId='unknown','/fields'],
  ['missing option',f=>f.config.fields.request.options.go='deleted','/fields'],
  ['duplicated option mapping',f=>f.config.fields.request.options.wait='go-a','/fields'],
  ['unsupported operator',f=>f.descriptors['request-a'].operators=['equals'],'/rules'],
  ['missing history',f=>f.descriptors['request-a'].history=false,'/rules'],
  ['missing actor attribution',f=>f.descriptors['request-a'].actorAttribution=false,'/rules'],
  ['missing read capability',f=>f.descriptors['request-a'].readable=false,'/fields'],
  ['missing projection write capability',f=>f.descriptors['status-a'].writable=false,'/projections'],
  ['unknown workflow',f=>f.config.rules[0].workflow='not-installed','/rules'],
  ['uninstalled action URL',f=>f.config.workflows.prepare[0].action='https://example.invalid/extension.mjs','/workflows'],
  ['unknown connector',f=>f.config.targets['target-a'].connector='not-installed','/targets'],
  ['invalid target configuration',f=>f.config.targets['target-a'].configuration.shell='command','/targets'],
  ['field selects target',f=>f.config.workflows.prepare[0].inputs.target={binding:'field',field:'note'},'/workflows'],
  ['unknown context token',f=>f.config.workflows.prepare[0].inputs.note='context.shell','/workflows'],
  ['incorrect typed input',f=>f.config.workflows.prepare[0].inputs.count={binding:'field',field:'note'},'/workflows'],
  ['missing required input',f=>delete f.config.workflows.prepare[0].inputs.source,'/workflows'],
  ['missing input field',f=>f.config.workflows.prepare[0].inputs.note={binding:'field',field:'absent'},'/workflows'],
  ['unknown binding variant',f=>f.config.workflows.prepare[0].inputs.note={binding:'eval',value:'code'},'/'],
  ['overlapping control values',f=>f.config.controls.keep.disabledValues=[true],'/controls'],
  ['unknown control field',f=>f.config.controls.keep.field='absent','/controls'],
  ['wrong rule literal type',f=>f.config.rules[0].condition.value=99,'/rules'],
  ['duplicate rule IDs',f=>f.config.rules.push({...f.config.rules[0],condition:{all:[f.config.rules[0].condition,{field:'note',op:'exists'}]}}),'/rules'],
  ['duplicate conditions',f=>f.config.rules.push({...f.config.rules[0],id:'another'}),'/rules'],
  ['constant start predicate',f=>f.config.rules[0].condition={field:'request',op:'equals',value:'go'},'/rules'],
  ['negated transition cannot authorize start',f=>f.config.rules[0].condition={not:f.config.rules[0].condition},'/rules'],
  ['managed alias of a human field',f=>{f.config.fields.status=structuredClone(f.config.fields.request);f.config.fields.status.options.busy='go-a';},'/projections'],
]) test(`preflight rejects ${name}`, async t=>{const f=fixture(t,'a');mutate(f);await rejected(f,path);assert.equal(existsSync(f.markerPath),false);});

test('unresolved secret references and inline credentials fail without echoing private values',async t=>{
  const f=fixture(t,'a');f.dependencies.secrets.exists=()=>false;
  const result=await rejected(f,'/secrets');assert.equal(JSON.stringify(result).includes('secret:repository'),false);
  f.dependencies.secrets.exists=()=>true;f.config.github.credentialRef='PRIVATE_PLAINTEXT';
  const inline=await rejected(f,'/secrets');assert.equal(JSON.stringify(inline).includes('PRIVATE_PLAINTEXT'),false);
});
test('exact installed artifact, permission and configuration pins are required before module evaluation',async t=>{
  const f=fixture(t,'a');await compiled(f);
  const pin=f.dependencies.lock.extensions.find(p=>p.kind==='action');
  writeFileSync(pin.artifactPath,readFileSync(pin.artifactPath,'utf8')+' ');
  await rejected(f,'/extensions');assert.equal(existsSync(f.markerPath),false);
  pin.integrity=createHash('sha256').update(readFileSync(pin.artifactPath)).digest('hex');f.config.extensions.find(p=>p.id===pin.id).integrity=pin.integrity;
  pin.permissions=[];await rejected(f,'/extensions');
  pin.permissions=['filesystem.workspace'];pin.configuration={};await rejected(f,'/extensions');
});
test('display-only provider renames preserve stable bindings and the digest; object-key ordering is canonical',async t=>{
  const f=fixture(t,'a'),a=await compiled(f);
  // Provider display metadata is read but excluded from the effective binding identity.
  f.descriptors['request-a'].displayName='Renamed request field';
  f.descriptors['request-a'].optionNames={'go-a':'A renamed start option','wait-a':'A renamed idle option'};
  f.config.fields=Object.fromEntries(Object.entries(f.config.fields).reverse());
  const b=await compiled(f);assert.equal(a.snapshot.digest,b.snapshot.digest);
  assert.equal(evaluateRules(b.snapshot,observation(f,b)).outcome,'matched');
  const {digest:expected,...contents}=b.snapshot;assert.equal(digest(contents),expected);
});
test('reserved tokens have an explicit literal escape; field text is not evaluated a second time',async t=>{
  const f=fixture(t,'a');f.config.workflows.prepare[0].inputs.literal={binding:'literal',value:{binding:'context',context:'source',text:'context.unknown'}};
  const c=await compiled(f),o=observation(f,c,{note:{present:true,value:'context.source'}});
  const steps=c.bindWorkflow('prepare',o.current,{source:f.source});
  assert.equal(steps[0].inputs.note,'context.source');
  assert.deepEqual(steps[0].inputs.literal,{binding:'context',context:'source',text:'context.unknown'});
});
test('complete runtime inputs use the pinned action schema, including deferred constraints',async t=>{
  const f=fixture(t,'a');await compiled(f);
  const pin=f.dependencies.lock.extensions.find(p=>p.kind==='action'),artifact=JSON.parse(readFileSync(pin.artifactPath));
  artifact.schemas.input.properties.note.enum=['approved'];writeFileSync(pin.artifactPath,JSON.stringify(artifact));
  pin.integrity=createHash('sha256').update(readFileSync(pin.artifactPath)).digest('hex');f.config.extensions.find(p=>p.id===pin.id).integrity=pin.integrity;
  const c=await compiled(f);assert.throws(()=>c.bindWorkflow('prepare',observation(f,c).current,{source:f.source}),e=>e.code==='validation_failed');
  assert.equal(c.bindWorkflow('prepare',observation(f,c,{note:{present:true,value:'approved'}}).current,{source:f.source})[0].inputs.note,'approved');
  assert.throws(()=>c.bindWorkflow('prepare',observation(f,c).current,{}),e=>e.code==='binding_invalid');
});
test('non-JSON values, unsupported schema versions and oversized configurations fail preflight',async t=>{
  const f=fixture(t,'a');await compiled(f);
  for(const input of [{...f.config,schemaVersion:'99'}, {...f.config,rules:undefined}, {...f.config,enabled:NaN}, {...f.config,broker:{url:'not-a-uri',oidcAudience:'x'}}, {...f.config,installationId:'x'.repeat(300000)}]) {
    const result=await compileConfiguration(input,f.dependencies);assert.equal(result.ok,false);
  }
});
test('aggregate snapshot size and malformed injected host data return diagnostics without activation',async t=>{
 const f=fixture(t,'a');await compiled(f);f.config.workflows.prepare[0].inputs.literal={binding:'literal',value:''};
 f.config.workflows.prepare[0].inputs.literal.value='x'.repeat(261000-Buffer.byteLength(JSON.stringify(f.config)));
 validated('config',f.config); // The combined snapshot, not the initial config body, exceeds the limit.
 const tooLarge=await f.compile();assert.equal(tooLarge.ok,false);assert.equal(existsSync(f.markerPath),false);
 f.config.workflows.prepare[0].inputs.literal='literal';f.dependencies.host.callback=()=>{};
 const host=await f.compile();assert.equal(host.ok,false);assert.ok(host.diagnostics.some(d=>d.path==='/extensions'));
});

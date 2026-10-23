import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { configurationFixture, observation } from './helpers/configuration-fixture.mjs';
import { evaluateRules } from '../packages/configuration/rules.ts';
import { validated } from '../packages/storage-sqlite/validation.ts';

function fixture(t){const root=mkdtempSync(join(tmpdir(),'labstride-config-rules-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return configurationFixture(root,'a');}
async function compile(f){const r=await f.compile();assert.equal(r.ok,true,JSON.stringify(r.diagnostics));return r.configuration;}
for(const [name,change,expected] of [
 ['initial historical match',o=>o.initialSync=true,'initial_sync'],
 ['coordinator projection',o=>o.event.origin='coordinator','non_human_origin'],
 ['extension observation',o=>o.event.origin='extension','non_human_origin'],
 ['provider observation',o=>o.event.origin='provider','non_human_origin'],
 ['unchanged start value',o=>o.previous.request=structuredClone(o.current.request),'unchanged'],
 ['unknown option',o=>o.current.request.value='new-unmapped-model','invalid_value'],
 ['unknown previous option',o=>o.previous.request.value='deleted-option','invalid_value'],
 ['missing previous observation',o=>delete o.previous.request,'invalid_value'],
 ['missing current observation',o=>delete o.current.request,'invalid_value'],
 ['stale binding digest',o=>o.configDigest='0'.repeat(64),'invalid_observation'],
 ['wrong installation',o=>o.event.installationId='other','invalid_observation'],
 ['wrong provider',o=>o.event.provider='other','invalid_value'],
])test(`start gate blocks ${name}`,async t=>{const f=fixture(t),c=await compile(f),o=observation(f,c);change(o);const r=evaluateRules(c.snapshot,o);assert.equal(r.code,expected);assert.notEqual(r.outcome,'matched');});
test('overlapping rules yield all rule IDs and no selected workflow',async t=>{
 const f=fixture(t);f.config.rules.push({id:'overlap',event:'field.changed',condition:{all:[structuredClone(f.config.rules[0].condition),{field:'note',op:'exists'}]},workflow:'prepare'});
 const c=await compile(f),r=evaluateRules(c.snapshot,observation(f,c));assert.equal(r.outcome,'rule_conflict');assert.deepEqual(r.ruleIds,['start','overlap']);assert.equal(r.workflow,null);
});
for(const [type,value,op,literal,expected] of [
 ['string','$(touch literal)','equals','$(touch literal)',true],
 ['string','some text','contains','text',true],
 ['boolean',true,'equals',true,true],
 ['boolean',true,'notEquals',false,true],
 ['number',42,'equals',42,true],
 ['number',42,'notEquals',42,false],
 ['date','2026-10-23','equals','2026-10-23',true],
 ['single-select','external-one','equals','one',true],
 ['multi-select',['external-two','external-one'],'equals',['one','two'],true],
 ['multi-select',['external-one'],'contains','one',true],
 ['string',null,'equals',null,true],
 ['boolean','true','equals',true,'blocked'],
 ['number','42','equals',42,'blocked'],
 ['date','2026-02-30','equals','2026-10-23','blocked'],
 ['multi-select',['external-one','unknown'],'contains','one','blocked'],
])test(`typed ${type} ${op} ${JSON.stringify(value)}`,async t=>{
 const f=fixture(t),field={source:'native_issue',scopeId:'repo-a',fieldId:'typed-field',type};if(type.endsWith('select'))field.options={one:'external-one',two:'external-two'};
 f.config.fields.typed=field;f.descriptors[field.fieldId]={...f.descriptors['note-a'],fieldId:field.fieldId,type,optionIds:Object.values(field.options??{})};
 f.config.rules[0].condition={all:[f.config.rules[0].condition,{field:'typed',op,value:literal}]};
 const c=await compile(f),o=observation(f,c,{typed:{present:true,value}}),r=evaluateRules(c.snapshot,o);
 assert.equal(r.outcome,expected==='blocked'?'blocked':expected?'matched':'no_match');
});
test('confirmed absence, explicit null and unavailable observations stay distinct under all/any/not/exists',async t=>{
 const f=fixture(t);f.config.rules[0].condition={all:[f.config.rules[0].condition,{not:{field:'note',op:'exists'}},{any:[{field:'keep',op:'equals',value:false},{field:'keep',op:'equals',value:true}]}]};
 const c=await compile(f),o=observation(f,c,{note:{present:false}});assert.equal(evaluateRules(c.snapshot,o).outcome,'matched');
 o.current.note={present:true,value:null};assert.equal(evaluateRules(c.snapshot,o).outcome,'no_match');
 delete o.current.note;assert.equal(evaluateRules(c.snapshot,o).outcome,'blocked');
 o.current.note={present:false};o.current.keep={present:true,value:'false'};assert.equal(evaluateRules(c.snapshot,o).outcome,'blocked');
});
test('transition from confirmed absence or null differs from an unchanged explicit null',async t=>{
 const f=fixture(t);f.config.rules[0].condition={field:'note',op:'changedTo',value:null};const c=await compile(f),o=observation(f,c,{note:{present:true,value:null}});
 o.previous.note={present:false};assert.equal(evaluateRules(c.snapshot,o).outcome,'matched');
 o.previous.note={present:true,value:null};assert.equal(evaluateRules(c.snapshot,o).outcome,'no_match');
});
test('versioned rule payloads reject contradictory outcomes and ambiguous absence before use',async t=>{
 for(const payload of [
  {schemaVersion:'1.0',outcome:'matched',code:'matched',ruleIds:['start'],workflow:null},
  {schemaVersion:'1.0',outcome:'no_match',code:'matched',ruleIds:[],workflow:null},
  {schemaVersion:'1.0',outcome:'rule_conflict',code:'rule_conflict',ruleIds:['only-one'],workflow:null},
 ])assert.throws(()=>validated('rule-evaluation',payload),e=>e.code==='invalid_payload');
 const f=fixture(t),c=await compile(f),o=observation(f,c);o.current.note={present:false,value:null};
 assert.equal(evaluateRules(c.snapshot,o).code,'invalid_observation');
});

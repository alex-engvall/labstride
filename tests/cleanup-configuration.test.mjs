import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configurationFixture } from './helpers/configuration-fixture.mjs';
import { validated } from '../packages/storage-sqlite/validation.ts';
const policy={schemaVersion:'1.0',trigger:'operator_request',actionId:'test.action',actionVersion:'1.0.0',completion:'merge_only',regenerableIgnoredPaths:[]};
function fixture(t){const root=mkdtempSync(join(tmpdir(),'labstride-cleanup-config-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return configurationFixture(root);}
test('omitting cleanup preserves existing configuration and introduces no retention timer',async t=>{const f=fixture(t),c=await f.compile();assert.equal(c.ok,true);assert.equal(c.configuration.snapshot.configuration.cleanup,undefined);});
for(const [name,change] of [['missing capability',()=>{}],['uninstalled action',p=>p.actionId='https://untrusted.invalid/code'],['wrong version',p=>p.actionVersion='99.0.0'],['Git metadata',p=>p.regenerableIgnoredPaths=['.git']],['parent traversal',p=>p.regenerableIgnoredPaths=['cache/../work']],['timer',p=>p.retentionDays=7]])test(`cleanup configuration refuses ${name}`,async t=>{const f=fixture(t);f.config.cleanup=structuredClone(policy);change(f.config.cleanup);const c=await f.compile();assert.equal(c.ok,false);});
test('versioned cleanup payloads reject unknown methods and completion bypasses',()=>{assert.throws(()=>validated('cleanup-policy',{...policy,completion:'agent_turn_stopped'}));assert.throws(()=>validated('cleanup-policy',{...policy,schemaVersion:'2.0'}));assert.throws(()=>validated('ssh-cleanup-request',{schemaVersion:'4.0',method:'delete',path:'/'}));});

test('deletion contracts reject missing commit authorization and success without a tombstone',()=>{
 const request=JSON.parse(readFileSync(new URL('../examples/ssh-cleanup-delete-request.json',import.meta.url)));
 assert.throws(()=>validated('ssh-cleanup-delete-request',{...request,method:'commit'}));
 assert.throws(()=>validated('ssh-cleanup-delete-request',{...request,path:'/'}));
 const reply=JSON.parse(readFileSync(new URL('../examples/ssh-cleanup-delete-response.json',import.meta.url)));
 assert.throws(()=>validated('ssh-cleanup-delete-response',{...reply,state:'deleted'}));
 assert.throws(()=>validated('cleanup-preparation',{...reply.preparation,preparedAt:'not-a-date'}));
});

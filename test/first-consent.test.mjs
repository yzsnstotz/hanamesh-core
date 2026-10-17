import test from 'node:test';
import assert from 'node:assert/strict';
import {SessionController} from '../lib/controller.js';
import {createRouteHandler} from '../lib/routes.js';
import {INITIAL_CORE_SNAPSHOT} from '../lib/contracts.js';
import {memoryStore} from './fixtures/core-store.mjs';
const origin='http://127.0.0.1:41001';
const path='/api/hanamesh/core/consent/prompt-shown';
async function fixture(t,snapshot=INITIAL_CORE_SNAPSHOT){const memory=memoryStore(snapshot);let sends=0;const controller=await SessionController.create({serverOrigin:null,websiteOrigin:null},memory.store,{fetcher:async()=>{sends++;throw Error('unexpected network')}});t.after(()=>controller.dispose());return {memory,controller,handle:createRouteHandler(controller),sends:()=>sends};}
const prompt=c=>c.state().consentPrompt;
const post=(handle,headers={origin})=>handle(new Request(origin+path,{method:'POST',headers}));
test('first consent is eligible without granting or sending, and old snapshots without marker remain loadable',async t=>{const f=await fixture(t);assert.deepEqual(prompt(f.controller),{show:true,shownAt:null});assert.equal(f.controller.service.getConsent(),'withheld');assert.equal(f.sends(),0);});
for(const state of ['granted','withheld'])test(`existing explicit ${state} is never prompted`,async t=>{const f=await fixture(t,{...INITIAL_CORE_SNAPSHOT,consent:{state,changedAt:'2026-10-15T00:00:00.000Z'}});assert.deepEqual(prompt(f.controller),{show:false,shownAt:null});});
test('actual-display marker persists across restart and concurrent acknowledgments stamp once without granting',async t=>{const f=await fixture(t);const before=f.memory.publications.length;const responses=await Promise.all([post(f.handle),post(f.handle)]);assert.deepEqual(responses.map(x=>x.status),[200,200]);const a=await responses[0].json(),b=await responses[1].json();assert.deepEqual(a,b);assert.match(a.shownAt,/^\d{4}-/);assert.equal(f.memory.publications.length,before+1);assert.equal(f.controller.service.getConsent(),'withheld');assert.equal(f.sends(),0);await f.controller.dispose();const restarted=await fixture(t,f.memory.read());assert.deepEqual(prompt(restarted.controller),{show:false,shownAt:a.shownAt});});
test('failed marker storage cannot acknowledge display or change consent',async t=>{const f=await fixture(t);f.memory.store.publish=async()=>{throw Error('disk unavailable')};const response=await post(f.handle);assert.equal(response.status,503);assert.equal((await response.json()).error.code,'CORE_STORAGE_UNAVAILABLE');assert.deepEqual(prompt(f.controller),{show:true,shownAt:null});assert.equal(f.controller.service.getConsent(),'withheld');});
test('prompt acknowledgment preserves native method/origin fences',async t=>{const f=await fixture(t);assert.equal((await f.handle(new Request(origin+path))).status,405);assert.equal((await post(f.handle,{origin:'https://evil.example'})).status,403);assert.deepEqual(prompt(f.controller),{show:true,shownAt:null});});

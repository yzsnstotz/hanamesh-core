import test from 'node:test';
import assert from 'node:assert/strict';
import {SessionController} from '../lib/controller.js';
import {INITIAL_CORE_SNAPSHOT} from '../lib/contracts.js';
import {grantedSnapshot, memoryStore} from './fixtures/core-store.mjs';
import {configOf} from '../lib/validation.js';

async function fixture(catalog, config = {}, rows = [{hanaId:'hana-one',points:1,pending:0}]) {
  const memory = memoryStore(grantedSnapshot(INITIAL_CORE_SNAPSHOT));
  const controller = await SessionController.create({serverOrigin:'https://server.example',websiteOrigin:null},memory.store,{fetcher:async url => {
    if (new URL(url).pathname.includes('/registry/')) return catalog();
    return Response.json({bindingStatus:'UNBOUND',totalPoints:1,hanas:[{hanaId:'hana-one',points:1,pending:0}]});
  }});
  await controller.setConsent('granted');
  const initial=memory.read(); initial.registration={status:'registered',principalId:'p',registeredAt:new Date().toISOString(),lastError:null,attempts:1};
  await controller.dispose();
  const next = await SessionController.create({serverOrigin:'https://server.example',websiteOrigin:null,...config},memoryStore(initial).store,{fetcher:async url => new URL(url).pathname.includes('/registry/') ? catalog() : Response.json({bindingStatus:'UNBOUND',totalPoints:1,hanas:rows})});
  return next;
}
test('catalog failures remain visible beside points and recover on explicit refresh',async()=>{
 let healthy=false;
 const c=await fixture(()=>healthy ? Response.json({hanaId:'hana-one',displayName:'Recovered'}) : new Response('',{status:503}));
 try {
  const p=await c.refreshPoints(); assert.equal(p.status,'ready');assert.equal(p.hanas[0].displayNameStatus,'failed');assert.equal(p.hanas[0].displayNameReason,'CORE_UPSTREAM_HTTP_ERROR');
  healthy=true; await c.refresh(); const recovered=await c.refreshPoints();assert.equal(recovered.hanas[0].displayName,'Recovered');assert.equal(recovered.hanas[0].displayNameStatus,'ready');
 } finally {await c.dispose();}
});
test('catalog missing is distinct from malformed success and network failure',async()=>{
 for(const [status,expected] of [[404,'not-found'],[200,'failed'],[503,'failed']]) {
  const c=await fixture(()=>status===200 ? Response.json({hanaId:'wrong',displayName:'Bad'}) : status===404 ? Response.json({error:{code:'REGISTRY_NOT_FOUND'}},{status}) : new Response('',{status}));
  try {assert.equal((await c.refreshPoints()).hanas[0].displayNameStatus,expected);}finally{await c.dispose();}
 }
});
test('registration failure stays visible and schedules no hidden retry',async t=>{
 const c=await SessionController.create({serverOrigin:'https://server.example',websiteOrigin:null},memoryStore(grantedSnapshot(INITIAL_CORE_SNAPSHOT)).store,{fetcher:async()=>{throw new Error('offline');}});
 t.mock.timers.enable({apis:['setTimeout']});
 let calls=0;
 const register=c.register.bind(c);c.register=async()=>{calls++;return register();};
 try{await assert.rejects(c.register());assert.equal(c.state().registration.lastError,'CORE_UPSTREAM_UNAVAILABLE');t.mock.timers.tick(60_000);await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);}finally{await c.dispose();}
});
test('Q61 named limits preserve legal defaults, expose values and reject invalid configuration',()=>{
 const defaults=configOf({serverOrigin:null,websiteOrigin:null});assert.equal(defaults.maxHanaRows,200);assert.equal(defaults.profileTimeoutMs,1500);assert.equal(defaults.maxResponseBytes,1048576);
 const custom=configOf({serverOrigin:null,websiteOrigin:null,maxHanaRows:400,profileTimeoutMs:2000,maxResponseBytes:2097152});assert.equal(custom.maxHanaRows,400);
 for(const [key,value] of [['maxHanaRows',0],['profileTimeoutMs',-1],['maxResponseBytes',NaN]])assert.throws(()=>configOf({serverOrigin:null,websiteOrigin:null,[key]:value}));
});
test('registration storage failure is visible even when failed state cannot be published',async()=>{
 let fail=false;
 const memory=memoryStore(grantedSnapshot(INITIAL_CORE_SNAPSHOT));
 const c=await SessionController.create({serverOrigin:'https://server.example',websiteOrigin:null},{...memory.store,publish:async value=>{if(fail)throw new Error('disk full');await memory.store.publish(value);}},{fetcher:async()=>{throw new Error('offline');}});
 fail=true;
 try {await assert.rejects(c.startRegistration());assert.equal(c.state().registrationFailure.code,'CORE_UPSTREAM_UNAVAILABLE');assert.equal(c.state().registrationFailure.persistence,'CORE_STORAGE_UNAVAILABLE');}finally{await c.dispose();}
});

test('an endpoint 404 without REGISTRY_NOT_FOUND is a visible failure, not a missing Hana',async()=>{
 const c=await fixture(()=>new Response('route missing',{status:404}));
 try {assert.equal((await c.refreshPoints()).hanas[0].displayNameStatus,'failed');}finally{await c.dispose();}
});

test('Hana row budget is configurable and overflow reports its cause without truncating totals',async()=>{
 const rows=Array.from({length:201},(_,i)=>({hanaId:`hana-${i}`,points:1,pending:0}));
 const absent=()=>Response.json({error:{code:'REGISTRY_NOT_FOUND'}},{status:404});
 const c=await fixture(absent,{},rows);const expanded=await fixture(absent,{maxHanaRows:400},rows);
 try{const overflow=await c.refreshPoints();assert.equal(overflow.reason,'CORE_POINTS_LIMIT_EXCEEDED');const p=await expanded.refreshPoints();assert.equal(p.status,'ready');assert.equal(p.hanas.length,201);assert.equal(expanded.state().configuration.maxHanaRows,400);}finally{await c.dispose();await expanded.dispose();}
});

test('client, cache and catalog scheduling values are named and preserve defaults',()=>{
 const c=configOf({serverOrigin:null,websiteOrigin:null});
 for(const [name,value] of Object.entries({clientPollIntervalMs:10000,pointsRefreshMs:60000,contributionIntervalMs:60000,activityPageBudget:5,activityDisplayRows:25,catalogConcurrency:4}))assert.equal(c[name],value);
 assert.throws(()=>configOf({serverOrigin:null,websiteOrigin:null,clientPollIntervalMs:2147483648}));
});

test('failed names recover after the configured points cache expires without clearing the name cache',async t=>{
 let healthy=false;let calls=0;
 const c=await fixture(()=>{calls++;return healthy ? Response.json({hanaId:'hana-one',displayName:'Recovered'}) : new Response('',{status:503});},{pointsRefreshMs:1});
 let now=Date.now();t.mock.method(Date,'now',()=>now);
 try{assert.equal((await c.refreshPoints()).hanas[0].displayNameStatus,'failed');healthy=true;assert.equal((await c.refreshPoints()).hanas[0].displayNameStatus,'failed');assert.equal(calls,1);now+=2;assert.equal((await c.refreshPoints()).hanas[0].displayName,'Recovered');assert.equal(calls,2);assert.equal((await c.points()).configuration.pointsRefreshMs,1);}finally{await c.dispose();}
});

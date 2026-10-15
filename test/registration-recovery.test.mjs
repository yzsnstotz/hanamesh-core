import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {SessionController} from '../lib/controller.js';
import {INITIAL_CORE_SNAPSHOT} from '../lib/contracts.js';
import {grantedSnapshot,memoryStore} from './fixtures/core-store.mjs';

async function enteredWithin(promise){let timer;try{await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new assert.AssertionError({message:'expected async boundary was not reached'})),1000);})]);}finally{clearTimeout(timer);}}

async function fixture(interval=60000){
 let known=true,principal='before-restore',identityError='IDENTITY_DEVICE_SIGNATURE_INVALID',registrations=0,release,entered,rejectAfterRegister=false;
 const started=new Promise(r=>entered=r),barrier=new Promise(r=>release=r);let delayRegistration=false;const keys=[],calls=[];
 const memory=memoryStore(grantedSnapshot(INITIAL_CORE_SNAPSHOT));
 const controller=await SessionController.create({serverOrigin:'http://127.0.0.1:34543',websiteOrigin:null,contributionIntervalMs:interval},memory.store,{fetcher:async(url,init)=>{
  const path=new URL(url).pathname;calls.push(path);
  if(path==='/v1/identity/devices/challenge'){if(delayRegistration){entered();await barrier;}return Response.json({nonce:'fixture-nonce'});}
  if(path==='/v1/identity/devices'){registrations++;const p=JSON.parse(init.body);keys.push(p.publicKey);known=!rejectAfterRegister;return Response.json({deviceId:createHash('sha256').update(Buffer.from(p.publicKey,'base64url')).digest('base64url'),principalId:principal},{status:201});}
  if(path==='/v1/identity/me')return known?Response.json({principal:{principalId:principal}}):Response.json({error:{code:identityError}},{status:401});
  if(path==='/v1/usage/me/contributions')return known?Response.json({byHana:[],bound:principal==='before-restore'}):Response.json({error:{code:'USAGE_AUTH_REQUIRED'}},{status:401});
  return Response.json({error:{code:'FIXTURE_UNUSED'}},{status:404});
 }});await controller.register();
 return{controller,memory,keys,calls,get registrations(){return registrations;},forget(code='IDENTITY_DEVICE_SIGNATURE_INVALID'){known=false;principal='after-restore';identityError=code;},rejectVerification(){rejectAfterRegister=true;},block(){delayRegistration=true;},started,release};
}
test('live server forgetting a registered device recovers same key and exposes rebind notice',async()=>{
 const f=await fixture();try{await f.controller.refreshContributions();f.forget();await f.controller.refresh();const state=f.controller.state();assert.equal(f.registrations,2);assert.equal(f.keys[0],f.keys[1]);assert.equal(state.registration.status,'registered');assert.equal(state.registration.principalId,'after-restore');assert.equal(state.registrationRecovery.state,'recovered');assert.match(state.registrationRecovery.message,/重新注册/);assert.equal(state.registrationRecovery.principalChanged,true);assert.equal(state.session.bound,false);}finally{await f.controller.dispose();}
});
test('the existing contribution timer detects server loss without address edits or a manual refresh',async()=>{
 const f=await fixture(20);try{f.controller.startContributions();await new Promise(r=>setImmediate(r));f.forget();const deadline=Date.now()+1500;while(f.controller.state().registrationRecovery?.state!=='recovered'){assert.ok(Date.now()<deadline,'automatic recovery did not run');await new Promise(r=>setTimeout(r,5));}assert.equal(f.registrations,2);assert.equal(f.keys[0],f.keys[1]);}finally{await f.controller.dispose();}
});
test('revoked and replay errors never trigger automatic re-registration',async()=>{
 for(const code of['IDENTITY_DEVICE_REVOKED','IDENTITY_DEVICE_REPLAY']){const f=await fixture();try{f.forget(code);await f.controller.refresh();assert.equal(f.registrations,1);assert.equal(f.controller.state().registrationRecovery.state,'blocked');assert.match(f.controller.state().registrationRecovery.message,/撤销|重放/);}finally{await f.controller.dispose();}}
});
test('concurrent unauthorized reads share one recovery and consent withdrawal stops the second registration POST',async()=>{
 const f=await fixture();try{f.forget();f.block();const pending=[f.controller.refreshContributions(),f.controller.refreshContributions()];await enteredWithin(f.started);assert.equal(f.controller.state().registrationRecovery.state,'checking');await f.controller.setConsent('withheld');f.release();await Promise.all(pending);assert.equal(f.registrations,1);assert.equal(f.controller.state().consent.state,'withheld');assert.notEqual(f.controller.state().registration.status,'registered');}finally{f.release();await f.controller.dispose();}
});
test('concurrent denied reads re-register once and unresolved authentication has a visible bounded retry',async()=>{
 const f=await fixture();try{f.forget();f.block();const pending=[f.controller.refreshContributions(),f.controller.refreshContributions()];await enteredWithin(f.started);f.release();await Promise.all(pending);assert.equal(f.registrations,2);assert.equal(f.controller.state().registrationRecovery.state,'recovered');}finally{await f.controller.dispose();}
 const failed=await fixture();try{failed.forget();failed.rejectVerification();await failed.controller.refresh();const notice=failed.controller.state().registrationRecovery;assert.equal(notice.state,'failed');assert.ok(Date.parse(notice.nextAttemptAt)>Date.now());assert.equal(failed.controller.state().registration.status,'failed');await failed.controller.refresh();assert.equal(failed.registrations,2,'no registration loop within contributionIntervalMs');}finally{await failed.controller.dispose();}
});
test('withdrawal while the recovery verification body is pending cannot publish recovery or retry contributions',async(t)=>{
 let known=false,identities=0,contributions=0,entered,release;
 const waiting=new Promise(r=>entered=r),barrier=new Promise(r=>release=r);
 const originalJson=Response.prototype.json;t.mock.method(Response.prototype,'json',async function(){if(this.headers.get('x-fixture-delay')==='yes'){entered();await barrier;}return originalJson.call(this);});
 const memory=memoryStore(grantedSnapshot(INITIAL_CORE_SNAPSHOT));
 const controller=await SessionController.create({serverOrigin:'http://127.0.0.1:34543',websiteOrigin:null},memory.store,{fetcher:async(url,init)=>{
  const path=new URL(url).pathname;
  if(path==='/v1/identity/devices/challenge')return Response.json({nonce:'fixture-nonce'});
  if(path==='/v1/identity/devices'){known=true;const body=JSON.parse(init.body);return Response.json({deviceId:createHash('sha256').update(Buffer.from(body.publicKey,'base64url')).digest('base64url'),principalId:'after-restore'});}
  if(path==='/v1/usage/me/contributions'){contributions++;return known?Response.json({byHana:[],bound:false}):Response.json({error:{code:'USAGE_AUTH_REQUIRED'}},{status:401});}
  if(path==='/v1/identity/me'){identities++;if(identities===1)return Response.json({error:{code:'IDENTITY_DEVICE_SIGNATURE_INVALID'}},{status:401});return Response.json({principal:{principalId:'after-restore'}},{headers:{'x-fixture-delay':'yes'}});}
  return Response.json({},{status:404});
 }});
 try{const refresh=controller.refreshContributions();await enteredWithin(waiting);await controller.setConsent('withheld');release();await refresh;assert.equal(controller.state().registrationRecovery,null);assert.equal(contributions,1,'withdrawal must stop recovery retry');assert.notEqual(controller.state().contributions.status,'ready');}finally{release();await controller.dispose();}
});

test('temporary Identity failure after registration is retried even when contributions already succeeds',async()=>{
 let known=false,registrations=0,identityReads=0;const memory=memoryStore(grantedSnapshot(INITIAL_CORE_SNAPSHOT));
 const controller=await SessionController.create({serverOrigin:'http://127.0.0.1:34543',websiteOrigin:null,contributionIntervalMs:20},memory.store,{fetcher:async(url,init)=>{
  const path=new URL(url).pathname;
  if(path==='/v1/identity/devices/challenge')return Response.json({nonce:'fixture'});
  if(path==='/v1/identity/devices'){registrations++;known=true;const x=JSON.parse(init.body);return Response.json({deviceId:createHash('sha256').update(Buffer.from(x.publicKey,'base64url')).digest('base64url'),principalId:'restored'});}
  if(path==='/v1/identity/me'){identityReads++;if(identityReads===2)return Response.json({error:{code:'TEMPORARY'}},{status:503});return known?Response.json({principal:{principalId:'restored'}}):Response.json({error:{code:'IDENTITY_DEVICE_SIGNATURE_INVALID'}},{status:401});}
  if(path==='/v1/usage/me/contributions')return known?Response.json({byHana:[],bound:false}):Response.json({error:{code:'USAGE_AUTH_REQUIRED'}},{status:401});
  return Response.json({},{status:404});
 }});try{await controller.refreshContributions();assert.equal(controller.state().registrationRecovery.state,'failed');await new Promise(r=>setTimeout(r,25));await controller.refreshContributions();assert.equal(controller.state().registrationRecovery.state,'recovered');assert.equal(controller.state().registration.status,'registered');}finally{await controller.dispose();}
});
test('withdrawal while signing an Identity recovery read stops that read',async()=>{
 let authChallenges=0,identityReads=0,entered,release;const waiting=new Promise(r=>entered=r),barrier=new Promise(r=>release=r);
 const memory=memoryStore(grantedSnapshot(INITIAL_CORE_SNAPSHOT));
 const controller=await SessionController.create({serverOrigin:'http://127.0.0.1:34543',websiteOrigin:null,authNonceSource:'server'},memory.store,{fetcher:async(url,init)=>{
  const path=new URL(url).pathname;
  if(path==='/v1/identity/devices/challenge'){authChallenges++;if(authChallenges===2){entered();await barrier;}return Response.json({nonce:'fixture'});}
  if(path==='/v1/identity/me'){identityReads++;return Response.json({error:{code:'IDENTITY_DEVICE_SIGNATURE_INVALID'}},{status:401});}
  return Response.json({error:{code:'USAGE_AUTH_REQUIRED'}},{status:401});
 }});try{const work=controller.refreshContributions();await enteredWithin(waiting);await controller.setConsent('withheld');release();await work;assert.equal(identityReads,0,'no Identity read after withdrawal during its signature challenge');}finally{release();await controller.dispose();}
});

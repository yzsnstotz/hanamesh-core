import test from 'node:test';import assert from 'node:assert/strict';import{SessionController}from'../lib/controller.js';import{createRouteHandler,ROUTES}from'../lib/routes.js';import{INITIAL_CORE_SNAPSHOT}from'../lib/contracts.js';import{memoryStore,grantedSnapshot}from'./fixtures/core-store.mjs';
const config={serverOrigin:'https://api.example.com',websiteOrigin:'https://market.example.com',allowSystemBrowser:false};
async function fixture(t,snapshot=grantedSnapshot(INITIAL_CORE_SNAPSHOT)){const memory=memoryStore(snapshot),calls=[];const c=await SessionController.create(config,memory.store,{fetcher:async(url,init)=>{calls.push({url:String(url),purpose:JSON.parse(init.body??'{}').purpose});return Response.json({error:{code:'IDENTITY_ORIGIN_REJECTED'}},{status:403});}});t.after(()=>c.dispose());return{c,memory,calls};}
test('legacy profile changing only server to loopback cannot mint or open the inherited public website',async t=>{
 const{c,calls}=await fixture(t);await c.setServerOrigin('http://127.0.0.1:34543');assert.equal(c.state().websiteBinding.ready,false);assert.equal(c.state().websiteBinding.reason,'CORE_WEBSITE_CONFIGURATION_REQUIRED');
 await assert.rejects(c.bindLink(),e=>e.code==='CORE_WEBSITE_CONFIGURATION_REQUIRED');assert.equal(calls.filter(x=>x.purpose==='bind').length,0);
 assert.throws(()=>c.openExternal('https://market.example.com/me/bind'),e=>e.code==='CORE_WEBSITE_CONFIGURATION_REQUIRED');
});
test('website setting is validated, persisted, survives legacy schema reopen and has an explicit default restore',async t=>{
 const{c,memory}=await fixture(t);await c.setServerOrigin('http://127.0.0.1:34543');await c.setWebsiteOrigin('http://127.0.0.1:5174');let state=c.state();assert.equal(state.websiteOrigin,'http://127.0.0.1:5174');assert.equal(state.websiteOriginSource,'setting');assert.equal(state.configuredWebsiteOrigin,config.websiteOrigin);assert.equal(state.websiteBinding.ready,true);
 const reopened=await SessionController.create(config,memoryStore(memory.read()).store);t.after(()=>reopened.dispose());assert.equal(reopened.state().websiteOrigin,state.websiteOrigin);assert.equal(reopened.state().websiteBinding.ready,true);
 await c.setWebsiteOrigin(null);state=c.state();assert.equal(state.websiteOrigin,config.websiteOrigin);assert.equal(state.websiteBinding.ready,false);assert.equal(state.websiteOriginSource,'config');
 await assert.rejects(c.setWebsiteOrigin('http://evil.example.com'),e=>e.code==='CORE_ORIGIN_REJECTED');assert.equal(c.state().websiteOrigin,config.websiteOrigin);
});
test('website API uses the same authenticated origin fence and exact single-field save contract as server',async t=>{
 const{c}=await fixture(t);const handle=createRouteHandler(c),origin='http://127.0.0.1:41001';const request=(body,source=origin)=>new Request(origin+ROUTES.website,{method:'POST',headers:{origin:source,host:'127.0.0.1:41001','content-type':'application/json','sec-fetch-site':'same-origin'},body:JSON.stringify(body)});
 assert.equal((await handle(request({websiteOrigin:'http://127.0.0.1:5174'}))).status,200);assert.equal((await handle(request({websiteOrigin:'https://wrong.example'},'https://foreign.example'))).status,403);assert.equal(c.state().websiteOrigin,'http://127.0.0.1:5174');assert.equal((await handle(request({websiteOrigin:null,extra:true}))).status,400);
});
test('even explicitly saved remote websites cannot be opened or bound when the server is loopback',async t=>{
 const{c}=await fixture(t);await c.setServerOrigin('http://localhost:34543');await c.setWebsiteOrigin('https://market.example.com');assert.equal(c.state().websiteBinding.ready,false);await assert.rejects(c.bindLink(),e=>e.code==='CORE_WEBSITE_CONFIGURATION_REQUIRED');assert.throws(()=>c.openExternal('https://market.example.com/me'),e=>e.code==='CORE_WEBSITE_CONFIGURATION_REQUIRED');
});

test('website switch erects its binding barrier before slow durable storage and cancels in-flight challenge',async t=>{
 let hold=false,releaseWrite,enteredWrite,releaseChallenge;
 const writeStarted=new Promise(r=>enteredWrite=r),writeBarrier=new Promise(r=>releaseWrite=r),challengeBarrier=new Promise(r=>releaseChallenge=r);
 const memory=memoryStore(grantedSnapshot(INITIAL_CORE_SNAPSHOT));
 const c=await SessionController.create(config,{...memory.store,publish:async next=>{if(hold){enteredWrite();await writeBarrier;}await memory.store.publish(next);}},{fetcher:async()=>{await challengeBarrier;return Response.json({nonce:'bind-nonce',expiresAt:new Date(Date.now()+60000).toISOString()});}});t.after(()=>c.dispose());
 const bind=c.bindLink();const rejected=assert.rejects(bind,e=>e.code==='CORE_CONFIGURATION_CHANGED');
 hold=true;const save=c.setWebsiteOrigin('https://new-market.example.com');await writeStarted;
 assert.equal(c.state().websiteBinding.ready,false);
 await assert.rejects(c.bindLink(),e=>e.code==='CORE_CONFIGURATION_CHANGED');
 assert.throws(()=>c.openExternal(config.websiteOrigin+'/me'),e=>e.code==='CORE_CONFIGURATION_CHANGED');
 releaseChallenge();await rejected;releaseWrite();await save;assert.equal(c.state().websiteBinding.ready,true);
});

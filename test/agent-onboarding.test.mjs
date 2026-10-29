import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,createPublicKey,verify,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {agentCall} from '../lib/agent.js';

async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'hm-core-onboarding-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const seen=[];let deviceId,publicKey,mode='pending',extra=false,hold,release,transform=v=>v;
 const gate=new Promise(r=>{release=r;});
 const server=createServer(async(req,res)=>{
  let text='';for await(const b of req)text+=b;const body=text?JSON.parse(text):null;seen.push({method:req.method,path:req.url,body,headers:req.headers});
  let result;
  if(req.url==='/v1/identity/devices/challenge')result={nonce:'fixture-nonce',expiresAt:'2026-10-28T20:00:00.000Z'};
  else if(req.url==='/v1/identity/devices'){
   publicKey=body.publicKey;deviceId=createHash('sha256').update(Buffer.from(publicKey,'base64url')).digest('base64url');
   const key=createPublicKey({format:'der',type:'spki',key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(publicKey,'base64url')])});
   assert.ok(verify(null,Buffer.from('fixture-nonce'+publicKey),key,Buffer.from(body.signature,'base64url')));assert.equal(body.label,undefined);
   result={deviceId,principalId:randomUUID()};
  }else{
   const cid=req.url.split('/')[7];
   const key=createPublicKey({format:'der',type:'spki',key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(publicKey,'base64url')])});
   const canonical=`${req.method}|${req.url}|${req.headers['x-hm-timestamp']}|${req.headers['x-hm-nonce']}|${createHash('sha256').update(text).digest('hex')}`;
   assert.ok(verify(null,Buffer.from(canonical),key,Buffer.from(req.headers['x-hm-signature'],'base64url')));
   if(req.method==='DELETE')result={deletedEvents:0,consentId:cid,state:'withdrawn',barrier:'committed'};
   else result={deviceId,consentId:cid,state:mode,authorization:mode==='active'?'website':null,noticeVersion:'hm-agent-usage-v1',includeBackfill:true,agreedAt:mode==='active'?'2026-10-28T10:00:00.000Z':null,binding:mode==='active'?{accountPrincipalId:'73ed4ae5-4b2e-4b93-9f59-cd734d681318',linkedAt:'2026-10-28T09:00:00.000Z'}:null,barrier:'committed',...(extra?{agreed:true}:{})};
   if(hold&&req.method==='GET'){hold();await gate;}
  }
  res.setHeader('content-type','application/json');res.end(JSON.stringify(transform(result)));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const config={sharedHome:root,serverOrigin:`http://127.0.0.1:${server.address().port}`,websiteOrigin:'http://127.0.0.1:54321'};
 return {root,config,seen,setMode:v=>{mode=v;},setExtra:v=>{extra=v;},hold:r=>{hold=r;},release,transform:f=>{transform=f;}};
}
test('v2 fresh state is read-only; a model cannot grant upload consent',async t=>{
 const f=await fixture(t);const s=await agentCall(f.config,{operation:'state'});assert.equal(s.agentProtocolVersion,2);assert.equal(s.consent.state,'withheld');assert.deepEqual(await readdir(f.root),[]);
 await assert.rejects(agentCall(f.config,{operation:'consent',state:'granted'}),/CORE_AGENT_WEB_CONSENT_REQUIRED/);assert.equal(f.seen.length,0);
});
test('prepare registers label-free and signs only fixed onboarding; original nonce bytes survive link',async t=>{
 const f=await fixture(t);const a=await agentCall(f.config,{operation:'prepareOnboarding'});const b=await agentCall(f.config,{operation:'prepareOnboarding'});assert.equal(a.consentId,b.consentId);
 const url=new URL(a.url);assert.equal(url.pathname,'/me/bind');assert.equal(url.searchParams.get('flow'),'agent');assert.equal(url.searchParams.get('consentId'),a.consentId);assert.equal(url.searchParams.get('noticeVersion'),'hm-agent-usage-v1');assert.equal(url.searchParams.get('expiresAt'),a.expiresAt);
 const key=JSON.parse(await readFile(join(f.root,'identity/device.json'),'utf8'));const pk=createPublicKey({format:'der',type:'spki',key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(key.publicKey,'base64url')])});assert.ok(verify(null,Buffer.from('fixture-nonce'),pk,Buffer.from(url.searchParams.get('signature'),'base64url')));
 const post=f.seen.find(x=>x.path.endsWith('/onboarding'));assert.deepEqual(post.body,{noticeVersion:'hm-agent-usage-v1',includeBackfill:true});assert.equal(post.headers['x-hm-device-id'],a.deviceId);
 await assert.rejects(agentCall(f.config,{operation:'sign',bytes:'aGk='}),/CORE_INPUT_INVALID/);await assert.rejects(agentCall(f.config,{operation:'signRequest',method:'POST',path:'/elsewhere',body:'{}'}),/CONSENT_WITHHELD/);
});
test('only exact committed website snapshot grants; pending and forged input cannot',async t=>{
 const f=await fixture(t);await agentCall(f.config,{operation:'prepareOnboarding'});await agentCall(f.config,{operation:'syncOnboarding'});assert.equal((await agentCall(f.config,{operation:'state'})).consent.state,'withheld');
 await assert.rejects(agentCall(f.config,{operation:'syncOnboarding',agreed:true}),/CORE_INPUT_INVALID/);
 f.setMode('active');f.setExtra(true);await assert.rejects(agentCall(f.config,{operation:'syncOnboarding'}),/CORE_AGENT_ONBOARDING_UNCONFIRMED/);f.setExtra(false);
 await agentCall(f.config,{operation:'syncOnboarding'});const s=await agentCall(f.config,{operation:'state'});assert.equal(s.consent.state,'granted');assert.equal(s.consent.authorization,'website');assert.equal(s.consent.agreedAt,'2026-10-28T10:00:00.000Z');
 assert.ok((await agentCall(f.config,{operation:'signRequest',method:'POST',path:'/v2/usage/events',body:'[]'}))['x-hm-signature']);
});
test('local close retains prepared generation for DELETE and never reopens on late website result',async t=>{
 const f=await fixture(t);const a=await agentCall(f.config,{operation:'prepareOnboarding'});await agentCall(f.config,{operation:'consent',state:'withheld'});assert.equal((await agentCall(f.config,{operation:'state'})).consent.consentId,a.consentId);
 f.setMode('active');await assert.rejects(agentCall(f.config,{operation:'syncOnboarding'}),/CONSENT_WITHHELD/);await assert.rejects(agentCall(f.config,{operation:'prepareOnboarding'}),/CONSENT_WITHHELD/);assert.equal((await agentCall(f.config,{operation:'withdraw'})).barrier,'committed');
});
test('a website response already in flight cannot race local close into granted',async t=>{
 const f=await fixture(t);await agentCall(f.config,{operation:'prepareOnboarding'});f.setMode('active');let arrived;const waiting=new Promise(r=>{arrived=r;});f.hold(arrived);const sync=agentCall(f.config,{operation:'syncOnboarding'});await waiting;
 await agentCall(f.config,{operation:'consent',state:'withheld'});f.release();await assert.rejects(sync,/CONSENT_WITHHELD/);assert.equal((await agentCall(f.config,{operation:'state'})).consent.state,'withheld');
});
test('prepared origins are pinned and mixed local/public origins fail before any writes or network',async t=>{
 const f=await fixture(t);await assert.rejects(agentCall({...f.config,websiteOrigin:'https://market.fixture.invalid'},{operation:'prepareOnboarding'}),/CORE_WEBSITE_CONFIGURATION_REQUIRED/);assert.deepEqual(await readdir(f.root),[]);assert.equal(f.seen.length,0);
 await agentCall(f.config,{operation:'prepareOnboarding'});const n=f.seen.length;await assert.rejects(agentCall({...f.config,websiteOrigin:'http://127.0.0.1:54322'},{operation:'syncOnboarding'}),/CORE_AGENT_ONBOARDING_UNCONFIRMED/);assert.equal(f.seen.length,n);
});
test('old terminal grant remains granted without fabricated website audit',async t=>{
 const f=await fixture(t);await mkdir(join(f.root,'agent'));const old={state:'granted',changedAt:'2026-10-01T00:00:00.000Z',consentId:randomUUID()};await writeFile(join(f.root,'agent/consent.json'),JSON.stringify(old));
 const s=await agentCall(f.config,{operation:'state'});assert.equal(s.consent.state,'granted');assert.equal(s.consent.authorization,'legacy-terminal');assert.equal(s.consent.agreedAt,null);assert.equal((await agentCall(f.config,{operation:'consent',state:'granted'})).consent.consentId,old.consentId);assert.equal(f.seen.length,0);
});

test('active facts require genuine matching audit and binding fields, never legacy or display hints',async t=>{
 const f=await fixture(t);await agentCall(f.config,{operation:'prepareOnboarding'});f.setMode('active');
 for(const edit of [v=>({...v,consentId:randomUUID()}),v=>({...v,deviceId:'A'.repeat(43)}),v=>({...v,authorization:'legacy-terminal'}),v=>({...v,noticeVersion:'other'}),v=>({...v,includeBackfill:false}),v=>({...v,agreedAt:null}),v=>({...v,agreedAt:'tomorrow'}),v=>({...v,binding:null}),v=>({...v,binding:{accountPrincipalId:'invalid',linkedAt:'2026-10-28T09:00:00.000Z'}}),v=>({...v,barrier:'pending'})]){
  f.transform(edit);await assert.rejects(agentCall(f.config,{operation:'syncOnboarding'}),/CORE_AGENT_ONBOARDING_UNCONFIRMED/);assert.equal((await agentCall(f.config,{operation:'state'})).consent.state,'withheld');
 }
});
test('concurrent prepares claim one generation; server withdrawal closes without resurrection',async t=>{
 const f=await fixture(t);const [a,b]=await Promise.all([agentCall(f.config,{operation:'prepareOnboarding'}),agentCall(f.config,{operation:'prepareOnboarding'})]);assert.equal(a.consentId,b.consentId);assert.equal(a.deviceId,b.deviceId);
 f.setMode('withdrawn');await assert.rejects(agentCall(f.config,{operation:'syncOnboarding'}),/CONSENT_WITHHELD/);await assert.rejects(agentCall(f.config,{operation:'sign',bytes:'aGk='}),/CORE_INPUT_INVALID/);
});

test('changing the configured origin cannot block local close or send a tombstone to another backend',async t=>{
 const f=await fixture(t);const a=await agentCall(f.config,{operation:'prepareOnboarding'});const changed={...f.config,serverOrigin:'http://127.0.0.1:1'};
 const closed=await agentCall(changed,{operation:'consent',state:'withheld'});assert.equal(closed.consent.state,'withheld');assert.equal(closed.consent.consentId,a.consentId);
 await assert.rejects(agentCall(changed,{operation:'withdraw'}),/CORE_AGENT_ONBOARDING_UNCONFIRMED/);assert.equal((await agentCall(f.config,{operation:'state'})).consent.state,'withheld');
});

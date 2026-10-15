import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {SessionController} from '../lib/controller.js';
import {ServerTransport} from '../lib/transport.js';
import {registerDevice} from '../lib/registration.js';
import {createDevice} from '../lib/device.js';
import {createRouteHandler,ROUTES} from '../lib/routes.js';
import {INITIAL_CORE_SNAPSHOT} from '../lib/contracts.js';
import {grantedSnapshot,memoryStore} from './fixtures/core-store.mjs';
const denied=(status=403,code='IDENTITY_ORIGIN_REJECTED')=>Response.json({error:{code,message:'PRIVATE_UPSTREAM_TEXT_MUST_NOT_LEAK'}},{status});
async function controller(t,fetcher,extra={}){const memory=memoryStore(grantedSnapshot(INITIAL_CORE_SNAPSHOT));const c=await SessionController.create({serverOrigin:'http://127.0.0.1:34543',websiteOrigin:'http://127.0.0.1:5174',...extra},memory.store,{fetcher});t.after(()=>c.dispose());return {c,memory};}
const registered=async(url,init)=>new URL(url).pathname.endsWith('/challenge')?Response.json({nonce:'n',expiresAt:new Date(Date.now()+60000).toISOString()}):Response.json({deviceId:createHash('sha256').update(Buffer.from(JSON.parse(init.body).publicKey,'base64url')).digest('base64url'),principalId:'p'},{status:201});

test('real loopback localhost Origin denial reaches the local route and state as HTTP403, not offline',async t=>{
 const server=createServer((req,res)=>{res.writeHead(403,{'content-type':'application/json'});res.end(JSON.stringify({error:{code:'IDENTITY_ORIGIN_REJECTED',message:'PRIVATE_UPSTREAM_TEXT_MUST_NOT_LEAK'}}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r)}));
 const {c}=await controller(t,globalThis.fetch,{serverOrigin:'http://localhost:'+server.address().port});const handle=createRouteHandler(c);const origin='http://127.0.0.1:41001';const reply=await handle(new Request(origin+ROUTES.register,{method:'POST',headers:{origin,host:'127.0.0.1:41001','sec-fetch-site':'same-origin'}}));
 assert.equal(reply.status,403);const body=await reply.json();assert.equal(body.error.code,'IDENTITY_ORIGIN_REJECTED');assert.equal(body.error.upstreamStatus,403);assert.doesNotMatch(JSON.stringify(body),/PRIVATE_UPSTREAM/);
 assert.equal(c.state().session.serverReachable,true);assert.equal(c.state().registrationFailure.status,403);assert.equal(c.state().registration.lastError,'IDENTITY_ORIGIN_REJECTED');
});
test('registration POST rate limit preserves original code/status and never becomes network unavailability',async()=>{
 const transport=new ServerTransport('https://server.example',1000,async(url,init)=>new URL(url).pathname.endsWith('/challenge')?registered(url,init):denied(429,'IDENTITY_RATE_LIMITED'));
 await assert.rejects(registerDevice(transport,createDevice(),null),e=>e.code==='IDENTITY_RATE_LIMITED'&&e.status===429&&e.upstreamStatus===429);
});
test('HTTP errors with non-JSON bodies or unsafe codes still preserve the actual HTTP status',async()=>{
 for(const response of[new Response('<html>private gateway body</html>',{status:502}),denied(403,'unsafe private text')]){const transport=new ServerTransport('https://server.example',1000,async()=>response);await assert.rejects(registerDevice(transport,createDevice(),null),e=>e.code==='CORE_UPSTREAM_HTTP_ERROR'&&e.status===response.status&&e.upstreamStatus===response.status);}
});
test('malformed successful challenge is a protocol failure, and only failed transport says unavailable',async()=>{
 const malformed=new ServerTransport('https://server.example',1000,async()=>new Response('{bad json'));await assert.rejects(registerDevice(malformed,createDevice(),null),e=>e.code==='CORE_UPSTREAM_RESPONSE_INVALID'&&e.status===502);
 const offline=new ServerTransport('https://server.example',1000,async()=>{throw new TypeError('fetch failed')});await assert.rejects(registerDevice(offline,createDevice(),null),e=>e.code==='CORE_UPSTREAM_UNAVAILABLE'&&e.status===503&&e.upstreamStatus===undefined);
});
test('binding and server-auth challenge preserve the explicit refusal',async t=>{
 const {c}=await controller(t,async()=>denied(),{authNonceSource:'server'});await assert.rejects(c.bindLink(),e=>e.code==='IDENTITY_ORIGIN_REJECTED'&&e.status===403);await assert.rejects(c.service.signRequest({method:'GET',path:'/v1/identity/me',body:null}),e=>e.code==='IDENTITY_ORIGIN_REJECTED'&&e.status===403);
});
test('contributions, points and raw event reads retain code and HTTP status in their unavailable views',async t=>{
 let reject=false;const {c}=await controller(t,async(url,init)=>reject?denied(429,'USAGE_RATE_LIMITED'):registered(url,init));await c.register();reject=true;
 for(const view of[await c.refreshContributions(),await c.points(),await c.activity()]){assert.equal(view.reason,'USAGE_RATE_LIMITED');assert.equal(view.upstreamStatus,429);}
});

test('Identity recovery refusal is shown instead of being hidden behind the Usage 401',async t=>{
 let ready=false;const {c}=await controller(t,async(url,init)=>!ready?registered(url,init):new URL(url).pathname==='/v1/identity/me'?denied():denied(401,'USAGE_AUTH_REQUIRED'));
 await c.register();ready=true;const view=await c.refreshContributions();assert.equal(view.reason,'IDENTITY_ORIGIN_REJECTED');assert.equal(view.upstreamStatus,403);
});

test('post-registration Identity verification preserves its refusal and status',async t=>{
 let after=false,identityReads=0;const {c}=await controller(t,async(url,init)=>{
  const path=new URL(url).pathname;
  if(!after||path.endsWith('/challenge')||path==='/v1/identity/devices')return registered(url,init);
  if(path==='/v1/identity/me')return ++identityReads===1?denied(401,'IDENTITY_DEVICE_SIGNATURE_INVALID'):denied();
  return denied(401,'USAGE_AUTH_REQUIRED');
 });await c.register();after=true;const view=await c.refreshContributions();assert.equal(view.reason,'IDENTITY_ORIGIN_REJECTED');assert.equal(view.upstreamStatus,403);assert.equal(c.state().registrationFailure.upstreamStatus,403);
});

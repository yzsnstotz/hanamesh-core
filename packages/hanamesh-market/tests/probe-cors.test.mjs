import test from 'node:test';import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {createHandoffHandler} from '../src/library/handoff.js';
const createLibraryHttpHandler=(library,{parentOrigin})=>createHandoffHandler({library,queue:{},settings:library.handoffSettings,port:()=>new URL(parentOrigin).port});
const PATH='/hanamesh/library/install-target',SITE='https://unapproved.example',ALLOWED='https://market.hanamesh.com';
async function boot(t,kind){
 let base,reads=0;const library={handoffSettings:()=>({allowedOrigins:[ALLOWED]}),installTarget:()=>{reads++;return{client:'hanamesh',ready:true,installTarget:{contract:'hanamesh.install-target'}}},installationStatus:()=>{throw new Error('must not inspect inventories')},resolveTarget:()=>{throw new Error('must not resolve installs')}};
 const server=createServer((req,res)=>(kind==='handoff'?createHandoffHandler({library,queue:{},settings:library.handoffSettings,port:()=>new URL(base).port}):createLibraryHttpHandler(library,{parentOrigin:base,authenticate:()=>{throw new Error('must not authenticate')},authorize:()=>{throw new Error('must not authorize')}}))(req,res));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections()}));return{base,reads:()=>reads};
}
const get=(base,patch={})=>fetch(base+PATH,{headers:{origin:SITE,...patch}});
for(const kind of ['handoff','host']){
 test(`D3 ${kind}: unapproved discovery is a CORS-readable constant refusal without capabilities or inventory reads`,async t=>{
  const h=await boot(t,kind);let expected;
  for(const origin of [SITE,'https://another.example:8443']){
   const res=await get(h.base,{origin});assert.equal(res.status,403);assert.equal(res.headers.get('access-control-allow-origin'),origin);assert.equal(res.headers.get('vary'),'Origin');
   for(const name of ['access-control-allow-credentials','access-control-allow-private-network','access-control-allow-headers','access-control-allow-methods','access-control-max-age'])assert.equal(res.headers.get(name),null,name);
   assert.equal(res.headers.get('cache-control'),'no-store');const body=await res.json();assert.deepEqual(body,{error:{code:'ORIGIN_DENIED',message:'This website is not allowed to read discovery.'}});
   expected??=body;assert.deepEqual(body,expected);assert.doesNotMatch(JSON.stringify(body),/client|ready|need|installationStatus|allowedOrigins|market\.hanamesh|traceId/);assert.equal(h.reads(),0);
  }
  const allowed=await get(h.base,{origin:ALLOWED});assert.equal(allowed.status,200);assert.equal((await allowed.json()).client,'hanamesh');assert.equal(h.reads(),1);
 });
 test(`D3 ${kind}: valid GET preflight succeeds for refusal, PNA opt-in is conditional, GET remains denied`,async t=>{
  const h=await boot(t,kind);
  for(const origin of [SITE,ALLOWED])for(const pna of [undefined,'true']){
   const pre=await fetch(h.base+PATH,{method:'OPTIONS',headers:{origin,'access-control-request-method':'GET',...(pna?{'access-control-request-private-network':pna}:{})}});
   assert.equal(pre.status,204);assert.equal(await pre.text(),'');assert.equal(pre.headers.get('access-control-allow-origin'),origin);assert.equal(pre.headers.get('access-control-allow-methods'),'GET');
   assert.equal(pre.headers.get('access-control-allow-private-network'),pna??null);assert.equal(pre.headers.get('access-control-allow-credentials'),null);assert.equal(pre.headers.get('access-control-max-age'),null);
   for(const field of ['Origin','Access-Control-Request-Method','Access-Control-Request-Headers','Access-Control-Request-Private-Network'])assert.ok(pre.headers.get('vary').split(',').map(x=>x.trim()).includes(field));assert.equal(h.reads(),0);
  }
  assert.equal((await get(h.base)).status,403);assert.equal(h.reads(),0);
 });
 test(`D3 ${kind}: malformed origins, unsafe targets, credentials, frames and non-GET preflights get no diagnostic CORS`,async t=>{
  const h=await boot(t,kind);
  const cases=[...[ 'null','file://','https://unapproved.example/path','https://unapproved.example/','https://a.example https://b.example','https://name:password@unapproved.example'].map(origin=>({origin})),{cookie:'private'},{authorization:'Bearer private'},{'sec-fetch-dest':'iframe'}];
  for(const headers of cases){const res=await get(h.base,headers);assert.ok(res.status>=400);assert.equal(res.headers.get('access-control-allow-origin'),null);assert.equal(h.reads(),0)}
  for(const [suffix,method,headers]of [['?x=1','GET',{}],['','POST',{}],['','OPTIONS',{'access-control-request-method':'POST'}],['','OPTIONS',{'access-control-request-method':'GET','access-control-request-headers':'authorization'}],['','OPTIONS',{'access-control-request-method':'GET','access-control-request-private-network':'false'}]]){
   const res=await fetch(h.base+PATH+suffix,{method,headers:{origin:SITE,...headers}});assert.ok(res.status>=400);assert.equal(res.headers.get('access-control-allow-origin'),null);assert.equal(res.headers.get('access-control-allow-private-network'),null);assert.equal(h.reads(),0);
  }
  for(const [path,host]of [[PATH,'rebound.example:9999'],['http://other.example'+PATH,new URL(h.base).host],['//other.example'+PATH,new URL(h.base).host]]){
   await new Promise((resolve,reject)=>{request(h.base,{path,headers:{host,origin:SITE}},res=>{res.resume();res.on('end',()=>{try{assert.ok(res.statusCode>=400);assert.equal(res.headers['access-control-allow-origin'],undefined);resolve()}catch(e){reject(e)}})}).on('error',reject).end()});
  }
 });
 test(`D3 ${kind}: the exception never grants installation-status or other library/handoff reads`,async t=>{
  const h=await boot(t,kind);
  for(const path of ['/hanamesh/library/installation-status','/hanamesh/library/handoff','/hanamesh/library/handoff?id=private','/hanamesh/library/installedPlugins'])for(const method of ['GET','OPTIONS','POST']){
   const res=await fetch(h.base+path,{method,headers:{origin:SITE,'access-control-request-method':'GET','access-control-request-private-network':'true','content-type':'application/json'},...(method==='POST'?{body:'{}'}:{})});assert.ok(res.status>=400);assert.equal(res.headers.get('access-control-allow-origin'),null);assert.equal(res.headers.get('access-control-allow-private-network'),null);assert.equal(h.reads(),0);
  }
 });
}

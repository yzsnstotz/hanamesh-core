import test from'node:test';import assert from'node:assert/strict';import{createServer}from'node:http';import{createMarketHandler}from'../src/routes.js';
test('Market routes admit only DSH-authenticated callers and explicit JSON writes, excluding application iframes',async t=>{const calls=[],service={list:async input=>{calls.push(input);return{items:[],page:1,totalPages:0};},prepare:async input=>{calls.push(input);return{};}};const server=createServer(createMarketHandler({service,connection:{requestRejection:req=>req.headers.authorization==='Bearer fixture'?undefined:{status:401}}}));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const base='http://127.0.0.1:'+server.address().port,headers={authorization:'Bearer fixture'};assert.equal((await fetch(base+'/hanamesh/market/catalog')).status,403);assert.equal((await fetch(base+'/hanamesh/market/catalog',{headers:{...headers,'sec-fetch-dest':'iframe'}})).status,403);assert.equal(calls.length,0);assert.equal((await fetch(base+'/hanamesh/market/catalog',{headers})).status,200);assert.deepEqual(calls,[{}]);assert.equal((await fetch(base+'/hanamesh/market/catalog?page=1&page=2',{headers})).status,400);const post={method:'POST',headers:{...headers,'content-type':'application/json'},body:'{}'};assert.equal((await fetch(base+'/hanamesh/market/prepare',post)).status,403);assert.equal(calls.length,1);assert.equal((await fetch(base+'/hanamesh/market/prepare',{...post,headers:{...post.headers,'x-hanamesh-client':'market-v1'}})).status,200);assert.equal(calls.length,2);assert.equal((await fetch(base+'/hanamesh/market/prepare?extra=x',{...post,headers:{...post.headers,'x-hanamesh-client':'market-v1'}})).status,403);assert.equal(calls.length,2);});

test('Market registers its client suite read without the retired website bridge',async()=>{
 const {apply}=await import('../src/index.js');
 const {initialState}=await import('../src/service.js');
 const paths=[],cleanups=[];
 const ctx={
  effect(run){cleanups.push(run());},
  inject(){return{dispose(){}};},
  storageDomain:{async open(){return{global:{get:initialState},close(){}};}},
  connection:{requestRejection(){}},
  webServer:{register({path}){paths.push(path);return()=>{};}},
  provide(){return()=>{};},
 };
 try{
  await apply(ctx);
  assert.ok(paths.includes('/hanamesh/market/suite'));
  assert.equal(new Set(paths).size,paths.length);
  assert.deepEqual(paths.filter(path=>!path.startsWith('/hanamesh/market/')||path.includes('handoff')),[]);
 }finally{for(const cleanup of cleanups.reverse())await cleanup();}
});

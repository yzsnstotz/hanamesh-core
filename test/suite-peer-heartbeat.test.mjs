import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {ClientPeerLeases} from '../lib/suite/client-peers.js';
import {createRouteHandler} from '../lib/routes.js';
const frame=new TextEncoder().encode('hanamesh-core-client-peer-lease/2\n');
const payload={protocol:2,pageId:'page0000000000001',activationId:'active0000000001',generation:1,reactVersion:'18.3.1'};
const request=signal=>new Request('http://127.0.0.1:20123/api/hanamesh/core/client-peer-lease',{method:'POST',headers:{origin:'http://127.0.0.1:20123','content-type':'application/json'},body:JSON.stringify(payload),signal});
const turn=()=>new Promise(resolve=>setImmediate(resolve));

test('peer stream sends heartbeats without replacing its lease and stops on cancel, abort and disposal',async t=>{
 t.mock.timers.enable({apis:['setInterval']});
 for(const finish of ['cancel','abort','dispose']){
  const store=new ClientPeerLeases(true),abort=new AbortController();
  const response=await createRouteHandler({},null,store,undefined,1000)(request(abort.signal));
  const reader=response.body.getReader();
  try{
   assert.deepEqual((await reader.read()).value,frame);
   const context=store.snapshot().contextId;let next;
   const pending=reader.read().then(value=>{next=value});
   t.mock.timers.tick(1000);await turn();
   assert.ok(next,'idle native HTTP forwards need body bytes before their read timeout');
   assert.deepEqual(next.value,frame);assert.equal(store.snapshot().contextId,context,'heartbeat never renews observation identity');
   await pending;
   if(finish==='cancel')await reader.cancel();else{if(finish==='abort')abort.abort();else store.close();await turn();assert.equal((await reader.read()).done,true);}
   assert.equal(store.snapshot().status,'unknown');
   t.mock.timers.tick(3000);await turn();
  }finally{abort.abort();store.close();await reader.cancel();reader.releaseLock();}
 }
});

test('client accepts repeated bounded heartbeat frames across chunk boundaries but still fails closed on partial EOF',async()=>{
 let client,signal,body;
 vm.runInNewContext(await readFile('lib/client.js','utf8'),{window:{__ModuleLoader__:{load:s=>client=s.factory(()=>({version:'18.3.1'}))}},crypto:globalThis.crypto,AbortController,TextEncoder,console:{error(){}}});
 const stop=client.startClientPeerLease({generation:{getSnapshot:()=>({id:1}),subscribe:()=>()=>{}}},new EventTarget(),async(_path,init)=>{
  signal=init.signal;
  return new Response(new ReadableStream({start(controller){body=controller;controller.enqueue(frame)}}),{headers:{'content-type':'application/octet-stream'}});
 });
 try{
  await turn();body.enqueue(frame.slice(0,7));await turn();assert.equal(signal.aborted,false,'a repeated frame is transport liveness, not malformed trailing bytes');
  body.enqueue(frame.slice(7));body.enqueue(frame);await turn();assert.equal(signal.aborted,false);
  body.enqueue(frame.slice(0,3));body.close();await turn();assert.equal(signal.aborted,true,'partial final frame remains invalid');
 }finally{stop()}
});

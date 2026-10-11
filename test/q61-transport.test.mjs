import test from 'node:test';
import assert from 'node:assert/strict';
const {ServerTransport}=await import(process.env.HM_CORE_TRANSPORT ?? '../lib/transport.js');
test('response budget cancels overflowing stream, releases reader and reports explicit reason',async()=>{
 let cancelled=false;
 const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(8));c.enqueue(new Uint8Array(8));c.close();},cancel(){cancelled=true;}});
 const transport=new ServerTransport('https://server.example',10000,async()=>new Response(body),4);
 await assert.rejects(transport.request('/read'),e=>e.code==='CORE_RESPONSE_LIMIT_EXCEEDED');assert.equal(cancelled,true);assert.equal(body.locked,false);transport.dispose();
});
test('declared overflow cancels body before reading',async()=>{
 let cancelled=false;
 const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(8));c.close();},cancel(){cancelled=true;}});
 const t=new ServerTransport('https://server.example',10000,async()=>new Response(body,{headers:{'content-length':'8'}}),4);
 await assert.rejects(t.request('/read'),e=>e.code==='CORE_RESPONSE_LIMIT_EXCEEDED');assert.equal(cancelled,true);t.dispose();
});
test('dispose cancels an active request and rejects later requests',async()=>{
 let requested;const ready=new Promise(r=>requested=r);let signal;
 const t=new ServerTransport('https://server.example',10000,async(_url,init)=>{signal=init.signal;requested();return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));});
 assert.equal(typeof t.dispose,'function');
 const pending=t.request('/read');await ready;t.dispose();await assert.rejects(pending,e=>e.code==='CORE_DISPOSED');assert.equal(signal.aborted,true);await assert.rejects(t.request('/later'),e=>e.code==='CORE_DISPOSED');
});

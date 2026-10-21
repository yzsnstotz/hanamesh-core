import {getEventListeners} from 'node:events';
import test from 'node:test';import assert from 'node:assert/strict';
import * as gateModule from '../lib/activation.js';
test('requests admitted during activation wait for that activation once, without 404 or retries',async()=>{
 const gate=gateModule.createActivationGate({requestRejection:()=>undefined});let completed=false,calls=0;
 const pending=gate.fetch(new Request('http://dsh.invalid/api/hanamesh/core/state')).then(r=>{completed=true;return r});await Promise.resolve();assert.equal(completed,false);
 gate.ready(async()=>{calls++;return Response.json({ready:true})});assert.deepEqual(await(await pending).json(),{ready:true});assert.equal(calls,1);
});
test('activation failure and disposed gates are named; rejected and aborted requests never reach handler',async()=>{
 const gate=gateModule.createActivationGate({requestRejection:r=>r.headers.has('bad')?403:undefined});
 assert.equal((await gate.fetch(new Request('http://dsh.invalid/',{headers:{bad:'1'}}))).status,403);
 const pending=gate.fetch(new Request('http://dsh.invalid/'));gate.fail();const r=await pending;assert.equal(r.status,503);assert.equal((await r.json()).error.code,'CORE_ACTIVATION_FAILED');
 const live=gateModule.createActivationGate({requestRejection:()=>undefined});let calls=0;const signal=new AbortController();const wait=live.fetch(new Request('http://dsh.invalid/',{signal:signal.signal}));signal.abort();live.ready(async()=>{calls++;return Response.json({})});assert.equal((await wait).status,499);assert.equal(calls,0);live.dispose();assert.equal((await live.fetch(new Request('http://dsh.invalid/'))).status,503);
});
test('abort wakes a request even while activation remains pending, and removes its listener',async()=>{
 const gate=gateModule.createActivationGate({requestRejection:()=>undefined}),signal=new AbortController();let settled=false;
 const request=new Request('http://dsh.invalid/',{signal:signal.signal});const pending=gate.fetch(request).then(r=>{settled=true;return r});assert.equal(getEventListeners(request.signal,'abort').length,1);
 signal.abort();for(let i=0;i<8;i++)await Promise.resolve();
 try{assert.equal(settled,true,'abort itself must finish without ready/fail/dispose');const r=await pending;assert.equal(r.status,499);assert.equal(getEventListeners(request.signal,'abort').length,0)}finally{gate.dispose();await pending}
});

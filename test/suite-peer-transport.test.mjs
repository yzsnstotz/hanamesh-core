import test from 'node:test';
import assert from 'node:assert/strict';
import {ClientPeerLeases} from '../lib/suite/client-peers.js';
import {createRouteHandler} from '../lib/routes.js';
const payload=protocol=>({protocol,pageId:'page0000000000001',activationId:'active0000000001',generation:1,reactVersion:'18.3.1'});
const request=(signal,body)=>new Request('http://127.0.0.1:20123/api/hanamesh/core/client-peer-lease',{method:'POST',headers:{origin:'http://127.0.0.1:20123','content-type':'application/json'},body:JSON.stringify(body),signal});

// DSH Host gzip (compression + mime-db 1.54 marks application/octet-stream compressible) buffers every
// lease frame inside zlib, so the native forwarder sees no body bytes and aborts at its 300 s body timeout.
test('peer lease stream opts out of Host response transformation so each frame is delivered immediately',async()=>{
 const store=new ClientPeerLeases(true),abort=new AbortController();
 const response=await createRouteHandler({},null,store)(request(abort.signal,payload(2)));
 try{
  assert.equal(response.status,200);
  assert.match(response.headers.get('cache-control')??'',/(^|,)\s*no-transform\s*(,|$)/,'RFC 9111 no-transform keeps compression middleware from buffering the live stream');
  assert.match(response.headers.get('cache-control')??'',/(^|,)\s*no-store\s*(,|$)/);
 }finally{abort.abort();await response.body?.cancel();store.close();}
});

test('only the current lease protocol is admitted; client and Host ship in the same Core package',async()=>{
 const store=new ClientPeerLeases(true),abort=new AbortController();
 const response=await createRouteHandler({},null,store)(request(abort.signal,payload(1)));
 assert.equal(response.status,400);
 assert.equal((await response.json()).error.code,'CORE_SUITE_CLIENT_PEER_INVALID');
 assert.equal(store.snapshot().reason,'CORE_SUITE_CLIENT_PEER_NOT_CONNECTED');
 store.close();
});

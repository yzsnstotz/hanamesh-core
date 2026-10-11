import test from 'node:test';
import assert from 'node:assert/strict';
import {SessionController} from '../lib/controller.js';
import {createRouteHandler, ROUTES} from '../lib/routes.js';
import {INITIAL_CORE_SNAPSHOT} from '../lib/contracts.js';
import {memoryStore} from './fixtures/core-store.mjs';

const origin = 'http://127.0.0.1:41001';
const sameOriginHeaders = {'content-type': 'application/json', origin, host: '127.0.0.1:41001', 'sec-fetch-site': 'same-origin'};

test('service contract has exactly ten frozen keys', async () => {
  const controller = await SessionController.create({serverOrigin: null, websiteOrigin: null}, memoryStore(INITIAL_CORE_SNAPSHOT).store);
  assert.equal(Object.isFrozen(controller.service), true);
  assert.deepEqual(Object.keys(controller.service).sort(), ['getConsent', 'getDeviceId', 'getHealth', 'getPublicKey', 'getServerOrigin', 'getSession', 'onConsentChange', 'protocolVersion', 'sign', 'signRequest'].sort());
});

test('state, consent and diagnostics routes preserve method, origin and secret fences', async () => {
  const memory = memoryStore(INITIAL_CORE_SNAPSHOT);
  const controller = await SessionController.create({serverOrigin: null, websiteOrigin: null}, memory.store);
  const handle = createRouteHandler(controller);
  const state = await handle(new Request(`${origin}${ROUTES.state}`));
  assert.equal(state.status, 200);
  const stateBody = await state.json();
  assert.equal(stateBody.consent.state, 'withheld');
  assert.equal(stateBody.session.protocolVersion, '1');
  assert.equal(stateBody.session.bound, null);
  const changed = await handle(new Request(`${origin}${ROUTES.consent}`, {method: 'POST', headers: sameOriginHeaders, body: JSON.stringify({state: 'granted'})}));
  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).state, 'granted');
  const rejected = await handle(new Request(`${origin}${ROUTES.consent}`, {method: 'POST', headers: {...sameOriginHeaders, origin: 'https://evil.example'}, body: JSON.stringify({state: 'withheld'})}));
  assert.equal(rejected.status, 403);
  const method = await handle(new Request(`${origin}${ROUTES.state}`, {method: 'POST', headers: sameOriginHeaders, body: '{}'}));
  assert.equal(method.status, 405);
  const diagnostics = JSON.stringify(await (await handle(new Request(`${origin}${ROUTES.diagnostics}`))).json());
  assert.doesNotMatch(diagnostics, /private.?key|authorization|token/i);
});

test('DSH bridge accepts the authenticated carrier Host while rejecting foreign or wrong-port origins', async () => {
  const controller = await SessionController.create({serverOrigin: null, websiteOrigin: null}, memoryStore(INITIAL_CORE_SNAPSHOT).store);
  const handle = createRouteHandler(controller);
  const bridgeUrl = `http://dsh.internal${ROUTES.consent}`;
  const request = originValue => new Request(bridgeUrl, {method: 'POST', headers: {
    'content-type': 'application/json', host: '127.0.0.1:41001', origin: originValue, 'sec-fetch-site': 'same-origin',
  }, body: JSON.stringify({state: 'granted'})});
  assert.equal((await handle(request(origin))).status, 200);
  assert.equal((await handle(request('https://evil.example'))).status, 403);
  assert.equal((await handle(request('http://127.0.0.1:41002'))).status, 403);
});

test('native authenticated Connection admission supports stripped Origin without weakening standalone or Web fences',async()=>{
 const c=await SessionController.create({serverOrigin:null,websiteOrigin:null},memoryStore(INITIAL_CORE_SNAPSHOT).store);
 const request=headers=>new Request(`${origin}${ROUTES.consent}`,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify({state:'granted'})});
 const standalone=createRouteHandler(c);assert.equal((await standalone(request({}))).status,403);
 const handle=createRouteHandler(c,{requestRejection:req=>req.headers.get('x-fixture-admitted')==='yes'?undefined:401});
 try {
  assert.equal((await handle(request({'x-fixture-admitted':'yes'}))).status,200);
  assert.equal((await handle(request({}))).status,401);
  assert.equal((await handle(request({...sameOriginHeaders,'x-fixture-admitted':'yes',origin:'https://evil.example'}))).status,403);
 }finally{await c.dispose();}
});

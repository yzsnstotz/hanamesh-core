import test from 'node:test';
import assert from 'node:assert/strict';
import {SessionController} from '../lib/controller.js';
import {INITIAL_CORE_SNAPSHOT} from '../lib/contracts.js';
import {memoryStore} from './fixtures/core-store.mjs';

const CONFIG = {serverOrigin: null, websiteOrigin: null};

test('consent defaults withheld, publishes once, survives restart, isolates and unsubscribes listeners', async () => {
  const memory = memoryStore(INITIAL_CORE_SNAPSHOT);
  const controller = await SessionController.create(CONFIG, memory.store);
  assert.equal(controller.service.getConsent(), 'withheld');
  const before = memory.publications.length;
  const seen = [];
  controller.service.onConsentChange(() => { throw new Error('listener failure'); });
  const unsubscribe = controller.service.onConsentChange((state, changedAt) => seen.push([state, changedAt]));
  const result = await controller.setConsent('granted');
  assert.equal(memory.publications.length, before + 1);
  assert.equal(result.state, 'granted');
  assert.equal(seen.length, 1);
  unsubscribe();
  await controller.setConsent('withheld');
  assert.equal(seen.length, 1);
  const restarted = await SessionController.create(CONFIG, memoryStore(memory.read()).store);
  assert.equal(restarted.service.getConsent(), 'withheld');
});

test('a delayed registration publish cannot restore consent after the user withdraws it', async () => {
  let releaseRegistration;
  let registrationRequested;
  const requested = new Promise(resolve => { registrationRequested = resolve; });
  const response = new Promise(resolve => { releaseRegistration = resolve; });
  const memory = memoryStore({...INITIAL_CORE_SNAPSHOT, consent: {state: 'granted', changedAt: new Date(0).toISOString()}});
  let calls = 0;
  const controller = await SessionController.create({serverOrigin: 'https://server.example', websiteOrigin: null}, memory.store, {fetcher: async (_url, init) => {
    if (++calls === 1) return Response.json({nonce: 'register-nonce'});
    registrationRequested();
    const {publicKey} = JSON.parse(init.body);
    const {createHash} = await import('node:crypto');
    const deviceId = createHash('sha256').update(Buffer.from(publicKey, 'base64url')).digest('base64url');
    await response;
    return Response.json({deviceId, principalId: 'principal-1'}, {status: 201});
  }});
  const pending = controller.register();
  await requested;
  await controller.setConsent('withheld');
  releaseRegistration();
  await pending;
  assert.equal(controller.service.getConsent(), 'withheld');
  assert.equal(memory.read().consent.state, 'withheld');
});

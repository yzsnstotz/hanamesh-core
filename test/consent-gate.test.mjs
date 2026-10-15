import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {SessionController} from '../lib/controller.js';
import {createRouteHandler, ROUTES} from '../lib/routes.js';
import {INITIAL_CORE_SNAPSHOT} from '../lib/contracts.js';
import {memoryStore} from './fixtures/core-store.mjs';

const carrier = 'http://127.0.0.1:41003';
const CONFIG = {serverOrigin: 'https://server.fixture.invalid', websiteOrigin: 'https://web.fixture.invalid'};
const postTo = path => new Request(`${carrier}${path}`, {method: 'POST', headers: {origin: carrier, 'sec-fetch-site': 'same-origin'}});

function server() {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    const path = new URL(String(url)).pathname;
    calls.push(path);
    if (path.endsWith('/challenge')) return Response.json({nonce: 'nonce', expiresAt: new Date(Date.now() + 60_000).toISOString()});
    if (path.endsWith('/v1/identity/devices')) {
      const {publicKey} = JSON.parse(init.body);
      return Response.json({deviceId: createHash('sha256').update(Buffer.from(publicKey, 'base64url')).digest('base64url'), principalId: 'principal-1'}, {status: 201});
    }
    if (path.startsWith('/v1/usage/me/contributions')) return Response.json({availability: 'available', byHana: []});
    return Response.json({}, {status: 404});
  };
  return {calls, fetcher};
}
const until = async predicate => { for (let i = 0; i < 200 && !predicate(); i++) await new Promise(resolve => setImmediate(resolve)); assert.ok(predicate(), 'condition not reached'); };

test('activation with consent withheld registers nothing and sends nothing', async t => {
  const remote = server();
  const memory = memoryStore(INITIAL_CORE_SNAPSHOT);
  const controller = await SessionController.create(CONFIG, memory.store, {fetcher: remote.fetcher});
  t.after(() => controller.dispose());
  await controller.startRegistration();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(remote.calls, []);
  assert.equal(memory.read().registration.status, 'unregistered');
  assert.deepEqual(await controller.refreshContributions(), {status: 'unavailable', reason: 'CONSENT_WITHHELD'});
  assert.equal((await controller.refreshPoints()).reason, 'CONSENT_WITHHELD');
  assert.equal((await controller.activity()).reason, 'CONSENT_WITHHELD');
  await controller.refresh();
  assert.deepEqual(remote.calls, [], 'refresh does not register or read before consent');
  assert.equal(controller.state().contributions.reason, 'CONSENT_WITHHELD');
});

test('granting consent registers the device and starts contributions; withdrawing keeps the registration', async t => {
  const remote = server();
  const memory = memoryStore(INITIAL_CORE_SNAPSHOT);
  const controller = await SessionController.create(CONFIG, memory.store, {fetcher: remote.fetcher});
  t.after(() => controller.dispose());
  await controller.startRegistration();
  await controller.setConsent('granted');
  await until(() => remote.calls.some(path => path.startsWith('/v1/usage/me/contributions')));
  assert.deepEqual(remote.calls.slice(0, 3), ['/v1/identity/devices/challenge', '/v1/identity/devices', '/v1/usage/me/contributions']);
  assert.equal(memory.read().registration.status, 'registered');
  await controller.setConsent('withheld');
  assert.equal(memory.read().registration.status, 'registered', 'Usage needs the registration to send the server-side deletion');
  const before = remote.calls.length;
  assert.equal((await controller.refreshContributions()).reason, 'CONSENT_WITHHELD');
  assert.equal(remote.calls.length, before);
});

test('activation with consent already granted registers as before', async t => {
  const remote = server();
  const memory = memoryStore({...INITIAL_CORE_SNAPSHOT, consent: {state: 'granted', changedAt: '2026-10-15T00:00:00.000Z'}});
  const controller = await SessionController.create(CONFIG, memory.store, {fetcher: remote.fetcher});
  t.after(() => controller.dispose());
  await controller.startRegistration();
  assert.equal(memory.read().registration.status, 'registered');
});

test('register and bind-link routes answer 409 CORE_CONSENT_REQUIRED while consent is withheld', async t => {
  const remote = server();
  const memory = memoryStore(INITIAL_CORE_SNAPSHOT);
  const controller = await SessionController.create(CONFIG, memory.store, {fetcher: remote.fetcher});
  t.after(() => controller.dispose());
  const handle = createRouteHandler(controller);
  for (const path of [ROUTES.register, ROUTES.bindLink]) {
    const response = await handle(postTo(path));
    assert.equal(response.status, 409, path);
    assert.equal((await response.json()).error.code, 'CORE_CONSENT_REQUIRED', path);
  }
  assert.deepEqual(remote.calls, []);
  assert.equal(memory.read().registration.attempts, 0, 'a refused registration is not a failed attempt');
});

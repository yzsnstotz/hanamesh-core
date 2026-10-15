import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {SessionController} from '../lib/controller.js';
import {createRouteHandler, ROUTES} from '../lib/routes.js';
import {INITIAL_CORE_SNAPSHOT} from '../lib/contracts.js';
import {memoryStore} from './fixtures/core-store.mjs';

const carrier = 'http://127.0.0.1:41002';
const CONFIGURED = 'https://api.fixture.invalid';
const GRANTED = {...INITIAL_CORE_SNAPSHOT, consent: {state: 'granted', changedAt: '2026-10-15T00:00:00.000Z'}};
const post = (body, headers = {}) => new Request(`${carrier}${ROUTES.server}`, {method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
  headers: {origin: carrier, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', ...headers}});

/** Records every request origin; registers any device and answers contributions. */
function server() {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    const parsed = new URL(String(url));
    calls.push({origin: parsed.origin, path: parsed.pathname});
    if (parsed.pathname.endsWith('/v1/identity/devices/challenge')) return Response.json({nonce: 'nonce', expiresAt: new Date(Date.now() + 60_000).toISOString()});
    if (parsed.pathname.endsWith('/v1/identity/devices')) {
      const {publicKey} = JSON.parse(init.body);
      const deviceId = createHash('sha256').update(Buffer.from(publicKey, 'base64url')).digest('base64url');
      return Response.json({deviceId, principalId: `principal@${parsed.host}`}, {status: 201});
    }
    if (parsed.pathname.startsWith('/v1/usage/me/contributions')) return Response.json({bound: true, account: {provider: 'github', displayName: 'someone'}, availability: 'available', byHana: [{actions: {install: 1, open: 0, use: 0, uninstall: 0}}]});
    return Response.json({}, {status: 404});
  };
  return {calls, fetcher};
}
const until = async predicate => { for (let i = 0; i < 200 && !predicate(); i++) await new Promise(resolve => setImmediate(resolve)); assert.ok(predicate(), 'condition not reached'); };

test('without an override the configured origin is effective and the state says where it came from', async t => {
  const controller = await SessionController.create({serverOrigin: CONFIGURED, websiteOrigin: null}, memoryStore(INITIAL_CORE_SNAPSHOT).store, {fetcher: server().fetcher});
  t.after(() => controller.dispose());
  const state = controller.state();
  assert.equal(state.serverOrigin, CONFIGURED);
  assert.equal(state.serverOriginSource, 'config');
  assert.equal(state.configuredServerOrigin, CONFIGURED);
  assert.equal(controller.service.getServerOrigin(), CONFIGURED);
  const diagnostics = controller.diagnostics();
  assert.equal(diagnostics.serverOrigin, CONFIGURED);
  assert.equal(diagnostics.serverOriginSource, 'config');
  assert.equal(diagnostics.configuredServerOrigin, CONFIGURED);
});

test('a snapshot written before the override field existed still loads and uses the configured origin', async t => {
  const legacy = structuredClone(INITIAL_CORE_SNAPSHOT);
  delete legacy.serverOriginOverride;
  const controller = await SessionController.create({serverOrigin: CONFIGURED, websiteOrigin: null}, memoryStore(legacy).store);
  t.after(() => controller.dispose());
  assert.equal(controller.state().serverOriginSource, 'config');
  assert.equal(controller.service.getServerOrigin(), CONFIGURED);
});

test('POST server sets a persisted override that takes effect immediately and survives a restart; null clears it', async t => {
  const remote = server();
  const memory = memoryStore(INITIAL_CORE_SNAPSHOT);
  const controller = await SessionController.create({serverOrigin: CONFIGURED, websiteOrigin: null}, memory.store, {fetcher: remote.fetcher});
  t.after(() => controller.dispose());
  const handle = createRouteHandler(controller);
  const response = await handle(post({serverOrigin: 'http://127.0.0.1:49999'}));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.serverOrigin, 'http://127.0.0.1:49999');
  assert.equal(body.serverOriginSource, 'setting');
  assert.equal(body.configuredServerOrigin, CONFIGURED);
  assert.equal(controller.service.getServerOrigin(), 'http://127.0.0.1:49999', 'Usage reads getServerOrigin on every upload');
  assert.equal(memory.read().serverOriginOverride, 'http://127.0.0.1:49999');
  // Requests go to the new server.
  await controller.setConsent('granted');
  await controller.refreshContributions();
  assert.ok(remote.calls.length > 0);
  assert.ok(remote.calls.every(call => call.origin === 'http://127.0.0.1:49999'), JSON.stringify(remote.calls));

  const reopened = await SessionController.create({serverOrigin: CONFIGURED, websiteOrigin: null}, memoryStore(memory.read()).store);
  t.after(() => reopened.dispose());
  assert.equal(reopened.service.getServerOrigin(), 'http://127.0.0.1:49999');
  assert.equal(reopened.state().serverOriginSource, 'setting');

  const cleared = await (await handle(post({serverOrigin: null}))).json();
  assert.equal(cleared.serverOrigin, CONFIGURED);
  assert.equal(cleared.serverOriginSource, 'config');
  assert.equal(memory.read().serverOriginOverride, null);
  assert.equal(controller.service.getServerOrigin(), CONFIGURED);
});

test('changing the server resets registration and the server-owned facts, and re-registers at once when consent is granted', async t => {
  const remote = server();
  const memory = memoryStore(GRANTED);
  const controller = await SessionController.create({serverOrigin: CONFIGURED, websiteOrigin: null}, memory.store, {fetcher: remote.fetcher});
  t.after(() => controller.dispose());
  await controller.startRegistration();
  await until(() => controller.state().contributions.status === 'ready');
  assert.equal(memory.read().registration.principalId, 'principal@api.fixture.invalid');
  assert.equal(controller.state().session.bound, true);
  assert.deepEqual(controller.state().account, {provider: 'github', displayName: 'someone'});

  remote.calls.length = 0;
  const state = await controller.setServerOrigin('https://other.fixture.invalid');
  assert.equal(state.contributions.status, 'unavailable', 'contributions from the old server are dropped');
  assert.equal(state.account, null);
  await until(() => memory.read().registration.status === 'registered');
  assert.equal(memory.read().registration.principalId, 'principal@other.fixture.invalid');
  assert.ok(memory.publications.some(snapshot => snapshot.serverOriginOverride === 'https://other.fixture.invalid' && snapshot.registration.status === 'unregistered' && snapshot.registration.attempts === 0),
    'registration belongs to a server: it is reset to unregistered with the override');
  await until(() => remote.calls.some(call => call.path.startsWith('/v1/usage/me/contributions')));
  assert.ok(remote.calls.every(call => call.origin === 'https://other.fixture.invalid'));
});

test('changing the server with consent withheld resets registration and sends nothing', async t => {
  const remote = server();
  const memory = memoryStore({...INITIAL_CORE_SNAPSHOT, registration: {status: 'registered', principalId: 'old', registeredAt: '2026-10-01T00:00:00.000Z', lastError: null, attempts: 1}});
  const controller = await SessionController.create({serverOrigin: CONFIGURED, websiteOrigin: null}, memory.store, {fetcher: remote.fetcher});
  t.after(() => controller.dispose());
  const state = await controller.setServerOrigin('https://other.fixture.invalid');
  assert.equal(state.registration.status, 'unregistered');
  assert.equal(state.registration.principalId, null);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(remote.calls.length, 0);
});

test('a registration still in flight to the old server cannot land on the new server', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const remote = server();
  const memory = memoryStore(GRANTED);
  const controller = await SessionController.create({serverOrigin: CONFIGURED, websiteOrigin: null}, memory.store, {fetcher: async (url, init) => {
    if (new URL(String(url)).origin === CONFIGURED) await gate;
    return remote.fetcher(url, init);
  }});
  t.after(() => controller.dispose());
  const stale = controller.register().catch(error => error);
  await controller.setServerOrigin('http://localhost:40404');
  release();
  await stale;
  await until(() => memory.read().registration.status === 'registered');
  assert.equal(memory.read().registration.principalId, 'principal@localhost:40404');
  assert.equal(memory.publications.some(snapshot => snapshot.registration.principalId === 'principal@api.fixture.invalid'), false);
});

test('server route uses the config validation rules and the consent route conventions', async t => {
  const controller = await SessionController.create({serverOrigin: CONFIGURED, websiteOrigin: null}, memoryStore(INITIAL_CORE_SNAPSHOT).store);
  t.after(() => controller.dispose());
  const handle = createRouteHandler(controller);
  for (const origin of ['http://evil.fixture.invalid', 'https://api.fixture.invalid/path', 'https://api.fixture.invalid/?q=1', 'https://user:pw@api.fixture.invalid', 'ftp://127.0.0.1', 'not a url']) {
    const response = await handle(post({serverOrigin: origin}));
    assert.equal(response.status, 400, origin);
    assert.equal((await response.json()).error.code, 'CORE_ORIGIN_REJECTED', origin);
  }
  for (const origin of ['https://api2.fixture.invalid', 'http://127.0.0.1:1234', 'http://localhost:8080', 'http://[::1]:3000']) {
    const response = await handle(post({serverOrigin: origin}));
    assert.equal(response.status, 200, origin);
    assert.equal((await response.json()).serverOrigin, origin);
  }
  for (const body of [{serverOrigin: 'https://a.fixture.invalid', extra: 1}, {origin: 'https://a.fixture.invalid'}, {serverOrigin: 42}, [], 'null', '{']) {
    const response = await handle(post(body));
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal((await response.json()).error.code, 'CORE_INPUT_INVALID');
  }
  assert.equal((await handle(post({serverOrigin: null}, {'content-type': 'text/plain'}))).status, 415);
  assert.equal((await handle(post(JSON.stringify({serverOrigin: `https://${'a'.repeat(5000)}.invalid`})))).status, 413);
  assert.equal((await handle(post({serverOrigin: null}, {origin: 'https://evil.fixture.invalid'}))).status, 403);
  assert.equal((await handle(new Request(`${carrier}${ROUTES.server}`))).status, 405);
});

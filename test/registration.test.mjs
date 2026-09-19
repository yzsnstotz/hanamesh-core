import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {SessionController} from '../lib/controller.js';
import {INITIAL_CORE_SNAPSHOT} from '../lib/contracts.js';
import {memoryStore} from './fixtures/core-store.mjs';

function serverStub({mismatch = false, unavailable = false} = {}) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({url: String(url), init});
    if (unavailable) throw new Error('offline');
    if (String(url).endsWith('/v1/identity/devices/challenge')) return Response.json({nonce: 'register-nonce', expiresAt: new Date(Date.now() + 60_000).toISOString()});
    const body = JSON.parse(init.body);
    const deviceId = createHash('sha256').update(Buffer.from(body.publicKey, 'base64url')).digest('base64url');
    return Response.json({deviceId: mismatch ? `${deviceId}x` : deviceId, principalId: 'principal-1'}, {status: 201});
  };
  return {calls, fetcher};
}

test('registration challenge flow succeeds and repeated registration stays idempotent', async () => {
  const remote = serverStub();
  const memory = memoryStore(INITIAL_CORE_SNAPSHOT);
  const controller = await SessionController.create({serverOrigin: 'https://server.example', websiteOrigin: null}, memory.store, {fetcher: remote.fetcher});
  const first = await controller.register();
  const second = await controller.register();
  assert.equal(first.registration, 'registered');
  assert.equal(second.registration, 'registered');
  assert.equal(second.principalId, 'principal-1');
  assert.equal(memory.read().registration.attempts, 2);
  assert.equal(remote.calls.length, 4);
});

test('device id mismatch and upstream failure are persisted as failed observations', async () => {
  for (const [remote, code] of [[serverStub({mismatch: true}), 'CORE_DEVICE_ID_MISMATCH'], [serverStub({unavailable: true}), 'CORE_UPSTREAM_UNAVAILABLE']]) {
    const memory = memoryStore(INITIAL_CORE_SNAPSHOT);
    const controller = await SessionController.create({serverOrigin: 'https://server.example', websiteOrigin: null}, memory.store, {fetcher: remote.fetcher});
    await assert.rejects(controller.register(), error => error?.code === code);
    assert.equal(memory.read().registration.status, 'failed');
    assert.equal(memory.read().registration.lastError, code);
    assert.equal(memory.read().registration.attempts, 1);
  }
});

test('offline configuration never emits a request', async () => {
  const remote = serverStub();
  const controller = await SessionController.create({serverOrigin: null, websiteOrigin: null}, memoryStore(INITIAL_CORE_SNAPSHOT).store, {fetcher: remote.fetcher});
  await assert.rejects(controller.register(), error => error?.code === 'CORE_UPSTREAM_UNAVAILABLE');
  assert.equal(remote.calls.length, 0);
});

test('registration is never published before the remote registration response', async () => {
  let releaseRegistration;
  let registrationRequested;
  const requested = new Promise(resolve => { registrationRequested = resolve; });
  const response = new Promise(resolve => { releaseRegistration = resolve; });
  const memory = memoryStore(INITIAL_CORE_SNAPSHOT);
  let calls = 0;
  const controller = await SessionController.create({serverOrigin: 'https://server.example', websiteOrigin: null}, memory.store, {fetcher: async (_url, init) => {
    if (++calls === 1) return Response.json({nonce: 'register-nonce', expiresAt: new Date(Date.now() + 60_000).toISOString()});
    registrationRequested();
    const publicKey = JSON.parse(init.body).publicKey;
    const deviceId = createHash('sha256').update(Buffer.from(publicKey, 'base64url')).digest('base64url');
    await response;
    return Response.json({deviceId, principalId: 'principal-1'}, {status: 201});
  }});
  const pending = controller.register();
  await requested;
  assert.equal(memory.publications.some(snapshot => snapshot.registration.status === 'registered'), false);
  releaseRegistration();
  await pending;
  assert.equal(memory.read().registration.status, 'registered');
});

test('automatic contributions start only after registration succeeds', async () => {
  const calls = [];
  const controller = await SessionController.create({serverOrigin: 'https://server.example', websiteOrigin: null}, memoryStore(INITIAL_CORE_SNAPSHOT).store, {fetcher: async (url, init) => {
    const path = new URL(url).pathname;
    calls.push(path);
    if (path.endsWith('/challenge')) return Response.json({nonce: 'register-nonce'});
    if (path.endsWith('/devices')) {
      const {publicKey} = JSON.parse(init.body);
      const deviceId = createHash('sha256').update(Buffer.from(publicKey, 'base64url')).digest('base64url');
      return Response.json({deviceId, principalId: 'principal-1'}, {status: 201});
    }
    assert.match(path, /\/v1\/usage\/me\/contributions/);
    return Response.json({byHana: []});
  }});
  await controller.startRegistration();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls.slice(0, 3), [
    '/v1/identity/devices/challenge',
    '/v1/identity/devices',
    '/v1/usage/me/contributions',
  ]);
  await controller.dispose();
});

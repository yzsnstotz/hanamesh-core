import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {hostname} from 'node:os';
import {SessionController} from '../lib/controller.js';
import {deviceLabel, registerDevice} from '../lib/registration.js';
import {ServerTransport} from '../lib/transport.js';
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

// B6: identity 0.2.0-rc.3 stores an owner-facing label so several DSH profiles on one Mac can be told apart on the website.
function labelServer({rejectLabel = false} = {}) {
  const bodies = [];
  const fetcher = async (url, init) => {
    if (String(url).endsWith('/v1/identity/devices/challenge')) return Response.json({nonce: `register-nonce-${bodies.length}`, expiresAt: new Date(Date.now() + 60_000).toISOString()});
    const body = JSON.parse(init.body);
    bodies.push(body);
    if (rejectLabel && 'label' in body) return Response.json({error: {code: 'IDENTITY_INPUT_INVALID', message: 'Invalid identity request.'}}, {status: 400}); // identity rc.2: unknown body key, nonce not consumed
    const deviceId = createHash('sha256').update(Buffer.from(body.publicKey, 'base64url')).digest('base64url');
    return Response.json({deviceId, principalId: 'principal-1', ...(body.label ? {label: body.label} : {})}, {status: 201});
  };
  return {bodies, fetcher};
}

test('device label is hostname / platform-arch / HANAMESH_SHELL-or-dsh, each within identity limits', () => {
  const plain = deviceLabel({});
  assert.deepEqual(plain, {hostname: hostname().slice(0, 64).trim(), os: `${process.platform}-${process.arch}`, shell: 'dsh'});
  assert.ok(Object.isFrozen(plain));
  assert.equal(deviceLabel({HANAMESH_SHELL: 'hanamesh-desktop/0.1.0-rc.3'}).shell, 'hanamesh-desktop/0.1.0-rc.3');
  assert.equal(deviceLabel({HANAMESH_SHELL: ' ' + '\u0007x'.repeat(60)}).shell.length, 48, 'shell is stripped of control characters and clamped to 48');
  assert.equal(deviceLabel({HANAMESH_SHELL: '   '}).shell, 'dsh', 'a blank shell env falls back to dsh');
  assert.ok(plain.hostname.length >= 1 && plain.hostname.length <= 64 && plain.os.length <= 32);
});

test('registration payload carries the label and the server echo is accepted', async () => {
  const remote = labelServer();
  const memory = memoryStore(INITIAL_CORE_SNAPSHOT);
  const controller = await SessionController.create({serverOrigin: 'https://server.example', websiteOrigin: null}, memory.store, {fetcher: remote.fetcher});
  const session = await controller.register();
  assert.equal(session.registration, 'registered');
  assert.equal(remote.bodies.length, 1);
  assert.deepEqual(Object.keys(remote.bodies[0]).sort(), ['label', 'nonce', 'publicKey', 'signature']);
  assert.deepEqual(remote.bodies[0].label, deviceLabel(process.env));
  assert.equal(remote.bodies[0].label.shell, process.env.HANAMESH_SHELL ?? 'dsh');
});

test('identity rc.2 (400 on unknown `label`) makes core re-register once without the label using a fresh challenge', async () => {
  const remote = labelServer({rejectLabel: true});
  const memory = memoryStore(INITIAL_CORE_SNAPSHOT);
  const controller = await SessionController.create({serverOrigin: 'https://server.example', websiteOrigin: null}, memory.store, {fetcher: remote.fetcher});
  const session = await controller.register();
  assert.equal(session.registration, 'registered');
  assert.equal(memory.read().registration.principalId, 'principal-1');
  assert.equal(remote.bodies.length, 2);
  assert.ok('label' in remote.bodies[0]);
  assert.equal('label' in remote.bodies[1], false);
  assert.notEqual(remote.bodies[0].nonce, remote.bodies[1].nonce, 'the retry signs a new challenge');
});

test('a 400 on a label-free registration is not retried and surfaces as upstream unavailable', async () => {
  const remote = labelServer({rejectLabel: true});
  const memory = memoryStore(INITIAL_CORE_SNAPSHOT);
  await SessionController.create({serverOrigin: 'https://server.example', websiteOrigin: null}, memory.store, {fetcher: remote.fetcher});
  const transport = new ServerTransport('https://server.example', 5_000, async (url, init) => {
    if (String(url).endsWith('/challenge')) return remote.fetcher(url, init);
    remote.bodies.push(JSON.parse(init.body));
    return Response.json({error: {code: 'IDENTITY_INPUT_INVALID'}}, {status: 400});
  });
  await assert.rejects(registerDevice(transport, memory.read().device, null), error => error?.code === 'CORE_UPSTREAM_UNAVAILABLE');
  assert.equal(remote.bodies.length, 1);
});

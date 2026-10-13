import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, createPublicKey, verify} from 'node:crypto';
import {SessionController} from '../lib/controller.js';
import {INITIAL_CORE_SNAPSHOT} from '../lib/contracts.js';
import {CORE_REQUIRED_METHODS, CORE_OPTIONAL_METHODS, checkCoreService} from '../lib/contract.js';
import {CORE_CONTRACT_DEFINITION} from '../lib/contract-fixtures.js';
import {memoryStore} from './fixtures/core-store.mjs';

// Public RFC 8032 test seed, never a user identity. SOURCE provider + FIXTURE storage;
// these tests do not claim native Cordis assembly or a real server acceptance.
const seed = '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
const publicKey = '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo';
const deviceId = 'If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk';
const privateKeyPkcs8 = Buffer.from('302e020100300506032b657004220420' + seed, 'hex').toString('base64url');
const device = {deviceId, publicKey, privateKeyPkcs8, createdAt: '2026-01-01T00:00:00.000Z'};
const spki = createPublicKey({key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(publicKey, 'base64url')]), format: 'der', type: 'spki'});
const bytes = text => new TextEncoder().encode(text);
const hash = body => createHash('sha256').update(body ?? new Uint8Array()).digest('hex');
const verifies = (message, signature) => verify(null, message, spki, signature);
async function provider(t, config = {}, options = {}, snapshot = {}) {
  const memory = memoryStore({...INITIAL_CORE_SNAPSHOT, device, ...snapshot});
  const controller = await SessionController.create({serverOrigin: null, websiteOrigin: null, ...config}, memory.store, options);
  t.after(() => controller.dispose());
  return {controller, service: controller.service, memory};
}

test('public C-CORE definition covers every provided call and the subscription, not just HTTP signing', () => {
  assert.deepEqual(Object.keys(CORE_CONTRACT_DEFINITION.methods).sort(), [...CORE_REQUIRED_METHODS, ...CORE_OPTIONAL_METHODS].sort(),
    'Public handoff omits existing sign/getPublicKey/onConsentChange/getHealth calls');
  for (const method of [...CORE_REQUIRED_METHODS, ...CORE_OPTIONAL_METHODS]) {
    const definition = CORE_CONTRACT_DEFINITION.methods[method];
    assert.ok(Object.hasOwn(definition, 'input'), method);
    assert.equal(typeof definition.output, 'string', method);
    assert.ok(Array.isArray(definition.errors), method);
  }
});

test('actual provider exposes string protocol 1 and all callable members; shape probes are diagnostics only', async t => {
  const {service} = await provider(t);
  assert.equal(service.protocolVersion, '1');
  assert.ok(Object.isFrozen(service));
  for (const name of [...CORE_REQUIRED_METHODS, ...CORE_OPTIONAL_METHODS]) assert.equal(typeof service[name], 'function', name);
  assert.deepEqual(checkCoreService(service), {status: 'present', protocolVersion: '1', optional: ['getPublicKey', 'getHealth']});
  assert.deepEqual(checkCoreService(null), {status: 'absent', reason: 'CORE_ABSENT'});
  assert.deepEqual(checkCoreService({...service, protocolVersion: 1}), {status: 'incompatible', reason: 'CORE_PROTOCOL_UNSUPPORTED', provided: null, supported: ['1']});
  for (const name of CORE_REQUIRED_METHODS) assert.deepEqual(checkCoreService({...service, [name]: undefined}), {status: 'incompatible', reason: 'CORE_METHOD_MISSING', missing: [name]});
});

test('raw sign signs exact six-fact JSON UTF-8 bytes, deterministically, with the matching device public key', async t => {
  const {controller, service} = await provider(t);
  assert.equal(service.getPublicKey(), publicKey);
  assert.equal(Buffer.from(publicKey, 'base64url').length, 32);
  assert.equal(createHash('sha256').update(Buffer.from(publicKey, 'base64url')).digest('base64url'), service.getDeviceId());
  const event = {deviceId, hanaRef: 'hana_fixture_雪', action: 'use', occurredAt: '2026-01-01T00:00:00.000Z', eventId: 'event-fixture-1', nonce: 'event-nonce-1'};
  const text = JSON.stringify(event);
  const signature = service.sign(bytes(text));
  assert.ok(signature instanceof Uint8Array);
  assert.equal(signature.length, 64);
  assert.equal(Buffer.from(signature).toString('base64url'), 'HvBngPnB1nkwPUex8f5ZdgPFTfmgpF6xbDGB9nhks-gVNrAn2Y_af4pe9TWIdepcTLUCIANOczsUwGWHaGrHBA');
  assert.equal(verifies(bytes(text), signature), true);
  for (const field of Object.keys(event)) assert.equal(verifies(bytes(JSON.stringify({...event, [field]: event[field] + '-changed'})), signature), false, field);
  for (const changed of [JSON.stringify(event, null, 2), JSON.stringify(Object.fromEntries(Object.entries(event).reverse())), Object.values(event).join('|'), hash(bytes(text))]) assert.equal(verifies(bytes(changed), signature), false);
  const {signature: ignored, ...unchanged} = {...event, signature: 'not-an-input-fact'};
  assert.deepEqual(service.sign(bytes(JSON.stringify(unchanged))), signature);
  assert.equal(service.getConsent(), 'withheld', 'sign is a cryptographic primitive; the caller enforces consent');
  await controller.setConsent('granted');
  assert.deepEqual(service.sign(bytes(text)), signature, 'consent does not rekey or reframe the bytes');
});

test('POST, GET and DELETE signatures cover bare path and exact body, with exactly four headers', async t => {
  const calls = [];
  const {service} = await provider(t, {serverOrigin: 'https://core.fixture.invalid', authNonceSource: 'server'}, {fetcher: async (url, init) => {
    calls.push({url: String(url), method: init.method, body: init.body});
    return Response.json({nonce: 'auth-fixed-fixture-nonce'});
  }});
  t.mock.method(Date, 'now', () => 1767225600000);
  for (const input of [
    {method: 'post', path: '/v1/usage/events?fixture=1#ignored', body: bytes('[{"a":1}]')},
    {method: 'GET', path: '/v1/usage/me/contributions?from=a&to=b', body: null},
    {method: 'DELETE', path: '/v1/usage/me/devices/' + deviceId + '/events', body: new Uint8Array()},
  ]) {
    const pending = service.signRequest(input);
    assert.ok(pending instanceof Promise);
    const headers = await pending;
    assert.deepEqual(Object.keys(headers).sort(), ['x-hm-device-id', 'x-hm-timestamp', 'x-hm-nonce', 'x-hm-signature'].sort());
    assert.equal(headers['x-hm-device-id'], deviceId);
    assert.equal(headers['x-hm-timestamp'], '1767225600000');
    assert.equal(headers['x-hm-nonce'], 'auth-fixed-fixture-nonce');
    const signature = Buffer.from(headers['x-hm-signature'], 'base64url');
    assert.equal(signature.length, 64);
    assert.doesNotMatch(headers['x-hm-signature'], /[=+/]/);
    const pathname = input.path.replace(/[?#].*$/u, '');
    const prefix = `${input.method.toUpperCase()}|${pathname}|1767225600000|auth-fixed-fixture-nonce|`;
    assert.equal(verifies(bytes(prefix + hash(input.body)), signature), true);
    for (const altered of [prefix + hash(bytes('different')), prefix.replace(pathname, '/tampered') + hash(input.body), prefix.replace('1767225600000', '1767225600001') + hash(input.body), prefix.replace('auth-fixed-fixture-nonce', 'other-nonce') + hash(input.body), 'PUT' + prefix.slice(prefix.indexOf('|')) + hash(input.body)]) assert.equal(verifies(bytes(altered), signature), false);
    if (input.path.includes('?')) assert.equal(verifies(bytes(prefix.replace(pathname, input.path) + hash(input.body)), signature), false);
  }
  assert.equal(calls.length, 3);
  for (const call of calls) assert.deepEqual(call, {url: 'https://core.fixture.invalid/v1/identity/devices/challenge', method: 'POST', body: '{"purpose":"auth"}'});
  const a = await service.signRequest({method: 'POST', path: '/x', body: bytes('{"a":1}')});
  const b = await service.signRequest({method: 'POST', path: '/x', body: bytes('{ "a": 1 }')});
  assert.notEqual(a['x-hm-signature'], b['x-hm-signature'], 'no JSON normalization');
  const empty = await service.signRequest({method: 'GET', path: '/x', body: new Uint8Array()});
  const nil = await service.signRequest({method: 'GET', path: '/x?ignored=1', body: null});
  assert.deepEqual(empty, nil, 'query excluded; null and empty bytes hash identically');
});

test('SessionSnapshot includes unknown observations without inventing a principal or null-reason error', async t => {
  const {service} = await provider(t);
  assert.deepEqual(service.getSession(), {protocolVersion: '1', deviceId, registration: 'unregistered', principalId: null, bound: null, serverReachable: null, checkedAt: null, reason: null});
  assert.ok(Object.isFrozen(service.getSession()));
  assert.equal(service.getServerOrigin(), null);
  assert.deepEqual(service.getHealth(), {revision: 0, mode: 'repair', components: [], fault: 'CHECK_NOT_RUN'});
  const {service: failed} = await provider(t, {}, {}, {registration: {status: 'failed', principalId: null, registeredAt: null, attempts: 1, lastError: 'IDENTITY_RATE_LIMITED'}, serverObservation: {reachable: false, checkedAt: '2026-01-01T00:00:00.000Z'}});
  assert.deepEqual(failed.getSession(), {protocolVersion: '1', deviceId, registration: 'failed', principalId: null, bound: null, serverReachable: false, checkedAt: '2026-01-01T00:00:00.000Z', reason: 'IDENTITY_RATE_LIMITED'});
});

test('consent callback has two positional values after persistence, no replay, repeated writes and unsubscribe', async t => {
  const {controller, service, memory} = await provider(t);
  const events = [];
  const broken = service.onConsentChange(() => {throw new Error('listener fixture');});
  const unsubscribe = service.onConsentChange((...args) => {
    assert.deepEqual(memory.read().consent, {state: args[0], changedAt: args[1]});
    events.push(args);
  });
  assert.equal(events.length, 0);
  for (const state of ['granted', 'granted', 'withheld']) {
    const result = await controller.setConsent(state);
    assert.deepEqual(events.at(-1), [state, result.changedAt]);
    assert.equal(new Date(result.changedAt).toISOString(), result.changedAt);
  }
  assert.equal(events.length, 3);
  assert.equal(unsubscribe(), undefined);
  unsubscribe(); broken();
  await controller.setConsent('granted');
  assert.equal(events.length, 3);
  const before = memory.read();
  await assert.rejects(controller.setConsent('none'), {code: 'CORE_INPUT_INVALID', status: 400});
  assert.deepEqual(memory.read(), before);
});

test('a failed consent publication emits no change event and retains the previous consent', async t => {
  const memory = memoryStore({...INITIAL_CORE_SNAPSHOT, device});
  const controller = await SessionController.create({serverOrigin: null, websiteOrigin: null}, {...memory.store, publish: async () => {throw new Error('FIXTURE_STORAGE_FAILURE');}});
  t.after(() => controller.dispose());
  const events = [];
  controller.service.onConsentChange((...args) => events.push(args));
  await assert.rejects(controller.setConsent('granted'), /FIXTURE_STORAGE_FAILURE/);
  assert.deepEqual(events, []);
  assert.equal(controller.service.getConsent(), 'withheld');
});

test('actual provider distinguishes input, identity readiness, corrupt keys and disposed lifecycle', async t => {
  const {controller, service} = await provider(t);
  for (const input of [null, {method: 'GET', path: '/x'}, {method: 'GET', path: '/x', body: {}}, {method: 'GET', path: 'https://core.fixture.invalid/x', body: null}, {method: 'GET', path: '/x|y', body: null}]) await assert.rejects(service.signRequest(input), {code: 'CORE_INPUT_INVALID', status: 400});
  const {service: corrupt} = await provider(t, {}, {}, {device: {...device, privateKeyPkcs8: 'broken'}});
  assert.throws(() => corrupt.sign(bytes('fixture')), {code: 'CORE_DEVICE_CORRUPT', status: 500});
  await assert.rejects(corrupt.signRequest({method: 'GET', path: '/x', body: null}), {code: 'CORE_DEVICE_CORRUPT', status: 500});
  const {service: unavailable} = await provider(t, {}, {sharedDevice: {location: '/FIXTURE/identity/device.json', read: async () => {throw new Error('FIXTURE_SHARED_UNREADABLE');}}});
  for (const name of ['getDeviceId', 'getPublicKey', 'getSession']) assert.throws(() => unavailable[name](), {code: 'CORE_NOT_READY', status: 503});
  assert.throws(() => unavailable.sign(bytes('fixture')), {code: 'CORE_NOT_READY', status: 503});
  await assert.rejects(unavailable.signRequest({method: 'GET', path: '/x', body: null}), {code: 'CORE_NOT_READY', status: 503});
  assert.equal(unavailable.getServerOrigin(), null);
  await controller.dispose();
  for (const name of ['getDeviceId', 'getPublicKey', 'getSession']) assert.throws(() => service[name](), {code: 'CORE_DISPOSED', status: 503});
  assert.throws(() => service.sign(bytes('fixture')), {code: 'CORE_DISPOSED', status: 503});
  await assert.rejects(service.signRequest({method: 'GET', path: '/x', body: null}), {code: 'CORE_DISPOSED', status: 503});
  assert.equal(service.getServerOrigin(), null, 'unconditional getter; do not invent an availability exception');
  assert.equal(service.getConsent(), 'withheld');
});

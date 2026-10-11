import test from 'node:test';
import assert from 'node:assert/strict';
import * as fixtures from '../lib/contract-fixtures.js';
import {loadCoreSchema, validateCoreValue} from '../lib/contract-suite.js';

test('C-CORE handoff defines every method, data type and declared error code', async () => {
  const definition = fixtures.CORE_CONTRACT_DEFINITION;
  assert.ok(definition, 'C-CORE machine-readable definition is missing');
  assert.equal(definition.id, 'C-CORE');
  assert.equal(definition.service, 'hanameshCore');
  assert.equal(definition.protocolVersion, '1');
  assert.deepEqual(definition.methods.getConsent.errors, ['CORE_ABSENT', 'CORE_PROTOCOL_UNSUPPORTED', 'CORE_METHOD_MISSING']);
  assert.deepEqual(definition.methods.signRequest.errors, ['CORE_NOT_READY', 'CORE_DEVICE_CORRUPT']);
  for (const method of ['getSession', 'getServerOrigin', 'getDeviceId']) {
    assert.deepEqual(definition.methods[method].errors, ['CORE_NOT_READY']);
  }
  const schema = await loadCoreSchema();
  for (const [name, shape] of Object.entries(definition.types)) assert.deepEqual(shape, schema.$defs[name], name);
  assert.deepEqual(Object.keys(definition.types).sort(), ['ConsentState', 'DeviceAuthHeaders', 'DeviceId', 'PublicKey', 'RequestSignatureInput', 'ServerOrigin', 'SessionSnapshot']);
});

test('C-CORE examples validate and their Ed25519 headers verify over the documented request', async () => {
  assert.equal(typeof fixtures.createCoreContractExamples, 'function', 'C-CORE example generator is missing');
  await loadCoreSchema();
  const examples = await fixtures.createCoreContractExamples();
  assert.equal(examples.label, fixtures.CORE_FIXTURE_LABEL);
  for (const [name, value] of Object.entries({ConsentState: examples.consent, DeviceId: examples.deviceId, PublicKey: examples.publicKey, ServerOrigin: examples.serverOrigin, SessionSnapshot: examples.session, RequestSignatureInput: examples.request, DeviceAuthHeaders: examples.headers})) {
    assert.deepEqual(validateCoreValue(name, value), [], name);
  }
  assert.equal(examples.headers['x-hm-device-id'], examples.deviceId);
  assert.equal(examples.session.deviceId, examples.deviceId);
  assert.ok(examples.request.body instanceof Uint8Array);
  assert.equal(fixtures.verifyCoreSignature(examples.publicKey, fixtures.coreCanonicalRequest(examples.request, examples.headers['x-hm-timestamp'], examples.headers['x-hm-nonce']), Buffer.from(examples.headers['x-hm-signature'], 'base64url')), true);
  assert.equal(fixtures.verifyCoreSignature(examples.publicKey, fixtures.coreCanonicalRequest({...examples.request, path: '/tampered'}, examples.headers['x-hm-timestamp'], examples.headers['x-hm-nonce']), Buffer.from(examples.headers['x-hm-signature'], 'base64url')), false);
  assert.deepEqual(Object.keys(examples.errors).sort(), ['CORE_ABSENT', 'CORE_DEVICE_CORRUPT', 'CORE_METHOD_MISSING', 'CORE_NOT_READY', 'CORE_PROTOCOL_UNSUPPORTED']);
  assert.deepEqual(examples.errors.CORE_NOT_READY, {code: 'CORE_NOT_READY', status: 503});
  assert.deepEqual(examples.errors.CORE_DEVICE_CORRUPT, {code: 'CORE_DEVICE_CORRUPT', status: 500});
  const serialized = JSON.stringify(examples);
  assert.doesNotMatch(serialized, /privateKey|Pkcs8|cookie|token/);
});

test('getServerOrigin handoff distinguishes declared availability errors from the unconditional product getter', async () => {
  const {SessionController} = await import('../lib/controller.js');
  const {INITIAL_CORE_SNAPSHOT} = await import('../lib/contracts.js');
  const {memoryStore} = await import('./fixtures/core-store.mjs');
  const memory = memoryStore(INITIAL_CORE_SNAPSHOT);
  const controller = await SessionController.create({serverOrigin: 'https://core.fixture.invalid', websiteOrigin: null}, memory.store);
  try {
    assert.equal(controller.service.getServerOrigin(), 'https://core.fixture.invalid');
    await controller.dispose();
    assert.equal(controller.service.getServerOrigin(), 'https://core.fixture.invalid');
    assert.deepEqual(fixtures.CORE_CONTRACT_DEFINITION.methods.getServerOrigin.implementationErrors, []);
  } finally { await controller.dispose(); }
});

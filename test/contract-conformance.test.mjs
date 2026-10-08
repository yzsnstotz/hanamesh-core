import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  CORE_SERVICE_NAME, CORE_PROTOCOL_VERSION, CORE_SUPPORTED_PROTOCOL_VERSIONS, CORE_REQUIRED_METHODS, CORE_OPTIONAL_METHODS, checkCoreService,
} from '../lib/contract.js';
import {CORE_FIXTURE_LABEL, createCoreProviderFixture, createCoreConsumerFixture, coreHandshakeCases} from '../lib/contract-fixtures.js';
import {runCoreProviderSuite, runCoreConsumerSuite, loadCoreSchema, validateCoreValue} from '../lib/contract-suite.js';
import {SessionController} from '../lib/controller.js';
import {INITIAL_CORE_SNAPSHOT} from '../lib/contracts.js';

const realCore = async () => {
  let value = structuredClone(INITIAL_CORE_SNAPSHOT);
  const controller = await SessionController.create({serverOrigin: null, websiteOrigin: null}, {read: () => value, publish: async next => { value = next; }, close: async () => undefined});
  return {controller, provider: {label: 'hanamesh-core SessionController.service', service: controller.service, setConsent: state => controller.setConsent(state)}};
};
const failed = result => result.results.filter(row => !row.ok);

test('v1 handshake constants match the published schema and the existing seven required methods', async () => {
  assert.equal(CORE_SERVICE_NAME, 'hanameshCore');
  assert.equal(CORE_PROTOCOL_VERSION, '1');
  assert.deepEqual([...CORE_SUPPORTED_PROTOCOL_VERSIONS], ['1']);
  assert.deepEqual([...CORE_REQUIRED_METHODS], ['getDeviceId', 'sign', 'signRequest', 'getConsent', 'onConsentChange', 'getSession', 'getServerOrigin']);
  assert.deepEqual([...CORE_OPTIONAL_METHODS], ['getPublicKey', 'getHealth']);
  const schema = await loadCoreSchema();
  const onDisk = JSON.parse(await readFile('contract/hanamesh-core.v1.schema.json', 'utf8'));
  assert.deepEqual(schema, onDisk);
  assert.equal(schema['x-hanamesh'].service, CORE_SERVICE_NAME);
  assert.equal(schema['x-hanamesh'].protocolVersion, CORE_PROTOCOL_VERSION);
  assert.deepEqual(schema['x-hanamesh'].requiredMethods, [...CORE_REQUIRED_METHODS]);
  assert.deepEqual(schema['x-hanamesh'].optionalMethods, [...CORE_OPTIONAL_METHODS]);
});

test('handshake gives one deterministic result for match, absent, unsupported version and each missing method', () => {
  const {service} = createCoreProviderFixture();
  assert.deepEqual(checkCoreService(service), {status: 'present', protocolVersion: '1', optional: ['getPublicKey', 'getHealth']});
  assert.deepEqual(checkCoreService(undefined), {status: 'absent', reason: 'CORE_ABSENT'});
  assert.deepEqual(checkCoreService(null), {status: 'absent', reason: 'CORE_ABSENT'});
  assert.deepEqual(checkCoreService('core'), {status: 'incompatible', reason: 'CORE_NOT_OBJECT'});
  assert.deepEqual(checkCoreService({...service, protocolVersion: '2'}), {status: 'incompatible', reason: 'CORE_PROTOCOL_UNSUPPORTED', provided: '2', supported: ['1']});
  assert.deepEqual(checkCoreService(service, ['2']), {status: 'incompatible', reason: 'CORE_PROTOCOL_UNSUPPORTED', provided: '1', supported: ['2']});
  const {signRequest: _omit, ...withoutSignRequest} = service;
  assert.deepEqual(checkCoreService(withoutSignRequest), {status: 'incompatible', reason: 'CORE_METHOD_MISSING', missing: ['signRequest']});
  const {getPublicKey: _a, getHealth: _b, ...requiredOnly} = service;
  assert.deepEqual(checkCoreService(requiredOnly), {status: 'present', protocolVersion: '1', optional: []});
  const cases = coreHandshakeCases(() => createCoreProviderFixture().service);
  assert.equal(cases.length, 13);
  for (const row of cases) assert.deepEqual(checkCoreService(row.value), row.expected, row.id);
});

test('real Core provider passes the v1 provider suite, including signed request verification and no-replay consent', async () => {
  const {controller, provider} = await realCore();
  try {
    const result = await runCoreProviderSuite(provider);
    assert.deepEqual(failed(result), []);
    assert.equal(result.ok, true);
    assert.equal(result.side, 'provider');
    assert.ok(result.results.some(row => row.id === 'signRequest.canonical'));
    assert.equal(controller.service.getConsent(), 'withheld', 'suite restores the provider consent it changed');
  } finally { await controller.dispose(); }
});

test('provider fixture passes the same suite and is labelled as a fixture', async () => {
  const fixture = createCoreProviderFixture();
  assert.equal(fixture.label, CORE_FIXTURE_LABEL);
  const result = await runCoreProviderSuite(fixture);
  assert.deepEqual(failed(result), []);
});

test('provider suite rejects a provider that drifts from v1 semantics', async () => {
  const fixture = createCoreProviderFixture();
  const drifted = {...fixture, service: {...fixture.service, async signRequest(input) {
    const headers = await fixture.service.signRequest(input);
    return {...headers, 'x-hm-timestamp': String(Math.floor(Number(headers['x-hm-timestamp']) / 1000))};
  }, exportPrivateKey: () => 'nope'}};
  const ids = failed(await runCoreProviderSuite(drifted)).map(row => row.id);
  assert.ok(ids.includes('signRequest.canonical'), ids.join());
  assert.ok(ids.includes('surface.closed'), ids.join());
});

test('reference consumer fixture passes the consumer suite and exercises the real provider', async () => {
  const consumer = createCoreConsumerFixture();
  assert.equal(consumer.label, CORE_FIXTURE_LABEL);
  const result = await runCoreConsumerSuite(consumer);
  assert.deepEqual(failed(result), []);
  assert.equal(result.side, 'consumer');
  const {controller, provider} = await realCore();
  try {
    const observation = await consumer.exercise(provider.service);
    assert.equal(observation.handshake.status, 'present');
    assert.equal(observation.signatureVerified, true);
    assert.equal(observation.requestVerified, true);
  } finally { await controller.dispose(); }
});

test('consumer suite fails a consumer that silently accepts an unsupported version or a missing method', async () => {
  const lenient = {label: 'lenient', accept: value => (value ? {status: 'present'} : {status: 'absent'})};
  const ids = failed(await runCoreConsumerSuite(lenient)).map(row => row.id);
  assert.ok(ids.includes('handshake.protocol-2'), ids.join());
  assert.ok(ids.includes('handshake.missing-signRequest'), ids.join());
});

test('schema validator rejects session snapshots outside v1', async () => {
  const fixture = createCoreProviderFixture();
  const session = fixture.service.getSession();
  assert.deepEqual(validateCoreValue('SessionSnapshot', session), []);
  assert.notDeepEqual(validateCoreValue('SessionSnapshot', {...session, registration: 'pending'}), []);
  assert.notDeepEqual(validateCoreValue('SessionSnapshot', {...session, extra: 1}), []);
  const {reason: _r, ...missing} = session;
  assert.notDeepEqual(validateCoreValue('SessionSnapshot', missing), []);
});

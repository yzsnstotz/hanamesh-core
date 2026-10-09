import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, access} from 'node:fs/promises';
import {createIdentityServicesFixture} from '@hanamesh/server-identity/contract/fixtures';
import {loadIdentitySchema, validateIdentityValue} from '@hanamesh/server-identity/contract/suite';
import {SessionController} from '../lib/controller.js';
import {INITIAL_CORE_SNAPSHOT} from '../lib/contracts.js';
import {checkCoreService} from '../lib/contract.js';
import {createCoreProviderFixture, createCoreConsumerFixture} from '../lib/contract-fixtures.js';
import {memoryStore} from './fixtures/core-store.mjs';

test('Identity contract comes from a published source range, with no packaged protocol copy', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(pkg.devDependencies['@hanamesh/server-identity'], 'git+https://github.com/yzsnstotz/hanamesh-server-identity.git#semver:^0.2.0-rc.11');
  assert.ok(!pkg.files.includes('vendor/srv-identity'));
  await assert.rejects(access('vendor/srv-identity/contracts.d.ts'));
  assert.ok(!('srvIdentity' in JSON.parse(await readFile('deps/LOCKS.json', 'utf8'))));
});

test('actual Core registration and signed request consume the installed Identity fixture and schema', async () => {
  await loadIdentitySchema();
  const fixture = createIdentityServicesFixture();
  const memory = memoryStore(INITIAL_CORE_SNAPSHOT);
  const calls = [];
  const schemaOk = (name, value) => assert.deepEqual(validateIdentityValue(name, value), [], name);
  const fetcher = async (url, init) => {
    const path = new URL(url).pathname;
    calls.push(path);
    if (path === '/v1/identity/devices/challenge') {
      const result = await fixture.services.deviceRegistration.createChallenge(JSON.parse(init.body).purpose);
      const response = {nonce: result.nonce, expiresAt: result.expiresAt};
      schemaOk('DeviceChallengeDTO', response);
      return Response.json({...response, optionalFutureField: 'same-wire-major'});
    }
    if (path === '/v1/identity/devices') {
      const input = JSON.parse(init.body);
      schemaOk('DeviceRegisterInput', input);
      const result = await fixture.services.deviceRegistration.registerDevice(input);
      const response = {deviceId: result.deviceId, principalId: result.principalId, ...(result.label ? {label: result.label} : {})};
      schemaOk('DeviceRegisterResponse', response);
      return Response.json({...response, optionalFutureField: true}, {status: result.created ? 201 : 200});
    }
    throw new Error(`unexpected Core request ${path}`);
  };
  const controller = await SessionController.create({serverOrigin: 'https://identity.fixture.invalid', websiteOrigin: null}, memory.store, {fetcher});
  try {
    const first = await controller.register();
    const second = await controller.register();
    assert.equal(first.registration, 'registered');
    assert.equal(second.principalId, first.principalId);
    assert.equal(calls.length, 4);
    const headers = await controller.service.signRequest({method: 'GET', path: '/v1/identity/me?fixture=1', body: null});
    schemaOk('DeviceAuthHeaders', headers);
    const request = {method: 'GET', path: '/v1/identity/me', headers, bodyHash: createHash('sha256').update('').digest('hex')};
    const actor = await fixture.services.deviceAuth.authenticateDevice(request);
    assert.equal(actor.principal.principalId, first.principalId);
    await assert.rejects(fixture.services.deviceAuth.authenticateDevice(request), error => error.code === 'IDENTITY_DEVICE_REPLAY');
    await assert.rejects(fixture.services.deviceAuth.authenticateDevice({...request, path: '/different'}), error => ['IDENTITY_DEVICE_REPLAY', 'IDENTITY_DEVICE_SIGNATURE_INVALID'].includes(error.code));
  } finally { await controller.dispose(); }
});

test('Core wire major remains string 1 across package minors and rejects major 2 or SemVer coercion', async () => {
  const consumer = createCoreConsumerFixture();
  const service = createCoreProviderFixture().service;
  for (const packageVersion of ['0.2.0-rc.55', '0.2.0-rc.56', '0.3.0']) {
    const added = {...service, packageVersion, optionalFutureMethod: () => 'fixture'};
    assert.equal(checkCoreService(added).status, 'present');
    assert.equal(consumer.accept(added).status, 'present');
  }
  for (const protocolVersion of ['2', 1, '1.1.0', undefined]) {
    const result = checkCoreService({...service, protocolVersion});
    assert.equal(result.reason, 'CORE_PROTOCOL_UNSUPPORTED');
  }
  assert.equal(checkCoreService({...service, signRequest: undefined}).reason, 'CORE_METHOD_MISSING');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicKey, verify} from 'node:crypto';
import {SessionController} from '../lib/controller.js';
import {INITIAL_CORE_SNAPSHOT} from '../lib/contracts.js';
import {memoryStore} from './fixtures/core-store.mjs';

const CONFIG = {serverOrigin: null, websiteOrigin: null};
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

test('first initialization publishes one complete device snapshot and restart preserves id', async () => {
  const memory = memoryStore(INITIAL_CORE_SNAPSHOT);
  const first = await SessionController.create(CONFIG, memory.store);
  assert.equal(memory.publications.length, 1);
  const stored = memory.read();
  assert.ok(stored.device?.privateKeyPkcs8);
  assert.equal(first.service.getDeviceId(), stored.device.deviceId);
  const secondMemory = memoryStore(stored);
  const second = await SessionController.create(CONFIG, secondMemory.store);
  assert.equal(secondMemory.publications.length, 0);
  assert.equal(second.service.getDeviceId(), first.service.getDeviceId());
});

test('sign returns a verifiable Ed25519 signature and private key never reaches public projections', async () => {
  const memory = memoryStore(INITIAL_CORE_SNAPSHOT);
  const controller = await SessionController.create(CONFIG, memory.store);
  const payload = new TextEncoder().encode('hana');
  const signature = controller.service.sign(payload);
  const raw = Buffer.from(controller.service.getPublicKey(), 'base64url');
  const publicKey = createPublicKey({key: Buffer.concat([SPKI_PREFIX, raw]), format: 'der', type: 'spki'});
  assert.equal(signature.byteLength, 64);
  assert.equal(verify(null, payload, publicKey, signature), true);
  for (const projection of [controller.state(), controller.diagnostics()]) {
    const json = JSON.stringify(projection);
    assert.doesNotMatch(json, /privateKeyPkcs8|PRIVATE KEY|MC4CAQ/i);
  }
});

test('tampered public key makes every signature path fail closed', async () => {
  const seeded = memoryStore(INITIAL_CORE_SNAPSHOT);
  await SessionController.create(CONFIG, seeded.store);
  const corrupted = seeded.read();
  corrupted.device.publicKey = Buffer.alloc(32, 7).toString('base64url');
  const controller = await SessionController.create(CONFIG, memoryStore(corrupted).store);
  assert.throws(() => controller.service.sign(new Uint8Array([1])), error => error?.code === 'CORE_DEVICE_CORRUPT');
  await assert.rejects(controller.service.signRequest({method: 'POST', path: '/v1/events', body: null}), error => error?.code === 'CORE_DEVICE_CORRUPT');
});

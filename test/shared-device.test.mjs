import test from 'node:test';
import assert from 'node:assert/strict';
import {chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SessionController} from '../lib/controller.js';
import {createRouteHandler, ROUTES} from '../lib/routes.js';
import {INITIAL_CORE_SNAPSHOT} from '../lib/contracts.js';
import {createDevice} from '../lib/device.js';
import {fileSharedDeviceStore, sharedIdentityRoot} from '../lib/shared-device.js';
import {memoryStore} from './fixtures/core-store.mjs';

const CONFIG = {serverOrigin: null, websiteOrigin: null};
const scratch = async t => {
  const dir = await mkdtemp(join(tmpdir(), 'hm-shared-device-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  return dir;
};
const client = (snapshot, shared) => {
  const memory = memoryStore(snapshot);
  return {memory, open: () => SessionController.create(CONFIG, memory.store, {sharedDevice: shared})};
};

test('two clients on one machine resolve to the same device identity through the shared store', async t => {
  const root = await scratch(t);
  const dsh = client(INITIAL_CORE_SNAPSHOT, fileSharedDeviceStore(root));
  const hanamesh = client(INITIAL_CORE_SNAPSHOT, fileSharedDeviceStore(root));
  const [a, b] = await Promise.all([dsh.open(), hanamesh.open()]);
  assert.equal(a.service.getDeviceId(), b.service.getDeviceId());
  assert.equal(dsh.memory.read().device.deviceId, hanamesh.memory.read().device.deviceId, 'each client mirrors the shared device');
  const file = join(root, 'identity', 'device.json');
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.equal((await stat(join(root, 'identity'))).mode & 0o777, 0o700);
  assert.deepEqual((await readdir(join(root, 'identity'))).sort(), ['device.json'], 'losing writer leaves no temp file');
  for (const controller of [a, b]) {
    const identity = controller.state().identity;
    assert.equal(identity.status, 'shared');
    assert.equal(identity.location, file);
    assert.deepEqual(identity.replacedDeviceIds, []);
  }
  assert.doesNotMatch(JSON.stringify(a.state()), /privateKeyPkcs8|MC4CAQ/);
});

test('migration: an existing per-client identity becomes the shared identity instead of a new one', async t => {
  const root = await scratch(t);
  const legacy = {...INITIAL_CORE_SNAPSHOT, revision: 4, device: createDevice()};
  const upgraded = client(legacy, fileSharedDeviceStore(root));
  const controller = await upgraded.open();
  assert.equal(controller.service.getDeviceId(), legacy.device.deviceId);
  assert.equal(controller.state().identity.source, 'migrated');
  const stored = JSON.parse(await readFile(join(root, 'identity', 'device.json'), 'utf8'));
  assert.equal(stored.deviceId, legacy.device.deviceId);
  const fresh = await client(INITIAL_CORE_SNAPSHOT, fileSharedDeviceStore(root)).open();
  assert.equal(fresh.service.getDeviceId(), legacy.device.deviceId);
  assert.equal(fresh.state().identity.source, 'adopted');
});

test('conflict: a second client with its own older identity adopts the shared one and keeps the replaced identity', async t => {
  const root = await scratch(t);
  const first = {...INITIAL_CORE_SNAPSHOT, device: createDevice()};
  await client(first, fileSharedDeviceStore(root)).open();
  const otherDevice = createDevice();
  const second = {...INITIAL_CORE_SNAPSHOT, revision: 9, device: otherDevice,
    registration: {status: 'registered', principalId: 'principal-old', registeredAt: '2026-10-01T00:00:00.000Z', lastError: null, attempts: 1}};
  const loser = client(second, fileSharedDeviceStore(root));
  const controller = await loser.open();
  assert.equal(controller.service.getDeviceId(), first.device.deviceId);
  const stored = loser.memory.read();
  assert.equal(stored.device.deviceId, first.device.deviceId);
  assert.equal(stored.replacedDevices[0].deviceId, otherDevice.deviceId, 'replaced key material is preserved, not deleted');
  assert.equal(stored.replacedDevices[0].privateKeyPkcs8, otherDevice.privateKeyPkcs8);
  assert.equal(stored.registration.status, 'unregistered', 'registration of the replaced device is not carried over');
  assert.equal(stored.registration.principalId, null);
  const identity = controller.state().identity;
  assert.equal(identity.status, 'shared');
  assert.equal(identity.source, 'conflict');
  assert.deepEqual(identity.replacedDeviceIds, [otherDevice.deviceId]);
  assert.ok(Date.parse(stored.replacedDevices[0].replacedAt));
  const again = await client(stored, fileSharedDeviceStore(root)).open();
  assert.deepEqual(again.state().identity.replacedDeviceIds, [otherDevice.deviceId], 'conflict note survives restart');
});

for (const [name, prepare, reason] of [
  ['corrupt shared file', async file => writeFile(file, '{not json'), 'CORE_DEVICE_CORRUPT'],
  ['tampered shared key', async file => {
    const device = createDevice();
    await writeFile(file, JSON.stringify({schemaVersion: 1, ...device, deviceId: createDevice().deviceId}));
  }, 'CORE_DEVICE_CORRUPT'],
  ['unreadable shared file', async file => { await writeFile(file, '{}'); await chmod(file, 0o000); }, 'CORE_DEVICE_STORE_UNAVAILABLE'],
]) {
  test(`${name}: fails visibly and never silently creates a new identity`, async t => {
    if (reason === 'CORE_DEVICE_STORE_UNAVAILABLE' && process.getuid?.() === 0) { t.skip('root bypasses file modes'); return; }
    const root = await scratch(t);
    await mkdir(join(root, 'identity'), {recursive: true, mode: 0o700});
    const file = join(root, 'identity', 'device.json');
    await prepare(file);
    const before = await readFile(file).catch(() => null);
    const legacy = {...INITIAL_CORE_SNAPSHOT, device: createDevice()};
    const c = client(legacy, fileSharedDeviceStore(root));
    const controller = await c.open();
    assert.deepEqual(c.memory.publications, [], 'nothing is written to the client store');
    assert.equal(c.memory.read().device.deviceId, legacy.device.deviceId, 'the local identity is not replaced');
    if (before) { await chmod(file, 0o600); assert.deepEqual(await readFile(file), before, 'the shared file is not overwritten'); }
    assert.throws(() => controller.service.getDeviceId(), error => error?.code === 'CORE_NOT_READY');
    await assert.rejects(controller.service.signRequest({method: 'GET', path: '/v1/x', body: null}), error => error?.code === 'CORE_NOT_READY');
    const state = controller.state();
    assert.equal(state.deviceId, null);
    assert.equal(state.session, null);
    assert.equal(state.identity.status, 'failed');
    assert.equal(state.identity.reason, reason);
    assert.equal(state.identity.location, file);
    assert.equal(state.identity.detail, reason === 'CORE_DEVICE_STORE_UNAVAILABLE' ? 'EACCES' : null);
    const routed = await createRouteHandler(controller)(new Request(`http://127.0.0.1${ROUTES.state}`));
    assert.equal(routed.status, 200, 'the settings section can still read why identity is unavailable');
    assert.equal((await routed.json()).identity.reason, reason);
  });
}

test('failed shared identity is re-resolved by refresh once the store is repaired', async t => {
  const root = await scratch(t);
  await mkdir(join(root, 'identity'), {recursive: true, mode: 0o700});
  const file = join(root, 'identity', 'device.json');
  await writeFile(file, 'garbage');
  const c = client(INITIAL_CORE_SNAPSHOT, fileSharedDeviceStore(root));
  const controller = await c.open();
  assert.equal(controller.state().identity.status, 'failed');
  await rm(file);
  const state = await controller.refresh();
  assert.equal(state.identity.status, 'shared');
  assert.equal(state.identity.source, 'created');
  assert.equal(controller.service.getDeviceId(), JSON.parse(await readFile(file, 'utf8')).deviceId);
});

test('shared identity root: explicit config, then HANAMESH_SHARED_HOME, then ~/.hanamesh-shared; relative paths rejected', () => {
  assert.equal(sharedIdentityRoot({sharedIdentityDir: '/x/y'}, {HANAMESH_SHARED_HOME: '/env'}, '/home/u'), '/x/y');
  assert.equal(sharedIdentityRoot({}, {HANAMESH_SHARED_HOME: '/env'}, '/home/u'), '/env');
  assert.equal(sharedIdentityRoot({}, {}, '/home/u'), join('/home/u', '.hanamesh-shared'));
  assert.throws(() => sharedIdentityRoot({sharedIdentityDir: 'rel'}, {}, '/home/u'), error => error?.code === 'CORE_INPUT_INVALID');
  assert.throws(() => sharedIdentityRoot({}, {HANAMESH_SHARED_HOME: 'rel'}, '/home/u'), error => error?.code === 'CORE_INPUT_INVALID');
});

test('separate client processes racing for the first claim all end with one identity and one file', async t => {
  const {spawn} = await import('node:child_process');
  const root = await scratch(t);
  const run = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['test/fixtures/shared-claim-child.mjs', root], {stdio: ['ignore', 'pipe', 'inherit']});
    let out = '';
    child.stdout.on('data', chunk => { out += chunk; });
    child.on('error', reject);
    child.on('exit', status => status === 0 ? resolve(out) : reject(new Error(`claim child exited ${status}`)));
  });
  const ids = await Promise.all(Array.from({length: 6}, run));
  assert.equal(new Set(ids).size, 1, ids.join(','));
  assert.equal(JSON.parse(await readFile(join(root, 'identity', 'device.json'), 'utf8')).deviceId, ids[0]);
  assert.deepEqual(await readdir(join(root, 'identity')), ['device.json']);
});

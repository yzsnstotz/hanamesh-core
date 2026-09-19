import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {INITIAL_CORE_SNAPSHOT} from '../lib/contracts.js';

async function killAt(file, kind, gate) {
  const child = fork(new URL('./fixtures/crash-child.mjs', import.meta.url), [file, kind, gate], {stdio: ['ignore', 'ignore', 'ignore', 'ipc']});
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('crash fixture timeout')), 3000);
    child.once('message', () => { clearTimeout(timer); resolve(); });
    child.once('error', reject);
  });
  child.kill('SIGKILL');
  await new Promise(resolve => child.once('exit', resolve));
  return JSON.parse(await readFile(file, 'utf8'));
}

test('LOCAL_FIXTURE kill -9 around device snapshot publication leaves old or complete new state', async t => {
  const root = await mkdtemp(join(tmpdir(), 'hm-core-crash-')); t.after(() => rm(root, {recursive: true, force: true}));
  for (const gate of ['before', 'after']) {
    const file = join(root, `device-${gate}.json`); await writeFile(file, JSON.stringify(INITIAL_CORE_SNAPSHOT));
    const snapshot = await killAt(file, 'device', gate);
    if (snapshot.device === null) assert.equal(snapshot.revision, 0);
    else {
      assert.equal(snapshot.revision, 1);
      assert.match(snapshot.device.deviceId, /^[A-Za-z0-9_-]{43}$/);
      assert.match(snapshot.device.publicKey, /^[A-Za-z0-9_-]{43}$/);
      assert.ok(snapshot.device.privateKeyPkcs8);
      assert.deepEqual(snapshot.registration, INITIAL_CORE_SNAPSHOT.registration);
      assert.deepEqual(snapshot.consent, INITIAL_CORE_SNAPSHOT.consent);
    }
  }
});

test('LOCAL_FIXTURE kill -9 around health publication leaves old or complete new snapshot', async t => {
  const root = await mkdtemp(join(tmpdir(), 'hm-health-crash-')); t.after(() => rm(root, {recursive: true, force: true}));
  for (const gate of ['before', 'after']) {
    const file = join(root, `health-${gate}.json`); await writeFile(file, JSON.stringify({revision: 0, boot: 'unchecked'}));
    const snapshot = await killAt(file, 'health', gate);
    if (snapshot.boot === 'unchecked') assert.equal(snapshot.revision, 0);
    else {
      assert.equal(snapshot.revision, 1);
      assert.equal(snapshot.mode, 'normal');
      assert.equal(snapshot.profile.id, 'hanamesh-suite');
      assert.deepEqual(snapshot.components, []);
    }
  }
});

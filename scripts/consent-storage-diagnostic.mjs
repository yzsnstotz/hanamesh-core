// Diagnostic only: real Core adapter + official DSH domain/JSON storage.
// Connection route dispatch and empty sibling loader are explicit harness supply;
// this does not install or exercise the unified desktop client's UI.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {join, resolve} from 'node:path';
import {access, mkdir, rename, writeFile, unlink} from 'node:fs/promises';
import {apply} from '../lib/dsh.mjs';
import {ROUTES} from '../lib/routes.js';

const runtime = process.argv[2];
const run = process.argv[3];
assert.ok(runtime && run, 'usage: node scripts/consent-storage-diagnostic.mjs <official-storage-install> <fresh-run>');
const root = resolve(run);
await assert.rejects(access(root), {code: 'ENOENT'});
await mkdir(root, {recursive: true, mode: 0o700});
const require = createRequire(join(resolve(runtime), 'package.json'));
const load = async name => import(pathToFileURL(require.resolve(name)).href);
const {Context} = await load('@deepseek-ai/cordis');
const {Storage} = await load('@deepseek-ai/dsh-storage');
const {DomainFacility} = await load('@deepseek-ai/dsh-storage-domain');
const {JsonStorageBackend} = await load('@deepseek-ai/dsh-storage-json');
for (const name of ['@deepseek-ai/dsh-storage', '@deepseek-ai/dsh-storage-domain', '@deepseek-ai/dsh-storage-json']) {
  assert.equal(require(name + '/package.json').version, '0.2.0-rc.2');
}
const medium = join(root, 'medium');
const origin = 'http://127.0.0.1:41001';
async function mount() {
  const context = new Context();
  new Storage(context);
  const backend = new JsonStorageBackend(medium);
  const unregister = context.storage.backend.register('json', backend);
  const storageDomain = new DomainFacility(context, {backend: 'json', routes: {}});
  const handlers = new Map();
  const disposers = [];
  let service;
  const supplied = {
    storageDomain,
    loader: {entries: () => []},
    connection: {fetch: {register(spec) { handlers.set(spec.path, spec.fetch); return () => handlers.delete(spec.path); }}},
    provide(name, value) { assert.equal(name, 'hanameshCore'); service = value; return () => {}; },
    get: () => undefined,
    on: () => () => {},
    effect(run) { disposers.push(run()); },
  };
  await apply(supplied, {serverOrigin: null, websiteOrigin: null});
  return {
    service,
    request: (path, method = 'GET', body, carrier = origin) => handlers.get(path)(new Request(origin + path, {
      method,
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
      headers: {origin: carrier, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json'},
    })),
    async close() {
      for (const dispose of disposers.reverse()) await dispose();
      await storageDomain.closeAll();
      unregister();
      await backend.close();
    },
  };
}
let mounted = await mount();
const observations = [];
async function read(expected, stage) {
  const response = await mounted.request(ROUTES.state);
  assert.equal(response.status, 200);
  const state = await response.json();
  assert.equal(state.consent.state, expected);
  assert.equal(mounted.service.getConsent(), expected);
  observations.push({stage, consent: state.consent.state});
  return state.deviceId;
}
try {
  const device = await read('withheld', 'fresh-default');
  assert.equal((await mounted.request(ROUTES.consent, 'POST', {state: 'granted'})).status, 200);
  await read('granted', 'grant-readback');
  await mounted.close();
  mounted = await mount();
  assert.equal(await read('granted', 'reopen-granted'), device);
  const rejected = await mounted.request(ROUTES.consent, 'POST', {state: 'withheld'}, 'http://127.0.0.1:41002');
  assert.equal(rejected.status, 403);
  await read('granted', 'foreign-origin-rejected');
  assert.equal((await mounted.request(ROUTES.consent, 'POST', {state: 'withheld'})).status, 200);
  await read('withheld', 'withdraw-readback');
  await mounted.close();
  mounted = await mount();
  assert.equal(await read('withheld', 'reopen-withheld'), device);
  // Fail the actual filesystem medium without altering any stored snapshot.
  const saved = medium + '-fault-backup';
  await rename(medium, saved);
  await writeFile(medium, 'diagnostic: not a directory', {mode: 0o600});
  try {
    const failed = await mounted.request(ROUTES.consent, 'POST', {state: 'granted'});
    assert.equal(failed.status, 503);
    const error = await failed.json();
    assert.equal(error.error.code, 'CORE_UPSTREAM_UNAVAILABLE');
    await read('withheld', 'filesystem-write-failed-no-memory-publish');
    observations.push({stage: 'filesystem-error-response', status: failed.status, code: error.error.code});
  } finally {
    await unlink(medium);
    await rename(saved, medium);
  }
  await mounted.close();
  mounted = await mount();
  assert.equal(await read('withheld', 'reopen-after-failed-write'), device);
  await writeFile(join(root, 'observations.json'), JSON.stringify({storageVersions: '0.2.0-rc.2', supply: 'route dispatcher and empty sibling loader are harness inputs', observations}, null, 2) + '\n');
  console.log(JSON.stringify({observations, realCoreAdapter: true, realOfficialDomainJsonStorage: true, unifiedClientUi: false}));
} finally { await mounted.close(); }

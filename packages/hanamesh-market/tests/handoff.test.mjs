// Website → client install handoff (C-MARKET 2026-10-15 E/F): own loopback listener, allowed origins, queue states,
// linking to library install events, port fallback and expiry. Real HTTP on random loopback ports.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { request } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHandoffQueue, createHandoffHandler, createHandoffListener, handoffSettings, HANDOFF_DEFAULTS, HANDOFF_RULES, HANDOFF_BODY_MAX_BYTES } from '../src/library/handoff.js';

const SITE = 'https://market.hanamesh.com';
async function freePort() {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address(); await new Promise(resolve => server.close(resolve)); return port;
}
async function occupy(port) {
  const server = createServer(); await new Promise(resolve => server.listen(port, '127.0.0.1', resolve)); return server;
}
function fakeLibrary({ ready = true, installed = null } = {}) {
  return {
    installTarget: () => ({ client: 'hanamesh', ready, installTarget: { contract: 'hanamesh.install-target', contractVersion: '1', supported: ['1'], fragmentPrefix: '#hanamesh-install?' },
      ...(ready ? {} : { error: { code: 'INSTALL_TARGET_UNAVAILABLE', message: '应用库还不能安装：X', need: [{ need: 'X', how: 'Y' }] } }) }),
    resolveTarget: async target => {
      if (target.itemId === 'missing') { const { AppHostError } = await import('../src/errors.js'); throw new AppHostError('CATALOG_ITEM_MISSING', 'missing', {}, 404); }
      return { item: { id: target.itemId ?? 'example.notes', displayName: 'Notes', kind: 'plugin', package: { registry: 'npm', name: target.packageName ?? 'example-notes' }, installed, upgradeAvailable: false } };
    },
  };
}
async function start(t, { library = fakeLibrary(), settings = {}, clock } = {}) {
  const ports = settings.ports ?? [await freePort()];
  const current = handoffSettings({ ...settings, ports });
  const queue = createHandoffQueue({ ttlMs: () => current.ttlMs, ...(clock ? { now: clock } : {}) });
  const listener = createHandoffListener({ settings: () => current, handlerFor: port => createHandoffHandler({ library, queue, settings: () => current, port }) });
  const state = await listener.start(); t.after(() => listener.stop());
  return { queue, listener, state, base: state.origin };
}
const post = (base, body, origin = SITE) => fetch(base + '/hanamesh/library/handoff', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('defaults are the owner-approved values and settings are validated only by the listed rules', async () => {
  assert.deepEqual(handoffSettings(), { enabled: true, ports: [39317, 39318, 39319], allowedOrigins: [SITE], ttlMs: 600000, pollMs: 1500 });
  assert.deepEqual(HANDOFF_DEFAULTS.ports, [39317, 39318, 39319]);
  for (const bad of [{ ports: [] }, { ports: [80] }, { ports: [40000, 40000] }, { allowedOrigins: ['http://evil.example'] }, { allowedOrigins: ['https://a.example/path'] },
    { ttlMs: 1500 }, { pollMs: 0 }, { pollMs: 2 ** 31 }, { pollMs: 1.5 }, { extra: 1 }])
    assert.throws(() => handoffSettings(bad), { code: 'INVALID_HANDOFF_SETTINGS' }, JSON.stringify(bad));
  assert.deepEqual(handoffSettings({ allowedOrigins: ['http://localhost:5173'] }).allowedOrigins, ['http://localhost:5173']);
  // No count caps: many ports, many origins, no origin at all (nobody can hand off), long expiry.
  assert.equal(handoffSettings({ ports: Array.from({ length: 40 }, (_, i) => 40000 + i) }).ports.length, 40);
  assert.equal(handoffSettings({ allowedOrigins: Array.from({ length: 50 }, (_, i) => `https://s${i}.example`) }).allowedOrigins.length, 50);
  assert.deepEqual(handoffSettings({ allowedOrigins: [] }).allowedOrigins, []);
  assert.equal(handoffSettings({ ttlMs: 7 * 86_400_000, pollMs: 100 }).ttlMs, 7 * 86_400_000);
  // Every fixed rule has its reason, and the body limit is one of them.
  assert.ok(HANDOFF_RULES.every(row => row.rule && row.why));
  assert.ok(HANDOFF_RULES.some(row => row.rule.includes(String(HANDOFF_BODY_MAX_BYTES))));
  // The client polls with the setting's default until the first poll delivers the saved value.
  assert.match(await readFile(new URL('../src/client.js', import.meta.url), 'utf8'), new RegExp(`const HANDOFF_DEFAULT_POLL_MS=${HANDOFF_DEFAULTS.pollMs};`));
});

test('probe answers client facts only to allowed websites; other valid websites read a constant refusal', async t => {
  const { base } = await start(t, { library: fakeLibrary({ ready: false }) });
  const probe = await fetch(base + '/hanamesh/library/install-target', { headers: { origin: SITE } });
  assert.equal(probe.status, 200); assert.equal(probe.headers.get('access-control-allow-origin'), SITE);
  const body = await probe.json();
  assert.equal(body.client, 'hanamesh'); assert.equal(body.ready, false); assert.deepEqual(body.error.need, [{ need: 'X', how: 'Y' }]);
  const stranger = await fetch(base + '/hanamesh/library/install-target', { headers: { origin: 'https://anything.example' } });
  assert.equal(stranger.status, 403); assert.equal(stranger.headers.get('access-control-allow-origin'), 'https://anything.example');
  const hidden = await stranger.text();
  assert.doesNotMatch(hidden, /hanamesh"|ready|need|client/, 'no client, readiness or need in the refusal');
  const strangerPreflight = await fetch(base + '/hanamesh/library/install-target', { method: 'OPTIONS', headers: { origin: 'https://anything.example', 'access-control-request-method':'GET', 'access-control-request-private-network': 'true' } });
  assert.equal(strangerPreflight.status,204);assert.equal(strangerPreflight.headers.get('access-control-allow-origin'), 'https://anything.example');
  assert.equal(strangerPreflight.headers.get('access-control-allow-private-network'), 'true');
  const preflight = await fetch(base + '/hanamesh/library/install-target', { method: 'OPTIONS', headers: { origin: SITE, 'access-control-request-private-network': 'true' } });
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-private-network'), 'true');
  assert.equal(preflight.headers.get('access-control-allow-origin'), SITE);
  assert.equal(preflight.headers.get('access-control-max-age'), null, 'no hidden preflight cache value');
  // Without an Origin it is not a website (address bar, local tool): answered, without any CORS grant.
  const local = await fetch(base + '/hanamesh/library/install-target');
  assert.equal(local.status, 200); assert.equal(local.headers.get('access-control-allow-origin'), null);
  assert.equal((await fetch(base + '/hanamesh/library/install-target?x=1')).status, 400);
});

test('only allowed origins may hand off; preflight echoes the exact origin; nothing is installed by the POST', async t => {
  const { base, queue } = await start(t);
  const denied = await post(base, { itemId: 'example.notes' }, 'https://evil.example');
  assert.equal(denied.status, 403); assert.equal((await denied.json()).error.code, 'ORIGIN_DENIED');
  assert.equal((await fetch(base + '/hanamesh/library/handoff', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 403);
  const preflight = await fetch(base + '/hanamesh/library/handoff', { method: 'OPTIONS', headers: { origin: SITE, 'access-control-request-method': 'POST', 'access-control-request-private-network': 'true' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), SITE);
  assert.match(preflight.headers.get('access-control-allow-methods'), /POST/);
  assert.equal(preflight.headers.get('access-control-allow-headers'), 'content-type');
  assert.equal(preflight.headers.get('access-control-allow-private-network'), 'true');
  assert.equal(preflight.headers.get('access-control-max-age'), null);
  const big = await fetch(base + '/hanamesh/library/handoff', { method: 'POST', headers: { origin: SITE, 'content-type': 'application/json' }, body: JSON.stringify({ itemId: 'x'.repeat(HANDOFF_BODY_MAX_BYTES) }) });
  assert.equal(big.status, 413); assert.equal((await big.json()).error.details.maxBytes, HANDOFF_BODY_MAX_BYTES);
  const accepted = await post(base, { itemId: 'example.notes', packageName: 'example-notes', contractVersion: '1' });
  assert.equal(accepted.status, 202); assert.equal(accepted.headers.get('access-control-allow-origin'), SITE);
  const { handoffId, state } = await accepted.json();
  assert.equal(state, 'pending');
  assert.deepEqual(queue.open().map(row => [row.handoffId, row.state, row.packageName]), [[handoffId, 'pending', 'example-notes']]);
  const missing = await post(base, { itemId: 'missing' });
  assert.equal(missing.status, 404); assert.equal((await missing.json()).error.code, 'CATALOG_ITEM_MISSING');
  const wrongHost = await fetch(base.replace('127.0.0.1', 'localhost') + '/hanamesh/library/install-target', { headers: { origin: SITE } });
  assert.equal(wrongHost.status, 200, 'localhost alias of the same port is accepted');
  const port = new URL(base).port;
  const rebound = await new Promise((resolve, reject) => request({ host: '127.0.0.1', port, path: '/hanamesh/library/install-target', headers: { host: `evil.example:${port}`, origin: SITE } },
    res => { res.resume(); res.on('end', () => resolve(res.statusCode)); }).on('error', reject).end());
  assert.equal(rebound, 403, 'a DNS-rebound Host is refused');
});

test('state follows the client window and the library install events, and is readable only by the same origin', async t => {
  const { base, queue } = await start(t, { settings: { allowedOrigins: [SITE, 'http://localhost:5173'] } });
  const { handoffId } = await (await post(base, { packageName: 'example-notes' })).json();
  const read = async (origin = SITE) => fetch(base + '/hanamesh/library/handoff?id=' + handoffId, { headers: { origin } });
  assert.equal((await read('http://localhost:5173')).status, 404, 'another allowed site cannot read this handoff');
  assert.equal((await (await read()).json()).state, 'pending');
  queue.report({ handoffId, state: 'shown' });
  queue.observe({ type: 'library.install-started', packageName: 'other' });
  assert.equal((await (await read()).json()).state, 'shown');
  queue.observe({ type: 'library.install-started', packageName: 'example-notes', kind: 'plugin' });
  assert.equal((await (await read()).json()).state, 'confirmed');
  queue.observe({ type: 'library.install-done', status: 'applied', packageName: 'example-notes' });
  const done = await (await read()).json();
  assert.equal(done.state, 'installed'); assert.deepEqual(done.result, { status: 'applied' });
  queue.observe({ type: 'library.install-failed', packageName: 'example-notes', code: 'X' });
  assert.equal((await (await read()).json()).state, 'installed', 'final states do not move');
  assert.throws(() => queue.report({ handoffId, state: 'installed' }), { code: 'INVALID_INPUT' }, 'a client cannot claim an install');
  const second = (await (await post(base, { packageName: 'example-notes' })).json()).handoffId;
  queue.report({ handoffId: second, state: 'cancelled' });
  assert.equal(queue.get(second).state, 'cancelled');
  const third = (await (await post(base, { packageName: 'example-notes' })).json()).handoffId;
  queue.report({ handoffId: third, state: 'shown' });
  queue.observe({ type: 'library.install-failed', packageName: 'example-notes', code: 'DSH_PLUGIN_FAILED' });
  assert.deepEqual([queue.get(third).state, queue.get(third).error.code], ['failed', 'DSH_PLUGIN_FAILED']);
  assert.equal((await fetch(base + '/hanamesh/library/handoff?id=00000000-0000-4000-8000-000000000000', { headers: { origin: SITE } })).status, 404);
});

test('an already installed target is reported installed at once; an unready library refuses with its need', async t => {
  const installed = await start(t, { library: fakeLibrary({ installed: { state: 'installed', version: '1.0.0' } }) });
  const body = await (await post(installed.base, { packageName: 'example-notes' })).json();
  assert.equal(body.state, 'installed'); assert.deepEqual(body.result, { status: 'already-installed' });
  const unready = await start(t, { library: fakeLibrary({ ready: false }) });
  const refused = await post(unready.base, { packageName: 'example-notes' });
  assert.equal(refused.status, 503); assert.deepEqual((await refused.json()).error.details.need, [{ need: 'X', how: 'Y' }]);
});

test('an expiry says what really happened: never picked up, picked up but not shown, or shown but unanswered', async t => {
  let now = 1_000_000;
  const { base, queue } = await start(t, { settings: { ttlMs: 10_000 }, clock: () => now });
  const handoff = async () => (await (await post(base, { packageName: 'example-notes' })).json()).handoffId;
  const neverPolled = await handoff();
  now += 10_001;
  const lost = queue.get(neverPolled);
  assert.deepEqual([lost.state, lost.error.code, lost.error.lastPolledAt], ['failed', 'HANDOFF_NOT_PICKED_UP', null]);
  assert.match(lost.error.message, /一直没有来取/);
  const polledNotShown = await handoff(); queue.clientPolled(); now += 10_001;
  assert.equal(queue.get(polledNotShown).error.code, 'HANDOFF_NOT_PICKED_UP');
  assert.match(queue.get(polledNotShown).error.message, /没能弹出确认/);
  const shown = await handoff(); queue.report({ handoffId: shown, state: 'shown' }); now += 10_001;
  assert.equal(queue.get(shown).error.code, 'HANDOFF_EXPIRED'); assert.match(queue.get(shown).error.message, /确认框已经弹出/);
  assert.deepEqual(queue.open(), []);
});

test('the client window can report that the confirmation could not open, with its reason; nothing else', async t => {
  const { base, queue } = await start(t);
  const { handoffId } = await (await post(base, { packageName: 'example-notes' })).json();
  for (const bad of [{ handoffId, state: 'failed' }, { handoffId, state: 'failed', error: { code: 'lower' } }, { handoffId, state: 'failed', error: { code: 'X', message: 'm' } },
    { handoffId, state: 'cancelled', error: { code: 'X' } }, { handoffId, state: 'installed' }])
    assert.throws(() => queue.report(bad), { code: 'INVALID_INPUT' }, JSON.stringify(bad));
  queue.report({ handoffId, state: 'failed', error: { code: 'CATALOG_ITEM_MISSING' } });
  const read = await (await fetch(base + '/hanamesh/library/handoff?id=' + handoffId, { headers: { origin: SITE } })).json();
  assert.equal(read.state, 'failed'); assert.equal(read.error.code, 'HANDOFF_OPEN_FAILED'); assert.equal(read.error.cause, 'CATALOG_ITEM_MISSING');
});

test('a failing subscriber is reported and does not stop the others', () => {
  const errors = [], seen = [];
  const queue = createHandoffQueue({ onError: (message, error) => errors.push([message, error.message]) });
  queue.subscribe(() => { throw new Error('boom'); }); queue.subscribe(row => seen.push(row.state));
  queue.create({ origin: SITE, target: {}, item: { id: 'a', package: { name: 'a' } } });
  assert.deepEqual(seen, ['pending']); assert.deepEqual(errors, [['hanamesh-market handoff: subscriber failed', 'boom']]);
});

test('listener takes the first free port, reports every occupied port, and can be disabled', async t => {
  const [a, b] = [await freePort(), await freePort()];
  const blocker = await occupy(a); t.after(() => new Promise(resolve => blocker.close(resolve)));
  const { state } = await start(t, { settings: { ports: [a, b] } });
  assert.deepEqual([state.status, state.port], ['listening', b]);
  const second = await start(t, { settings: { ports: [a, b] } });
  assert.equal(second.state.status, 'unavailable');
  assert.deepEqual(second.state.tried.map(row => [row.port, row.code]), [[a, 'EADDRINUSE'], [b, 'EADDRINUSE']]);
  assert.match(second.state.need, new RegExp(`${a}、${b}`));
  const disabled = await start(t, { settings: { enabled: false } });
  assert.equal(disabled.state.status, 'disabled');
});

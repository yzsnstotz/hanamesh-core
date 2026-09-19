import test from 'node:test';
import assert from 'node:assert/strict';
import {SessionController} from '../lib/controller.js';
import {createRouteHandler, ROUTES} from '../lib/routes.js';
import {INITIAL_CORE_SNAPSHOT} from '../lib/contracts.js';
import {memoryStore} from './fixtures/core-store.mjs';

const carrier = 'http://127.0.0.1:41001';
const headers = {origin: carrier, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json'};

test('open-external rejects foreign origins and reports disabled native opening', async () => {
  const controller = await SessionController.create({serverOrigin: null, websiteOrigin: 'https://hanamesh.example', allowSystemBrowser: false}, memoryStore(INITIAL_CORE_SNAPSHOT).store);
  const handle = createRouteHandler(controller);
  const foreign = await handle(new Request(`${carrier}${ROUTES.openExternal}`, {method: 'POST', headers, body: JSON.stringify({url: 'https://evil.example/'})}));
  assert.equal(foreign.status, 400);
  assert.equal((await foreign.json()).error.code, 'CORE_URL_NOT_ALLOWED');
  const allowed = await handle(new Request(`${carrier}${ROUTES.openExternal}`, {method: 'POST', headers, body: JSON.stringify({url: 'https://hanamesh.example/'})}));
  assert.equal(allowed.status, 200);
  assert.deepEqual(await allowed.json(), {opened: false, reason: 'DISABLED'});
});

test('contribution aggregation preserves unavailable versus real zero', async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({url: String(url), init});
    return Response.json({byHana: [{actions: {install: 2, open: 3, use: 5, uninstall: 1}}, {actions: {install: 1, open: 0, use: 4, uninstall: 0}}]});
  };
  const controller = await SessionController.create({serverOrigin: 'https://server.example', websiteOrigin: null}, memoryStore(INITIAL_CORE_SNAPSHOT).store, {fetcher});
  const totals = await controller.refreshContributions();
  assert.deepEqual(totals, {status: 'ready', windowDays: 90, actions: {install: 3, open: 3, use: 9, uninstall: 1}});
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/server\.example\/v1\/usage\/me\/contributions\?/);
  assert.ok(calls[0].init.headers['x-hm-signature']);
  assert.deepEqual(controller.state().contributions, totals);
  const offline = await SessionController.create({serverOrigin: null, websiteOrigin: null}, memoryStore(INITIAL_CORE_SNAPSHOT).store, {fetcher});
  assert.deepEqual(await offline.refreshContributions(), {status: 'unavailable', reason: 'NOT_CONNECTED'});
  assert.equal(calls.length, 1);
});

test('server responses larger than 1 MiB are rejected before JSON parsing', async () => {
  const oversized = JSON.stringify({byHana: [], padding: 'x'.repeat(1024 * 1024)});
  const controller = await SessionController.create({serverOrigin: 'https://server.example', websiteOrigin: null}, memoryStore(INITIAL_CORE_SNAPSHOT).store, {
    fetcher: async () => new Response(oversized, {headers: {'content-type': 'application/json'}}),
  });
  assert.deepEqual(await controller.refreshContributions(), {status: 'unavailable', reason: 'CORE_UPSTREAM_UNAVAILABLE'});
});

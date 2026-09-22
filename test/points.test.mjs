import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {SessionController} from '../lib/controller.js';
import {createRouteHandler, ROUTES} from '../lib/routes.js';
import {INITIAL_CORE_SNAPSHOT} from '../lib/contracts.js';
import {memoryStore} from './fixtures/core-store.mjs';

const carrier = 'http://127.0.0.1:41001';
const postHeaders = {origin: carrier, host: '127.0.0.1:41001', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json'};

const POINTS_BODY = {
  totalPoints: 31.25,
  hanas: [
    {hanaId: 'b1f0c4a2-0000-4000-8000-000000000001', points: 26.25, pending: 0, breakdown: {install: 5, open: 0, use: 20, claimBonus: 0, creatorMirror: 1.25, launchInitiator: 0}},
    {hanaId: 'b1f0c4a2-0000-4000-8000-000000000002', points: 0, pending: 5, breakdown: {install: 0, open: 0, use: 0, claimBonus: 0, creatorMirror: 0, launchInitiator: 0}},
  ],
};

/** A controller whose device is already registered, consent granted, and whose upstream answers the two signed reads. */
async function ready(options = {}) {
  const {points = POINTS_BODY, pointsStatus = 200, bound = false, initial = INITIAL_CORE_SNAPSHOT, contributions = true} = options;
  const memory = memoryStore(initial);
  const calls = [];
  const fetcher = async (url, init) => {
    const path = new URL(String(url)).pathname;
    calls.push({path, headers: new Headers(init?.headers)});
    if (path === '/v1/identity/devices/challenge') return Response.json({nonce: 'n', expiresAt: '2030-01-01T00:00:00.000Z'});
    if (path === '/v1/identity/devices') {
      const raw = Buffer.from(JSON.parse(init.body).publicKey, 'base64url');
      return Response.json({deviceId: createHash('sha256').update(raw).digest('base64url'), principalId: 'p'}, {status: 201});
    }
    if (path === '/v1/usage/me/contributions') {
      if (!contributions) return new Response('nope', {status: 503});
      return Response.json({bound, byHana: []});
    }
    if (path === '/v1/custody/me/points') {
      if (pointsStatus !== 200) return new Response('nope', {status: pointsStatus});
      return Response.json(points);
    }
    return new Response('unexpected', {status: 404});
  };
  const controller = await SessionController.create({serverOrigin: 'https://server.example', websiteOrigin: 'https://web.example'}, memory.store, {fetcher});
  await controller.register();
  await controller.setConsent('granted');
  await controller.refreshContributions();
  return {controller, memory, calls, handle: createRouteHandler(controller)};
}

test('GET /api/hanamesh/core/points returns the signed custody read with 分 totals and a per-Hana breakdown', async () => {
  const {handle, calls} = await ready();
  const response = await handle(new Request(`${carrier}${ROUTES.points}`));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'ready');
  assert.equal(body.reason, null);
  assert.equal(body.totalPoints, 31.25);
  assert.equal(body.pendingTotal, 5);
  assert.equal(body.hanas.length, 2);
  assert.deepEqual(Object.keys(body.hanas[0].breakdown).sort(), ['claimBonus', 'creatorMirror', 'install', 'launchInitiator', 'open', 'use']);
  assert.equal(body.hanas[0].breakdown.creatorMirror, 1.25);
  assert.equal(body.bound, false);
  const signed = calls.find(call => call.path === '/v1/custody/me/points');
  assert.ok(signed, 'the host, not the client bundle, signs the custody read');
  for (const header of ['x-hm-device-id', 'x-hm-timestamp', 'x-hm-nonce', 'x-hm-signature']) assert.ok(signed.headers.get(header), header);
  assert.equal((await handle(new Request(`${carrier}${ROUTES.points}`, {method: 'POST', headers: postHeaders, body: '{}'}))).status, 405);
});

test('points empty states are readable: no consent, no registration, no server, upstream failure', async () => {
  const offline = await SessionController.create({serverOrigin: null, websiteOrigin: null}, memoryStore(INITIAL_CORE_SNAPSHOT).store);
  assert.deepEqual(await offline.refreshPoints(), {status: 'unavailable', reason: 'NOT_CONNECTED', totalPoints: 0, pendingTotal: 0, hanas: []});

  const {controller} = await ready();
  await controller.setConsent('withheld');
  assert.equal((await controller.refreshPoints()).reason, 'CONSENT_WITHHELD');

  const unregistered = await SessionController.create({serverOrigin: 'https://server.example', websiteOrigin: null}, memoryStore(INITIAL_CORE_SNAPSHOT).store, {fetcher: async () => new Response('no', {status: 503})});
  await unregistered.setConsent('granted');
  assert.equal((await unregistered.refreshPoints()).reason, 'NOT_REGISTERED');

  const broken = await ready({pointsStatus: 503});
  assert.equal((await broken.controller.refreshPoints()).reason, 'CORE_UPSTREAM_UNAVAILABLE');

  const malformed = await ready({points: {totalPoints: 1, hanas: [{hanaId: 'x', points: 'lots', pending: 0, breakdown: {}}]}});
  assert.equal((await malformed.controller.refreshPoints()).reason, 'CORE_UPSTREAM_UNAVAILABLE');
});

test('the bind prompt fires once: pending 分 on an unbound device, then never again — restart included', async () => {
  const {controller, memory, handle} = await ready();
  const first = await (await handle(new Request(`${carrier}${ROUTES.points}`))).json();
  assert.deepEqual(first.prompt, {show: true, shownAt: null});

  const stamped = await handle(new Request(`${carrier}${ROUTES.pointsPromptShown}`, {method: 'POST', headers: postHeaders}));
  assert.equal(stamped.status, 200);
  const {shownAt} = await stamped.json();
  assert.match(shownAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(memory.read().pointsBindPromptShownAt, shownAt);

  const second = await (await handle(new Request(`${carrier}${ROUTES.points}`))).json();
  assert.equal(second.prompt.show, false);
  assert.equal(second.prompt.shownAt, shownAt);

  // Stamping again is idempotent: the marker keeps its first timestamp.
  assert.deepEqual(await (await handle(new Request(`${carrier}${ROUTES.pointsPromptShown}`, {method: 'POST', headers: postHeaders}))).json(), {shownAt});

  // Restart: a fresh controller reading the same stored snapshot still refuses to prompt.
  await controller.dispose();
  const restarted = await ready({initial: memory.read()});
  const afterRestart = await (await restarted.handle(new Request(`${carrier}${ROUTES.points}`))).json();
  assert.equal(afterRestart.prompt.show, false);
  assert.equal(afterRestart.prompt.shownAt, shownAt);
});

test('the bind prompt never fires for a bound device, and never without pending 分', async () => {
  const bound = await ready({bound: true});
  assert.equal((await (await bound.handle(new Request(`${carrier}${ROUTES.points}`))).json()).prompt.show, false);

  const nothingPending = await ready({points: {totalPoints: 5, hanas: [{hanaId: 'a', points: 5, pending: 0, breakdown: {install: 5}}]}});
  const body = await (await nothingPending.handle(new Request(`${carrier}${ROUTES.points}`))).json();
  assert.equal(body.prompt.show, false);
  assert.equal(body.hanas[0].breakdown.use, 0); // missing breakdown keys read as a real zero, not undefined
});

test('the prompt marker is optional in storage so an rc.30 snapshot still loads and can be stamped', async () => {
  const legacy = structuredClone(INITIAL_CORE_SNAPSHOT);
  delete legacy.pointsBindPromptShownAt;
  const {controller, memory} = await ready({initial: legacy});
  assert.equal(memory.read().pointsBindPromptShownAt, undefined);
  const {shownAt} = await controller.markPointsPromptShown();
  assert.equal(memory.read().pointsBindPromptShownAt, shownAt);
});

test('the points route is guarded like every other core route and leaks no secrets', async () => {
  const {handle} = await ready();
  assert.equal((await handle(new Request(`${carrier}${ROUTES.points}?hanaId=x`))).status, 404);
  const wrongOrigin = await handle(new Request(`${carrier}${ROUTES.pointsPromptShown}`, {method: 'POST', headers: {...postHeaders, origin: 'https://evil.example'}}));
  assert.equal(wrongOrigin.status, 403);
  const body = JSON.stringify(await (await handle(new Request(`${carrier}${ROUTES.points}`))).json());
  assert.doesNotMatch(body, /private.?key|authorization|token/i);
});

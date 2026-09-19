/** rc.9: wire format pinned to O1 identity 0.2.0-rc.1 `docs/API.md` (P1 A1-1: identity API.md is authoritative). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, createPublicKey, verify} from 'node:crypto';
import {SessionController} from '../lib/controller.js';
import {INITIAL_CORE_SNAPSHOT} from '../lib/contracts.js';
import {createRouteHandler} from '../lib/routes.js';
import {memoryStore} from './fixtures/core-store.mjs';

const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const publicKeyOf = controller => createPublicKey({key: Buffer.concat([SPKI_PREFIX, Buffer.from(controller.service.getPublicKey(), 'base64url')]), format: 'der', type: 'spki'});
const verifies = (controller, message, signature) => verify(null, Buffer.from(message), publicKeyOf(controller), Buffer.from(signature, 'base64url'));

function identityStub() {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({url: String(url), init});
    if (String(url).endsWith('/v1/identity/devices/challenge')) {
      const purpose = JSON.parse(init.body).purpose;
      return Response.json({nonce: `${purpose}-nonce-abcdefghijklmnop`, expiresAt: new Date(Date.now() + 300_000).toISOString()});
    }
    const body = JSON.parse(init.body);
    return Response.json({deviceId: createHash('sha256').update(Buffer.from(body.publicKey, 'base64url')).digest('base64url'), principalId: 'principal-1'}, {status: 201});
  };
  return {calls, fetcher};
}

test('registration signs utf8(nonce ‖ publicKey-as-base64url-string), exactly what identity verifies', async () => {
  const remote = identityStub();
  const controller = await SessionController.create({serverOrigin: 'https://server.example', websiteOrigin: null}, memoryStore(INITIAL_CORE_SNAPSHOT).store, {fetcher: remote.fetcher});
  await controller.register();
  const body = JSON.parse(remote.calls[1].init.body);
  for (const call of remote.calls) assert.equal(new Headers(call.init.headers).get('origin'), 'https://server.example', 'identity assertMutationOrigin needs Origin = serverOrigin');
  assert.equal(body.publicKey, controller.service.getPublicKey());
  // identity devices/service.ts: validSignature(input.publicKey, input.nonce + input.publicKey, input.signature)
  assert.equal(verifies(controller, body.nonce + body.publicKey, body.signature), true);
  assert.equal(verifies(controller, Buffer.concat([Buffer.from(body.nonce), Buffer.from(body.publicKey, 'base64url')]), body.signature), false, 'raw-key concatenation must NOT verify');
});

test('signRequest emits Unix-millisecond timestamp and `METHOD|PATH|TIMESTAMP|NONCE|sha256(body)`', async () => {
  const controller = await SessionController.create({serverOrigin: 'https://server.example', websiteOrigin: null}, memoryStore(INITIAL_CORE_SNAPSHOT).store, {fetcher: async () => { throw new Error('unused'); }});
  const body = new TextEncoder().encode('{"a":1}');
  const before = Date.now();
  const headers = await controller.service.signRequest({method: 'post', path: '/v1/usage/events', body});
  const timestamp = Number(headers['x-hm-timestamp']);
  assert.match(headers['x-hm-timestamp'], /^(?:0|[1-9]\d*)$/);
  assert.ok(timestamp >= before && timestamp <= Date.now() + 1, 'milliseconds, not seconds');
  assert.match(headers['x-hm-nonce'], /^[A-Za-z0-9_-]{16,128}$/);
  assert.equal(headers['x-hm-device-id'], controller.service.getDeviceId());
  const bodyHash = createHash('sha256').update(body).digest('hex');
  assert.equal(verifies(controller, `POST|/v1/usage/events|${headers['x-hm-timestamp']}|${headers['x-hm-nonce']}|${bodyHash}`, headers['x-hm-signature']), true);
  assert.equal(verifies(controller, `POST\n/v1/usage/events\n${headers['x-hm-timestamp']}\n${headers['x-hm-nonce']}\n${bodyHash}`, headers['x-hm-signature']), false, 'newline canonical must NOT verify');
  await assert.rejects(controller.service.signRequest({method: 'GET', path: '/v1/x|y', body: null}), error => error?.code === 'CORE_INPUT_INVALID');
  // usage/identity verify over the bare route path: the query string is not part of PATH
  const withQuery = await controller.service.signRequest({method: 'GET', path: '/v1/usage/me/contributions?from=a&to=b', body: null});
  const emptyHash = createHash('sha256').update(new Uint8Array()).digest('hex');
  assert.equal(verifies(controller, `GET|/v1/usage/me/contributions|${withQuery['x-hm-timestamp']}|${withQuery['x-hm-nonce']}|${emptyHash}`, withQuery['x-hm-signature']), true);
});

test('bind-link returns the website /me/bind URL carrying deviceId, bind nonce and its device signature', async () => {
  const remote = identityStub();
  const controller = await SessionController.create({serverOrigin: 'https://server.example', websiteOrigin: 'https://market.example'}, memoryStore(INITIAL_CORE_SNAPSHOT).store, {fetcher: remote.fetcher});
  const handler = createRouteHandler(controller);
  const response = await handler(new Request('http://127.0.0.1:1/api/hanamesh/core/bind-link', {method: 'POST', headers: {origin: 'http://127.0.0.1:1', host: '127.0.0.1:1'}}));
  assert.equal(response.status, 200);
  const {url, expiresAt} = await response.json();
  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, 'https://market.example/me/bind');
  assert.equal(parsed.searchParams.get('deviceId'), controller.service.getDeviceId());
  assert.equal(parsed.searchParams.get('nonce'), 'bind-nonce-abcdefghijklmnop');
  assert.equal(JSON.parse(remote.calls.at(-1).init.body).purpose, 'bind');
  assert.ok(Date.parse(expiresAt) > Date.now());
  // identity links.bindDevice: validSignature(row.publicKey, input.nonce, input.signature)
  assert.equal(verifies(controller, parsed.searchParams.get('nonce'), parsed.searchParams.get('signature')), true);
  const offline = await SessionController.create({serverOrigin: 'https://server.example', websiteOrigin: null}, memoryStore(INITIAL_CORE_SNAPSHOT).store, {fetcher: remote.fetcher});
  await assert.rejects(offline.bindLink(), error => error?.code === 'CORE_URL_NOT_ALLOWED');
});

test('contributions response `bound` flows into getSession().bound', async () => {
  const fetcher = async url => String(url).includes('/v1/usage/me/contributions')
    ? Response.json({window: {}, bound: true, deviceCount: 1, byHana: [{hanaRef: 'x', actions: {install: 1, open: 0, use: 0, uninstall: 0}, devices: 1}], sources: {events: 1, rollups: 0}})
    : Response.json({}, {status: 500});
  const controller = await SessionController.create({serverOrigin: 'https://server.example', websiteOrigin: null}, memoryStore(INITIAL_CORE_SNAPSHOT).store, {fetcher});
  assert.equal(controller.service.getSession().bound, null);
  await controller.refreshContributions();
  assert.equal(controller.service.getSession().bound, true);
});

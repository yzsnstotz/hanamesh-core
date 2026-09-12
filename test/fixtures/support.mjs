import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const lib = process.env.HM_TEST_LIB || resolve('lib');
export const { IdentityController } = await import(pathToFileURL(resolve(lib, 'controller.js')).href);
export const { createRouteHandler, ROUTES } = await import(pathToFileURL(resolve(lib, 'routes.js')).href);
export const { BrowserIdentityClient } = await import(pathToFileURL(resolve(lib, 'client.js')).href);
export const { INITIAL_OBSERVATION, configOf, requestOf, publicJson } = await import(pathToFileURL(resolve(lib, 'validation.js')).href);
export const { IdentityTransport } = await import(pathToFileURL(resolve(lib, 'transport.js')).href);
export const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const config = {identityOrigin: 'https://identity.example.invalid', deploymentId: 'fixture-deployment'};
export const login = {email: 'fixture@example.invalid', password: 'synthetic-fixture-password'};
export const secret = 'fixture-cookie-value-not-a-real-credential';
export const principal = id => ({principalId: id, deploymentId: config.deploymentId, displayName: 'Synthetic User', scopes: ['identity:read:self', 'identity:update:self']});
export function json(value, status = 200, headers = {}) {return new Response(JSON.stringify(value), {status, headers: {'content-type': 'application/json', ...headers}});}
export function cookie(value = secret) {return `hm_fixture=${value}; HttpOnly; Secure; Path=/; SameSite=Lax`;}
export function memoryStore(initial = INITIAL_OBSERVATION) {
  let value = structuredClone(initial); const writes = [];
  return {writes, fail: false, closed: 0,
    read() {return structuredClone(value);},
    async publish(next) {if (this.fail) throw new Error('synthetic private storage failure'); value = structuredClone(next); writes.push(structuredClone(next));},
    async close() {this.closed++;},
  };
}
/** Explicit contract fixture, not Better Auth, SRV-01, DSH, PostgreSQL or a verifier. */
export function remoteFixture() {
  const requests = []; let active = false;
  const remote = {requests, unavailable: false, revoked: false, resourceUnauthorized: false, loginStatus: 200, cookieValue: cookie(),
    deploymentId: config.deploymentId, extraPrincipal: {}, onRequest: undefined,
    async fetch(url, init) {
      const path = new URL(url).pathname; const headers = new Headers(init.headers);
      // Record only booleans / safe metadata, never password, Cookie, raw URL or body.
      requests.push({path, method: init.method, credentialPresent: headers.has('cookie'), origin: headers.get('origin'),
        authorizationPresent: headers.has('authorization'), selfHeaderPresent: headers.has('x-principal-id'), redirect: init.redirect});
      if (remote.onRequest) {const result = await remote.onRequest(path, init); if (result) return result;}
      if (remote.unavailable) throw new Error('synthetic upstream failure containing ' + secret);
      if (path === '/api/auth/sign-in/email') {
        if (remote.loginStatus !== 200) return json({error: {message: secret}}, remote.loginStatus);
        active = true; return json({ok: true}, 200, remote.cookieValue === null ? {} : {'set-cookie': remote.cookieValue});
      }
      if (path === '/api/auth/sign-out') {active = false; remote.revoked = true; return json({ok: true}, 200, {'set-cookie': cookie('') + '; Max-Age=0'});}
      const authenticated = active && !remote.revoked && headers.get('cookie')?.includes(secret);
      if (!authenticated) return json({error: {code: 'AUTH_REQUIRED'}}, 401);
      if (path === '/v1/identity/principals/' + B) return json({error: {code: 'AUTH_FORBIDDEN'}}, 403);
      if (path !== '/v1/identity/me' && remote.resourceUnauthorized) return json({error: {code: 'AUTH_REQUIRED'}}, 401);
      if (path.startsWith('/v1/identity')) return json({principal: {...principal(A), deploymentId: remote.deploymentId, ...remote.extraPrincipal}});
      return json({owner: A, echo: secret, nested: {token: secret, value: 'public'}});
    },
  };
  return remote;
}
export function setup(extraConfig = {}, initial) {
  const remote = remoteFixture(); const store = memoryStore(initial);
  const controller = new IdentityController({...config, ...extraConfig}, store, remote.fetch);
  return {remote, store, controller};
}
export function deferred() {let resolve, reject; const promise = new Promise((ok, no) => {resolve = ok; reject = no;}); return {promise, resolve, reject};}

import type { Json, PluginConfig, PrincipalDTO, ScopedRequest, StoredObservation } from './contracts.js';
import { SESSION_STATUSES } from './contracts.js';
import { IdentityClientError } from './errors.js';
export const INITIAL_OBSERVATION: StoredObservation = Object.freeze({schemaVersion: 1, revision: 0, status: 'signed_out', observedAt: null, logoutPending: false});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_KEY = /(?:password|token|cookie|authorization|credential|secret|signer|session|private.?key)/i;
export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function configOf(config: PluginConfig): Required<PluginConfig> {
  if (!object(config) || typeof config.identityOrigin !== 'string') throw new IdentityClientError('IDENTITY_INPUT_INVALID', 400);
  let url: URL;
  try { url = new URL(config.identityOrigin); } catch { throw new IdentityClientError('IDENTITY_INPUT_INVALID', 400); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      config.identityOrigin.replace(/\/$/, '') !== url.origin ||
      !(url.protocol === 'https:' || (config.allowInsecureLoopback === true && loopback && url.protocol === 'http:'))) {
    throw new IdentityClientError('IDENTITY_ORIGIN_REJECTED', 400);
  }
  if (typeof config.deploymentId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/.test(config.deploymentId)) throw new IdentityClientError('IDENTITY_INPUT_INVALID', 400);
  if (config.requiredLogin !== undefined && typeof config.requiredLogin !== 'boolean') throw new IdentityClientError('IDENTITY_INPUT_INVALID', 400);
  const timeoutMs = config.timeoutMs ?? 10000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 60000) throw new IdentityClientError('IDENTITY_INPUT_INVALID', 400);
  if (config.protectedPrefixes !== undefined && (!Array.isArray(config.protectedPrefixes) || config.protectedPrefixes.some(p => typeof p !== 'string'))) throw new IdentityClientError('IDENTITY_INPUT_INVALID', 400);
  const prefixes = [...(config.protectedPrefixes ?? ['/v1/identity'])];
  if (prefixes.length > 32 || prefixes.some(p => !/^\/v1\/[a-z][a-z0-9_-]*(?:\/[a-z][a-z0-9_-]*)*$/.test(p))) throw new IdentityClientError('REQUEST_NOT_ALLOWED', 400);
  return Object.freeze({identityOrigin: url.origin, deploymentId: config.deploymentId, requiredLogin: config.requiredLogin ?? false,
    allowInsecureLoopback: config.allowInsecureLoopback ?? false, protectedPrefixes: Object.freeze(prefixes), timeoutMs});
}
export function principalOf(value: unknown, deploymentId: string): PrincipalDTO {
  if (!object(value) || !object(value.principal)) throw new IdentityClientError('UPSTREAM_INVALID_RESPONSE');
  const p = value.principal;
  if (typeof p.principalId !== 'string' || !UUID.test(p.principalId) || typeof p.deploymentId !== 'string' ||
      typeof p.displayName !== 'string' || p.displayName.length < 1 || p.displayName.length > 120 ||
      !Array.isArray(p.scopes) || p.scopes.some(s => s !== 'identity:read:self' && s !== 'identity:update:self')) {
    throw new IdentityClientError('UPSTREAM_INVALID_RESPONSE');
  }
  if (p.deploymentId !== deploymentId) throw new IdentityClientError('IDENTITY_DEPLOYMENT_MISMATCH', 403);
  return Object.freeze({principalId: p.principalId, deploymentId: p.deploymentId, displayName: p.displayName,
    scopes: Object.freeze([...new Set(p.scopes)]) as PrincipalDTO['scopes']});
}
export function observationOf(value: unknown): StoredObservation {
  if (!object(value) || Object.keys(value).sort().join(',') !== 'logoutPending,observedAt,revision,schemaVersion,status' ||
      value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 ||
      !SESSION_STATUSES.includes(value.status as typeof SESSION_STATUSES[number]) ||
      !(value.observedAt === null || (typeof value.observedAt === 'string' && Number.isFinite(Date.parse(value.observedAt)))) ||
      typeof value.logoutPending !== 'boolean') throw new IdentityClientError('STORAGE_UNAVAILABLE');
  return Object.freeze({...value}) as unknown as StoredObservation;
}
export function loginOf(value: unknown): {email: string; password: string} {
  if (!object(value) || Object.keys(value).sort().join(',') !== 'email,password' || typeof value.email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email) || value.email.length > 254 ||
      typeof value.password !== 'string' || value.password.length < 12 || value.password.length > 128) {
    throw new IdentityClientError('IDENTITY_INPUT_INVALID', 400);
  }
  return {email: value.email, password: value.password};
}
export function requestOf(value: ScopedRequest, config: Required<PluginConfig>): {url: URL; method: string; body?: string} {
  if (!object(value) || Object.keys(value).some(k => !['path','method','body'].includes(k)) || typeof value.path !== 'string' ||
      value.path.length > 2048 || !/^\/v1\/[A-Za-z0-9/_?&=.%~:+-]+$/.test(value.path) || value.path.includes('//')) {
    throw new IdentityClientError('REQUEST_NOT_ALLOWED', 400);
  }
  const path = value.path;
  // Refuse ambiguous encoding before WHATWG URL normalization can hide traversal.
  if (/%(?:2e|2f|5c|25|0[0-9a-f]|7f)/i.test(path) || /(?:^|\/)\.{1,2}(?:\/|\?|$)/.test(path)) throw new IdentityClientError('REQUEST_NOT_ALLOWED', 400);
  let url: URL;
  try { decodeURIComponent(path); url = new URL(path, config.identityOrigin); } catch { throw new IdentityClientError('REQUEST_NOT_ALLOWED', 400); }
  if (url.origin !== config.identityOrigin || !config.protectedPrefixes.some(p => url.pathname === p || url.pathname.startsWith(p + '/')) ||
      [...url.searchParams.keys()].some(k => SECRET_KEY.test(k))) throw new IdentityClientError('REQUEST_NOT_ALLOWED', 400);
  const method = value.method ?? 'GET';
  if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(method) || (method === 'GET' && value.body !== undefined)) throw new IdentityClientError('REQUEST_NOT_ALLOWED', 400);
  let body: string | undefined;
  if (value.body !== undefined) {
    try { body = JSON.stringify(value.body); } catch { throw new IdentityClientError('IDENTITY_INPUT_INVALID', 400); }
    if (typeof body !== 'string' || new TextEncoder().encode(body).length > 16384) throw new IdentityClientError('IDENTITY_INPUT_INVALID', 400);
  }
  if (url.pathname.startsWith('/v1/identity')) {
    if (url.search || !((method === 'GET' && (url.pathname === '/v1/identity/me' || /^\/v1\/identity\/principals\/[0-9a-f-]{36}$/i.test(url.pathname))) ||
      (method === 'PATCH' && url.pathname === '/v1/identity/me'))) throw new IdentityClientError('REQUEST_NOT_ALLOWED', 400);
    if (method === 'PATCH' && (!object(value.body) || Object.keys(value.body).join(',') !== 'displayName' ||
      typeof value.body.displayName !== 'string' || !value.body.displayName.trim() || value.body.displayName.length > 120)) throw new IdentityClientError('IDENTITY_INPUT_INVALID', 400);
  }
  return body === undefined ? {url, method} : {url, method, body};
}
/** JSON-only public results; suppress credential-shaped keys and echoed in-memory cookie bytes. */
export function publicJson(value: unknown, secrets: readonly string[] = [], depth = 0): Json {
  if (depth > 32) throw new IdentityClientError('UPSTREAM_INVALID_RESPONSE');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return secrets.some(s => s.length > 0 && value.includes(s)) ? '[redacted]' : value;
  if (Array.isArray(value)) return value.map(v => publicJson(v, secrets, depth + 1));
  if (object(value)) {
    const out: Record<string, Json> = Object.create(null) as Record<string, Json>;
    for (const [key, val] of Object.entries(value)) if (!SECRET_KEY.test(key) && !['__proto__','prototype','constructor'].includes(key)) out[key] = publicJson(val, secrets, depth + 1);
    return out;
  }
  throw new IdentityClientError('UPSTREAM_INVALID_RESPONSE');
}

import type { Json, PluginConfig } from './contracts.js';
import { IdentityClientError } from './errors.js';
import { publicJson } from './validation.js';
interface MemoryCookie {name: string; value: string; path: string; expires: number; secure: boolean}
interface WireResult {status: number; data: Json}
/** Host-private carrier. Never publishes Cookie or Set-Cookie through its result. */
export class IdentityTransport {
  readonly #config: Required<PluginConfig>;
  readonly #fetcher: typeof fetch;
  #cookies = new Map<string, MemoryCookie>();
  constructor(config: Required<PluginConfig>, fetcher: typeof fetch = globalThis.fetch) {
    this.#config = config; this.#fetcher = fetcher;
  }
  clear(): void { this.#cookies.clear(); }
  hasCredentials(): boolean { return this.#cookieHeader('/v1/identity/me').length > 0; }
  #cookieHeader(path: string): string {
    const now = Date.now();
    for (const [key, cookie] of this.#cookies) if (cookie.expires <= now) this.#cookies.delete(key);
    return [...this.#cookies.values()].filter(c => path === c.path || path.startsWith(c.path.endsWith('/') ? c.path : c.path + '/'))
      .sort((a, b) => b.path.length - a.path.length).map(c => `${c.name}=${c.value}`).join('; ');
  }
  #acceptCookies(headers: Headers): void {
    const origin = new URL(this.#config.identityOrigin);
    const next = new Map(this.#cookies);
    for (const text of headers.getSetCookie()) {
      if (text.length > 8192 || /[\r\n]/.test(text)) throw new IdentityClientError('UPSTREAM_INVALID_RESPONSE');
      const [pair = '', ...parts] = text.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim(), value = pair.slice(eq + 1).trim();
      if (eq <= 0 || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || !/^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*$/.test(value)) throw new IdentityClientError('UPSTREAM_INVALID_RESPONSE');
      const attrs = new Map<string, string>();
      for (const part of parts) {
        const [key = '', ...rest] = part.trim().split('=');
        const normalized = key.toLowerCase();
        if (attrs.has(normalized)) throw new IdentityClientError('UPSTREAM_INVALID_RESPONSE');
        attrs.set(normalized, rest.join('='));
      }
      const path = attrs.get('path') ?? '/';
      const domain = attrs.get('domain')?.replace(/^\./, '').toLowerCase();
      if (!attrs.has('httponly') || !path.startsWith('/') || (domain !== undefined && domain !== origin.hostname.toLowerCase()) ||
          (origin.protocol === 'https:' && !attrs.has('secure')) ||
          (origin.protocol !== 'https:' && attrs.has('secure')) ||
          (name.startsWith('__Host-') && (domain !== undefined || path !== '/' || !attrs.has('secure'))) ||
          (name.startsWith('__Secure-') && !attrs.has('secure'))) throw new IdentityClientError('UPSTREAM_INVALID_RESPONSE');
      let expires = Number.POSITIVE_INFINITY;
      if (attrs.has('expires')) {
        expires = Date.parse(attrs.get('expires')!);
        if (!Number.isFinite(expires)) throw new IdentityClientError('UPSTREAM_INVALID_RESPONSE');
      }
      if (attrs.has('max-age')) {
        const ageText = attrs.get('max-age')!;
        if (!/^-?\d+$/.test(ageText)) throw new IdentityClientError('UPSTREAM_INVALID_RESPONSE');
        const age = Number(ageText);
        if (!Number.isSafeInteger(age)) throw new IdentityClientError('UPSTREAM_INVALID_RESPONSE');
        expires = Date.now() + Math.max(age, 0) * 1000;
      }
      const key = name + ':' + path;
      if (!value || expires <= Date.now()) next.delete(key);
      else next.set(key, {name, value, path, expires, secure: attrs.has('secure')});
    }
    if (next.size > 8) throw new IdentityClientError('UPSTREAM_INVALID_RESPONSE');
    this.#cookies = next;
  }
  async auth(kind: 'login' | 'logout', body: string, signal: AbortSignal): Promise<WireResult> {
    const path = kind === 'login' ? '/api/auth/sign-in/email' : '/api/auth/sign-out';
    return this.#send(new URL(path, this.#config.identityOrigin), 'POST', body, signal, true);
  }
  async readPrincipal(signal: AbortSignal): Promise<WireResult> {
    return this.#send(new URL('/v1/identity/me', this.#config.identityOrigin), 'GET', undefined, signal, false);
  }
  async resource(url: URL, method: string, body: string | undefined, signal: AbortSignal): Promise<WireResult> {
    return this.#send(url, method, body, signal, false);
  }
  async #send(url: URL, method: string, body: string | undefined, callerSignal: AbortSignal, acceptCookies: boolean): Promise<WireResult> {
    if (url.origin !== this.#config.identityOrigin) throw new IdentityClientError('REQUEST_NOT_ALLOWED', 400);
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), this.#config.timeoutMs);
    const signal = AbortSignal.any([callerSignal, timeout.signal]);
    const headers = new Headers({'accept': 'application/json', 'accept-encoding': 'identity'});
    const cookie = this.#cookieHeader(url.pathname);
    if (cookie) headers.set('cookie', cookie);
    if (method !== 'GET') {
      headers.set('origin', this.#config.identityOrigin);
      headers.set('content-type', 'application/json');
    }
    try {
      const init: RequestInit = {method, headers, signal, redirect: 'error', cache: 'no-store', credentials: 'omit'};
      if (body !== undefined) init.body = body;
      // Native browser fetch requires its receiver. This carrier runs on the host,
      // but keeping the receiver also protects alternate Fetch implementations.
      const response = await this.#fetcher.call(globalThis, url, init);
      if (callerSignal.aborted) throw new IdentityClientError('OPERATION_SUPERSEDED', 409);
      if (timeout.signal.aborted) throw new IdentityClientError('AUTH_UNAVAILABLE');
      if (response.redirected || (response.url && new URL(response.url).origin !== url.origin)) throw new IdentityClientError('UPSTREAM_INVALID_RESPONSE');
      const contentType = response.headers.get('content-type') ?? '';
      if (response.status === 204) return {status: 204, data: null};
      if (!/^application\/json(?:\s*;|$)/i.test(contentType)) throw new IdentityClientError('UPSTREAM_INVALID_RESPONSE');
      const limit = 1024 * 1024;
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = []; let total = 0;
      if (reader) {
        try {
          while (true) {
            const {done, value} = await reader.read(); if (done) break;
            total += value.byteLength;
            if (total > limit) { await reader.cancel(); throw new IdentityClientError('UPSTREAM_INVALID_RESPONSE'); }
            chunks.push(value);
          }
        } finally { reader.releaseLock(); }
      }
      const all = new Uint8Array(total); let offset = 0;
      for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength; }
      let raw: unknown;
      try { raw = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(all)); }
      catch { throw new IdentityClientError('UPSTREAM_INVALID_RESPONSE'); }
      // Cookies are accepted only after a successful, exact SRV-01 auth response.
      if (callerSignal.aborted) throw new IdentityClientError('OPERATION_SUPERSEDED', 409);
      if (timeout.signal.aborted) throw new IdentityClientError('AUTH_UNAVAILABLE');
      if (acceptCookies && response.status === 200) {
        if (typeof raw !== 'object' || raw === null || !('ok' in raw) || raw.ok !== true || Object.keys(raw).length !== 1) throw new IdentityClientError('UPSTREAM_INVALID_RESPONSE');
        this.#acceptCookies(response.headers);
      }
      const secrets = [...this.#cookies.values()].flatMap(c => [c.value, `${c.name}=${c.value}`]);
      return {status: response.status, data: publicJson(raw, secrets)};
    } catch (error) {
      if (callerSignal.aborted) throw new IdentityClientError('OPERATION_SUPERSEDED', 409);
      if (error instanceof IdentityClientError) throw error;
      throw new IdentityClientError('AUTH_UNAVAILABLE');
    } finally { clearTimeout(timer); }
  }
}

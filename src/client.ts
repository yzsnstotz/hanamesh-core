/** Browser SDK; talks only to the authenticated DSH carrier. No credential or login API. */
import type { IdentityCheck, ScopedRequest, ScopedResponse, SessionSnapshot } from './contracts.js';
import { SESSION_STATUSES } from './contracts.js';
import { IdentityClientError, responseError } from './errors.js';
import { object } from './validation.js';
const ROOT = '/api/hanamesh/identity/';
export class BrowserIdentityClient {
  readonly #origin: string;
  readonly #fetcher: typeof fetch;
  constructor(origin: string = globalThis.location.origin, fetcher: typeof fetch = globalThis.fetch) {
    const url = new URL(origin);
    if (url.origin !== origin.replace(/\/$/, '') || !['http:', 'https:'].includes(url.protocol) ||
        (typeof globalThis.location !== 'undefined' && globalThis.location.origin !== url.origin)) throw new IdentityClientError('IDENTITY_ORIGIN_REJECTED', 403);
    this.#origin = url.origin; this.#fetcher = fetcher;
  }
  async #call(path: string, input?: unknown): Promise<unknown> {
    const init: RequestInit = {method: input === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: {'accept': 'application/json'}};
    if (input !== undefined) { init.headers = {'content-type': 'application/json', 'accept': 'application/json'}; init.body = JSON.stringify(input); }
    let response: Response;
    try { response = await this.#fetcher.call(globalThis, new URL(ROOT + path, this.#origin), init); }
    catch { throw new IdentityClientError('AUTH_UNAVAILABLE'); }
    if (!response.ok) throw responseError(response.status);
    try { return await response.json(); } catch { throw new IdentityClientError('UPSTREAM_INVALID_RESPONSE'); }
  }
  async state(): Promise<SessionSnapshot> {
    const value = await this.#call('state');
    if (!object(value) || value.protocolVersion !== '1' || !SESSION_STATUSES.includes(value.status as SessionSnapshot['status'])) throw new IdentityClientError('UPSTREAM_INVALID_RESPONSE');
    return value as unknown as SessionSnapshot;
  }
  async checkIdentity(): Promise<IdentityCheck> {
    const value = await this.#call('refresh', {});
    if (!object(value) || typeof value.serviceReady !== 'boolean' || typeof value.authenticated !== 'boolean' || value.resourceAuthorization !== 'not-evaluated') throw new IdentityClientError('UPSTREAM_INVALID_RESPONSE');
    return value as unknown as IdentityCheck;
  }
  async request(input: ScopedRequest): Promise<ScopedResponse> {
    const value = await this.#call('request', input);
    if (!object(value) || typeof value.status !== 'number' || !('data' in value)) throw new IdentityClientError('UPSTREAM_INVALID_RESPONSE');
    return value as unknown as ScopedResponse;
  }
}

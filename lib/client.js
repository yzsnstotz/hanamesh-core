import { SESSION_STATUSES } from './contracts.js';
import { IdentityClientError, responseError } from './errors.js';
import { object } from './validation.js';
const ROOT = '/api/hanamesh/identity/';
export class BrowserIdentityClient {
    #origin;
    #fetcher;
    constructor(origin = globalThis.location.origin, fetcher = globalThis.fetch) {
        const url = new URL(origin);
        if (url.origin !== origin.replace(/\/$/, '') || !['http:', 'https:'].includes(url.protocol) ||
            (typeof globalThis.location !== 'undefined' && globalThis.location.origin !== url.origin))
            throw new IdentityClientError('IDENTITY_ORIGIN_REJECTED', 403);
        this.#origin = url.origin;
        this.#fetcher = fetcher;
    }
    async #call(path, input) {
        const init = { method: input === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { 'accept': 'application/json' } };
        if (input !== undefined) {
            init.headers = { 'content-type': 'application/json', 'accept': 'application/json' };
            init.body = JSON.stringify(input);
        }
        let response;
        try {
            response = await this.#fetcher.call(globalThis, new URL(ROOT + path, this.#origin), init);
        }
        catch {
            throw new IdentityClientError('AUTH_UNAVAILABLE');
        }
        if (!response.ok)
            throw responseError(response.status);
        try {
            return await response.json();
        }
        catch {
            throw new IdentityClientError('UPSTREAM_INVALID_RESPONSE');
        }
    }
    async state() {
        const value = await this.#call('state');
        if (!object(value) || value.protocolVersion !== '1' || !SESSION_STATUSES.includes(value.status))
            throw new IdentityClientError('UPSTREAM_INVALID_RESPONSE');
        return value;
    }
    async checkIdentity() {
        const value = await this.#call('refresh', {});
        if (!object(value) || typeof value.serviceReady !== 'boolean' || typeof value.authenticated !== 'boolean' || value.resourceAuthorization !== 'not-evaluated')
            throw new IdentityClientError('UPSTREAM_INVALID_RESPONSE');
        return value;
    }
    async request(input) {
        const value = await this.#call('request', input);
        if (!object(value) || typeof value.status !== 'number' || !('data' in value))
            throw new IdentityClientError('UPSTREAM_INVALID_RESPONSE');
        return value;
    }
}

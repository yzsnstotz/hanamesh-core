import { IdentityClientError, responseError, safeError } from './errors.js';
import { configOf, loginOf, observationOf, principalOf, requestOf } from './validation.js';
import { IdentityTransport } from './transport.js';
/** Single owner per DSH profile. Not a multi-user server or plugin security sandbox. */
export class IdentityController {
    #config;
    #store;
    #transport;
    #state;
    #revision = 0;
    #generation = 0;
    #abort = new AbortController();
    #tail = Promise.resolve();
    #listeners = new Set();
    #disposed = false;
    #logoutPending = false;
    #unconfirmedPriorRevocation = false;
    service;
    constructor(config, store, fetcher) {
        this.#config = configOf(config);
        this.#store = store;
        this.#transport = new IdentityTransport(this.#config, fetcher);
        this.#state = this.#snapshot('signed_out', null, null, null);
        try {
            const stored = observationOf(store.read());
            this.#revision = stored.revision;
            this.#logoutPending = stored.logoutPending;
            this.#unconfirmedPriorRevocation = stored.logoutPending;
            // Stored status is a breadcrumb, never a recovered login or a principal.
            const status = stored.status === 'signed_out' ? 'signed_out' : 'expired';
            this.#state = this.#snapshot(status, null, null, stored.logoutPending ? 'REVOCATION_UNCONFIRMED' : status === 'expired' ? 'SESSION_RESTARTED' : null);
        }
        catch {
            this.#state = this.#snapshot('unavailable', null, false, 'STORAGE_UNAVAILABLE', 'unavailable');
        }
        this.service = Object.freeze({
            getState: () => this.#state,
            subscribe: (listener) => this.subscribe(listener),
            checkIdentity: () => this.checkIdentity(),
            request: (request) => this.request(request),
            checkLocalAccess: (kind) => Object.freeze({
                allowed: (kind === 'local' || kind === 'protected') && !this.#disposed && ((kind === 'local' && !this.#config.requiredLogin) || this.#state.status === 'signed_in'),
                resourceAuthorization: 'not-evaluated',
            }),
        });
    }
    getState() { return this.#state; }
    subscribe(listener) {
        if (this.#disposed)
            throw new IdentityClientError('DISPOSED');
        this.#listeners.add(listener);
        try {
            listener(this.#state);
        }
        catch { /* Observers do not affect committed state. */ }
        return () => { this.#listeners.delete(listener); };
    }
    #snapshot(status, principal, serviceReady, reason, persistence = 'ready') {
        return Object.freeze({ protocolVersion: '1', status, serviceReady, principal: status === 'signed_in' ? principal : null,
            checkedAt: status === 'signed_in' ? new Date().toISOString() : null, reason,
            requiredLogin: this.#config.requiredLogin, protectedOperations: status === 'signed_in' ? 'resource-check-required' : 'blocked',
            privateWork: 'preserved', logoutPending: this.#logoutPending, persistence });
    }
    #emit() { for (const fn of this.#listeners) {
        try {
            fn(this.#state);
        }
        catch { /* isolate observer */ }
    } }
    #check(generation) {
        if (this.#disposed)
            throw new IdentityClientError('DISPOSED');
        if (generation !== this.#generation || this.#abort.signal.aborted)
            throw new IdentityClientError('OPERATION_SUPERSEDED', 409);
    }
    #fence(status, reason) {
        if (this.#disposed)
            throw new IdentityClientError('DISPOSED');
        ++this.#generation;
        this.#abort.abort();
        this.#abort = new AbortController();
        this.#state = this.#snapshot(status, null, this.#state.serviceReady, reason, this.#state.persistence);
        this.#emit();
        return this.#generation;
    }
    #enqueue(action) {
        const result = this.#tail.then(action);
        this.#tail = result.catch(() => undefined);
        return result;
    }
    async #publish(generation, status, principal, ready, reason) {
        this.#check(generation);
        try {
            await this.#store.publish({ schemaVersion: 1, revision: this.#revision + 1, status, observedAt: new Date().toISOString(), logoutPending: this.#logoutPending });
            ++this.#revision;
        }
        catch {
            this.#check(generation);
            this.#state = this.#snapshot('unavailable', null, false, 'STORAGE_UNAVAILABLE', 'unavailable');
            this.#emit();
            throw new IdentityClientError('STORAGE_UNAVAILABLE');
        }
        this.#check(generation);
        this.#state = this.#snapshot(status, principal, ready, reason);
        this.#emit();
    }
    async #fail(generation, error, login = false) {
        this.#check(generation);
        const safe = safeError(error);
        if (safe.code === 'OPERATION_SUPERSEDED' || safe.code === 'DISPOSED')
            throw safe;
        if (safe.code === 'STORAGE_UNAVAILABLE')
            throw safe;
        if (safe.status === 401 || safe.status === 403) {
            this.#transport.clear();
            await this.#publish(generation, login ? 'signed_out' : 'expired', null, true, login && safe.status === 401 ? 'IDENTITY_AUTH_FAILED' : safe.code);
        }
        else if (login && [400, 404, 429].includes(safe.status)) {
            await this.#publish(generation, 'signed_out', null, true, safe.code);
        }
        else {
            await this.#publish(generation, 'unavailable', null, false, safe.code);
        }
        throw safe;
    }
    /** Owner/UI-only. Not exported on ctx.hanameshIdentity or the ordinary plugin SDK. */
    signIn(input) {
        let login;
        try {
            login = loginOf(input);
        }
        catch (error) {
            return Promise.reject(error);
        }
        if (this.#transport.hasCredentials())
            return Promise.reject(new IdentityClientError('REVOCATION_UNCONFIRMED', 409)); // Revoke the current credential before switching accounts.
        if (this.#logoutPending)
            this.#unconfirmedPriorRevocation = true;
        const generation = this.#fence('signing_in', null);
        this.#transport.clear();
        return this.#enqueue(async () => {
            this.#check(generation);
            await this.#publish(generation, 'signing_in', null, null, null);
            try {
                const result = await this.#transport.auth('login', JSON.stringify(login), this.#abort.signal);
                login = { email: '', password: '' };
                this.#check(generation);
                if (result.status !== 200)
                    throw responseError(result.status);
                if (!this.#transport.hasCredentials())
                    throw new IdentityClientError('UPSTREAM_INVALID_RESPONSE');
                const verified = await this.#transport.readPrincipal(this.#abort.signal);
                this.#check(generation);
                if (verified.status !== 200)
                    throw responseError(verified.status);
                const principal = principalOf(verified.data, this.#config.deploymentId);
                // Preserve a previous unconfirmed revocation breadcrumb; new login is not proof of old revocation.
                await this.#publish(generation, 'signed_in', principal, true, null);
                return this.#state;
            }
            catch (error) {
                if (generation === this.#generation)
                    this.#transport.clear();
                return this.#fail(generation, error, true);
            }
            finally {
                login = { email: '', password: '' };
            }
        });
    }
    signOut() {
        this.#logoutPending = true;
        const generation = this.#fence('expired', 'REVOCATION_UNCONFIRMED');
        return this.#enqueue(async () => {
            this.#check(generation);
            // Deny immediately even if the domain is already closing; keep the credential
            // privately only for a revocation retry, never for a protected request.
            let persistenceFailed = false;
            try {
                await this.#publish(generation, 'expired', null, this.#state.serviceReady, 'REVOCATION_UNCONFIRMED');
            }
            catch (error) {
                if (safeError(error).code !== 'STORAGE_UNAVAILABLE')
                    throw error;
                persistenceFailed = true;
            }
            try {
                const hadCredential = this.#transport.hasCredentials();
                const result = await this.#transport.auth('logout', '{}', this.#abort.signal);
                this.#check(generation);
                if (result.status !== 200)
                    throw responseError(result.status);
                this.#transport.clear();
                // With no memory credential (e.g. after restart), a no-op sign-out cannot
                // prove revocation of the earlier server-side session.
                if (hadCredential && !this.#unconfirmedPriorRevocation)
                    this.#logoutPending = false;
                if (persistenceFailed)
                    throw new IdentityClientError('STORAGE_UNAVAILABLE');
                await this.#publish(generation, 'expired', null, true, this.#logoutPending ? 'REVOCATION_UNCONFIRMED' : 'SIGNED_OUT');
                return this.#state;
            }
            catch (error) {
                return this.#fail(generation, error);
            }
        });
    }
    async #refresh(generation) {
        this.#check(generation);
        if (this.#logoutPending && this.#state.status !== 'signed_in' && this.#transport.hasCredentials())
            throw new IdentityClientError('REVOCATION_UNCONFIRMED', 409);
        try {
            const result = await this.#transport.readPrincipal(this.#abort.signal);
            this.#check(generation);
            if (result.status === 401) {
                this.#transport.clear();
                const status = this.#state.status === 'signed_out' ? 'signed_out' : 'expired';
                await this.#publish(generation, status, null, true, status === 'expired' ? 'AUTH_REQUIRED' : null);
                return null;
            }
            if (result.status !== 200)
                throw responseError(result.status);
            if (!this.#transport.hasCredentials())
                throw new IdentityClientError('UPSTREAM_INVALID_RESPONSE');
            const principal = principalOf(result.data, this.#config.deploymentId);
            await this.#publish(generation, 'signed_in', principal, true, null);
            return principal;
        }
        catch (error) {
            return this.#fail(generation, error);
        }
    }
    checkIdentity() {
        const generation = this.#generation;
        return this.#enqueue(async () => {
            const principal = await this.#refresh(generation);
            return Object.freeze({ serviceReady: true, authenticated: principal !== null, resourceAuthorization: 'not-evaluated' });
        });
    }
    request(input) {
        let request;
        try {
            request = requestOf(input, this.#config);
        }
        catch (error) {
            return Promise.reject(error);
        }
        const generation = this.#generation;
        return this.#enqueue(async () => {
            this.#check(generation);
            if (this.#state.status !== 'signed_in')
                throw new IdentityClientError(this.#state.status === 'unavailable' ? 'AUTH_UNAVAILABLE' : 'AUTH_REQUIRED', this.#state.status === 'unavailable' ? 503 : 401); // MUTATION: local-guard
            const principal = await this.#refresh(generation);
            if (!principal)
                throw new IdentityClientError('AUTH_REQUIRED', 401);
            this.#check(generation);
            let response;
            try {
                response = await this.#transport.resource(request.url, request.method, request.body, this.#abort.signal);
            }
            catch (error) {
                return this.#fail(generation, error);
            }
            this.#check(generation);
            if (response.status === 401)
                return this.#fail(generation, responseError(401));
            if (response.status === 403)
                throw responseError(403); // MUTATION: resource-denial
            if (response.status >= 500)
                return this.#fail(generation, responseError(response.status));
            if (response.status < 200 || response.status >= 300)
                throw responseError(response.status);
            // Identity DTOs use the locked, narrow contract. Arbitrary resource JSON has
            // already passed the transport's credential suppression and size limit.
            if (request.url.pathname.startsWith('/v1/identity/')) {
                const p = principalOf(response.data, this.#config.deploymentId);
                if (p.principalId !== principal.principalId)
                    throw new IdentityClientError('UPSTREAM_INVALID_RESPONSE');
                return Object.freeze({ status: response.status, data: { principal: { ...p, scopes: [...p.scopes] } } });
            }
            return Object.freeze(response);
        });
    }
    async dispose() {
        if (this.#disposed)
            return;
        this.#disposed = true;
        ++this.#generation;
        this.#abort.abort();
        this.#transport.clear();
        this.#state = this.#snapshot('unavailable', null, false, 'DISPOSED');
        this.#emit();
        this.#listeners.clear();
        try {
            await this.#tail;
        }
        finally {
            await this.#store.close();
        }
    }
}

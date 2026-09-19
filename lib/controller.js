import { createHash } from 'node:crypto';
import { createDevice, requestNonce, signWithDevice } from './device.js';
import { CoreError, safeError } from './errors.js';
import { registerDevice } from './registration.js';
import { ServerTransport } from './transport.js';
import { openExternal as openSystemExternal } from './external.js';
import { configOf, publicJson, snapshotOf } from './validation.js';
const COLD_HEALTH = Object.freeze({ revision: 0, mode: 'repair', components: Object.freeze([]), fault: 'CHECK_NOT_RUN' });
export class SessionController {
    #config;
    #store;
    #transport;
    #state;
    #publishTail = Promise.resolve();
    #disposed = false;
    #retryTimer = null;
    #contributionsTimer = null;
    #health = null;
    #usageReady = null;
    #contributions = Object.freeze({ status: 'unavailable', reason: 'NOT_CONNECTED' });
    #contributionsCheckedAt = 0;
    #consentListeners = new Set();
    service;
    constructor(config, store, fetcher) {
        this.#config = configOf(config);
        this.#store = store;
        this.#transport = new ServerTransport(this.#config.serverOrigin, this.#config.timeoutMs, fetcher);
        this.#state = snapshotOf(store.read());
        this.service = Object.freeze({
            protocolVersion: '1',
            getDeviceId: () => this.#device().deviceId,
            getPublicKey: () => this.#device().publicKey,
            sign: (bytes) => signWithDevice(this.#device(), bytes),
            signRequest: (input) => this.#signRequest(input),
            getConsent: () => this.#state.consent.state,
            onConsentChange: (listener) => {
                this.#consentListeners.add(listener);
                return () => { this.#consentListeners.delete(listener); };
            },
            getSession: () => this.#session(),
            getServerOrigin: () => this.#config.serverOrigin,
            getHealth: () => this.#health?.getHealth() ?? COLD_HEALTH,
        });
    }
    static async create(config, store, options = {}) {
        const controller = new SessionController(config, store, options.fetcher);
        if (controller.#state.device === null) {
            await controller.#publish(current => ({ ...current, revision: current.revision + 1, device: createDevice() }));
        }
        return controller;
    }
    #device() {
        if (this.#disposed)
            throw new CoreError('CORE_DISPOSED', 503);
        if (!this.#state.device)
            throw new CoreError('CORE_NOT_READY', 503);
        return this.#state.device;
    }
    async #publish(update) {
        const publish = this.#publishTail.then(async () => {
            if (this.#disposed)
                throw new CoreError('CORE_DISPOSED', 503);
            const next = typeof update === 'function' ? update(this.#state) : update;
            await this.#store.publish(next);
            this.#state = snapshotOf(next);
        });
        this.#publishTail = publish.catch(() => undefined);
        await publish;
    }
    #session() {
        const device = this.#device();
        return Object.freeze({
            protocolVersion: '1',
            deviceId: device.deviceId,
            registration: this.#state.registration.status,
            principalId: this.#state.registration.principalId,
            bound: null,
            serverReachable: this.#state.serverObservation.reachable,
            checkedAt: this.#state.serverObservation.checkedAt,
            reason: this.#state.registration.lastError,
        });
    }
    async #signRequest(input) {
        if (!input || typeof input.method !== 'string' || typeof input.path !== 'string' || (input.body !== null && !(input.body instanceof Uint8Array)))
            throw new CoreError('CORE_INPUT_INVALID', 400);
        const timestamp = Math.floor(Date.now() / 1000).toString();
        let nonce = requestNonce();
        if (this.#config.authNonceSource === 'server') {
            const response = await this.#transport.request('/v1/identity/devices/challenge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ purpose: 'auth' }) });
            if (!response.ok)
                throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
            const challenge = await response.json();
            if (typeof challenge.nonce !== 'string' || !challenge.nonce)
                throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
            nonce = challenge.nonce;
        }
        const bodyHash = createHash('sha256').update(input.body ?? new Uint8Array()).digest('hex');
        const canonical = new TextEncoder().encode(`${input.method.toUpperCase()}\n${input.path}\n${timestamp}\n${nonce}\n${bodyHash}`);
        return Object.freeze({
            'x-hm-device-id': this.#device().deviceId,
            'x-hm-timestamp': timestamp,
            'x-hm-nonce': nonce,
            'x-hm-signature': Buffer.from(signWithDevice(this.#device(), canonical)).toString('base64url'),
        });
    }
    async setConsent(state) {
        if (state !== 'granted' && state !== 'withheld')
            throw new CoreError('CORE_INPUT_INVALID', 400);
        const changedAt = new Date().toISOString();
        await this.#publish(current => ({ ...current, revision: current.revision + 1, consent: { state, changedAt } }));
        for (const listener of this.#consentListeners) {
            try {
                listener(state, changedAt);
            }
            catch { /* listener isolation is part of the contract */ }
        }
        return { state, changedAt };
    }
    async register() {
        if (this.#retryTimer) {
            clearTimeout(this.#retryTimer);
            this.#retryTimer = null;
        }
        const attempts = this.#state.registration.attempts + 1;
        const checkedAt = new Date().toISOString();
        try {
            if (!this.#transport.configured)
                throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
            const result = await registerDevice(this.#transport, this.#device());
            await this.#publish(current => ({ ...current, revision: current.revision + 1,
                registration: { status: 'registered', principalId: result.principalId, registeredAt: checkedAt, lastError: null, attempts },
                serverObservation: { reachable: true, checkedAt },
            }));
            return this.#session();
        }
        catch (error) {
            const safe = safeError(error);
            await this.#publish(current => ({ ...current, revision: current.revision + 1,
                registration: { ...current.registration, status: 'failed', lastError: safe.code, attempts },
                serverObservation: { reachable: safe.code === 'CORE_DEVICE_ID_MISMATCH', checkedAt },
            }));
            if (this.#transport.configured && !this.#disposed) {
                const delay = Math.min(15, 2 ** Math.max(0, attempts - 1)) * 60_000;
                this.#retryTimer = setTimeout(() => { this.#retryTimer = null; void this.startRegistration().catch(() => undefined); }, delay);
                this.#retryTimer.unref();
            }
            throw safe;
        }
    }
    async startRegistration() {
        if (!this.#transport.configured || this.#disposed)
            return;
        await this.register();
        this.startContributions();
    }
    startContributions() {
        if (!this.#transport.configured || this.#disposed || this.#contributionsTimer)
            return;
        void this.refreshContributions();
        this.#contributionsTimer = setInterval(() => { void this.refreshContributions(); }, 60_000);
        this.#contributionsTimer.unref();
    }
    attachHealth(provider) {
        if (this.#health)
            throw new CoreError('CORE_INPUT_INVALID', 409);
        this.#health = provider;
    }
    attachUsageProbe(probe) {
        if (this.#usageReady)
            throw new CoreError('CORE_INPUT_INVALID', 409);
        this.#usageReady = probe;
    }
    recheckHealth() {
        if (!this.#health)
            throw new CoreError('CORE_NOT_READY', 503);
        return this.#health.recheck();
    }
    openExternal(url) {
        return openSystemExternal(url, this.#config.websiteOrigin, this.#config.allowSystemBrowser);
    }
    async refreshContributions() {
        if (!this.#transport.configured) {
            this.#contributions = Object.freeze({ status: 'unavailable', reason: 'NOT_CONNECTED' });
            return this.#contributions;
        }
        if (Date.now() - this.#contributionsCheckedAt < 60_000 && this.#contributions.status === 'ready')
            return this.#contributions;
        const to = new Date();
        const from = new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
        const path = `/v1/usage/me/contributions?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
        try {
            const headers = await this.#signRequest({ method: 'GET', path, body: null });
            const response = await this.#transport.request(path, { method: 'GET', headers });
            if (!response.ok)
                throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
            const payload = await response.json();
            if (!Array.isArray(payload.byHana))
                throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
            const actions = { install: 0, open: 0, use: 0, uninstall: 0 };
            for (const row of payload.byHana)
                for (const key of Object.keys(actions)) {
                    const value = row.actions?.[key];
                    if (!Number.isSafeInteger(value) || value < 0)
                        throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
                    actions[key] += value;
                }
            this.#contributions = Object.freeze({ status: 'ready', windowDays: 90, actions: Object.freeze(actions) });
            this.#contributionsCheckedAt = Date.now();
        }
        catch (error) {
            this.#contributions = Object.freeze({ status: 'unavailable', reason: safeError(error).code });
        }
        return this.#contributions;
    }
    state() {
        const device = this.#device();
        const health = this.service.getHealth();
        const components = health.components.map(component => component && typeof component === 'object' && component.id === 'usage'
            ? { ...component, serviceReady: this.#usageReady?.() ?? false }
            : component);
        return publicJson({ deviceId: device.deviceId, publicKey: device.publicKey, registration: this.#state.registration, consent: this.#state.consent,
            session: this.#session(), serverOrigin: this.#config.serverOrigin, websiteOrigin: this.#config.websiteOrigin,
            health: { mode: health.mode, fault: health.fault ?? null }, components, contributions: this.#contributions });
    }
    diagnostics() {
        return publicJson({ protocolVersion: '1', disposed: this.#disposed, serverOrigin: this.#config.serverOrigin, websiteOrigin: this.#config.websiteOrigin });
    }
    async dispose() {
        if (this.#disposed)
            return;
        this.#disposed = true;
        if (this.#retryTimer)
            clearTimeout(this.#retryTimer);
        if (this.#contributionsTimer)
            clearInterval(this.#contributionsTimer);
        this.#retryTimer = null;
        this.#contributionsTimer = null;
        this.#consentListeners.clear();
        await this.#publishTail;
        await this.#store.close();
    }
}

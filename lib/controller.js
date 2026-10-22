import { createBindLink } from './bind-link.js';
import { createHash } from 'node:crypto';
import { createDevice, requestNonce, signWithDevice } from './device.js';
import { CoreError, safeError, upstreamError, upstreamJson, upstreamFacts } from './errors.js';
import { registerDevice } from './registration.js';
import { ServerTransport } from './transport.js';
import { openExternal as openSystemExternal } from './external.js';
import { configOf, publicJson, serverOriginOf, snapshotOf } from './validation.js';
import { SUITE_MANIFEST } from './suite/index.js';
import { SuiteDeclarationService } from './suite/service.js';
import { RegistryMetadataReader } from './suite/registry.js';
import { OWN_PACKAGE, OWN_PROFILE } from './suite/own.js';
const COLD_HEALTH = Object.freeze({ revision: 0, mode: 'repair', components: Object.freeze([]), fault: 'CHECK_NOT_RUN' });
const DAY_MS = 86_400_000;
const UNREGISTERED = Object.freeze({ status: 'unregistered', principalId: null, registeredAt: null, lastError: null, attempts: 0 });
/** T2 custody `GET /v1/custody/me/points`: every number is 分 (points), never a token amount. `pending` is this device's
 *  unbound-device balance, which the server moves into the account the moment the device is bound. */
const BREAKDOWN_KEYS = Object.freeze(['install', 'open', 'use', 'claimBonus', 'creatorMirror', 'launchInitiator']);
const pointsUnavailable = (reason, facts = {}) => Object.freeze({ status: 'unavailable', reason, ...facts, totalPoints: 0, pendingTotal: 0, hanas: Object.freeze([]) });
const amount = (value) => {
    if (typeof value !== 'number' || !Number.isFinite(value))
        throw new CoreError('CORE_UPSTREAM_RESPONSE_INVALID', 502);
    return value;
};
function hanaPoints(value) {
    const row = value;
    if (!row || typeof row !== 'object' || typeof row.hanaId !== 'string' || !row.hanaId || row.hanaId.length > 200)
        throw new CoreError('CORE_UPSTREAM_RESPONSE_INVALID', 502);
    const breakdown = {};
    for (const key of BREAKDOWN_KEYS)
        breakdown[key] = row.breakdown?.[key] === undefined ? 0 : amount(row.breakdown[key]);
    return Object.freeze({ hanaId: row.hanaId, displayName: null, displayNameStatus: 'not-found', displayNameReason: null, points: amount(row.points), pending: amount(row.pending), breakdown: Object.freeze(breakdown) });
}
const activityUnavailable = (reason, facts = {}) => ({ status: 'unavailable', reason, ...facts, items: [], nextAfter: null, window: null });
const activityItem = (value, window) => {
    const row = value;
    if (!row || typeof row !== 'object' || typeof row.hanaRef !== 'string' || !row.hanaRef || row.hanaRef.length > 200 ||
        !['install', 'open', 'use', 'uninstall'].includes(String(row.action)) || typeof row.occurredAt !== 'string' ||
        Number.isNaN(Date.parse(row.occurredAt)) || new Date(row.occurredAt).toISOString() !== row.occurredAt ||
        row.occurredAt < window.from || row.occurredAt >= window.to)
        throw new CoreError('CORE_UPSTREAM_RESPONSE_INVALID', 502);
    return { hanaRef: row.hanaRef, action: row.action, occurredAt: row.occurredAt };
};
const linkedAccount = (value) => {
    const v = value;
    return v && v.provider === 'github' && typeof v.displayName === 'string' && v.displayName.length > 0 && v.displayName.length <= 120 ? Object.freeze({ provider: 'github', displayName: v.displayName }) : null;
};
export class SessionController {
    #config;
    #store;
    #fetcher;
    #transport;
    #profileTransport;
    /** Address set in Core's settings page (storage domain); null = the plugin config `serverOrigin` is effective. */
    #serverOverride = null;
    /** A stored override that no longer validates; the configured origin is effective and the state says so. */
    #serverOriginFault = null;
    /** Bumped on every effective server change: results of requests to the previous server are never committed. */
    #serverGeneration = 0;
    #consentGeneration = 0;
    #consentPromptWrite = null;
    #shared;
    #identity;
    #state;
    #publishTail = Promise.resolve();
    #disposed = false;
    #websiteOverride = null;
    #websiteOriginFault = null;
    #websiteGeneration = 0;
    #configurationWrites = 0;
    #registrationFailure = null;
    #registrationRecovery = null;
    #recoveryInFlight = null;
    #recoveryAttemptAt = null;
    #contributionsTimer = null;
    #health = null;
    #suite = null;
    #usageReady = null;
    #contributions = Object.freeze({ status: 'unavailable', reason: 'NOT_CONNECTED' });
    #contributionsCheckedAt = 0;
    #points = pointsUnavailable('NOT_CONNECTED');
    #pointsCheckedAt = 0;
    #hanaNames = new Map();
    #bound = null;
    #account = null;
    #consentListeners = new Set();
    service;
    constructor(config, store, fetcher, shared = null) {
        this.#config = configOf(config);
        this.#store = store;
        this.#shared = shared;
        this.#fetcher = fetcher;
        this.#state = snapshotOf(store.read());
        const stored = this.#state.serverOriginOverride ?? null;
        if (stored !== null) {
            try {
                this.#serverOverride = serverOriginOf(stored);
            }
            catch {
                this.#serverOriginFault = 'CORE_ORIGIN_REJECTED';
            }
        }
        const storedWebsite = this.#state.websiteOriginOverride ?? null;
        if (storedWebsite !== null) {
            try {
                this.#websiteOverride = serverOriginOf(storedWebsite);
            }
            catch {
                this.#websiteOriginFault = 'CORE_ORIGIN_REJECTED';
            }
        }
        [this.#transport, this.#profileTransport] = this.#transportsFor(this.#serverOrigin());
        this.#identity = this.#identityOf(shared ? 'failed' : 'local-only', null, null);
        const unobservedSuite = new SuiteDeclarationService({ manifest: SUITE_MANIFEST,
            profile: OWN_PROFILE, core: OWN_PACKAGE, nodeVersion: process.versions.node,
            inventory: { observe: async () => [] }, coreInventory: async () => ({ kind: 'unreadable' }), peerVersion: async () => null,
            registry: new RegistryMetadataReader({ timeoutMs: this.#config.timeoutMs, maxResponseBytes: this.#config.maxResponseBytes, localTestRegistries: this.#config.suiteLocalTestRegistries }) });
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
            getServerOrigin: () => this.#serverOrigin(),
            getHealth: () => this.#health?.getHealth() ?? COLD_HEALTH,
            getSuiteDeclaration: (request) => {
                if (this.#disposed)
                    return Promise.reject(new CoreError('CORE_DISPOSED', 503));
                return (this.#suite ?? unobservedSuite).read(request);
            },
        });
    }
    attachSuite(provider) {
        if (this.#suite || this.#disposed)
            throw new CoreError(this.#disposed ? 'CORE_DISPOSED' : 'CORE_INPUT_INVALID', 409);
        this.#suite = provider;
    }
    #serverOrigin() { return this.#serverOverride ?? this.#config.serverOrigin; }
    #transportsFor(origin) {
        return [
            new ServerTransport(origin, this.#config.timeoutMs, this.#fetcher, this.#config.maxResponseBytes),
            new ServerTransport(origin, Math.min(this.#config.profileTimeoutMs, this.#config.timeoutMs), this.#fetcher, this.#config.maxResponseBytes),
        ];
    }
    /** `sharedDevice` is the product path (dsh.mjs always passes it). Without it the identity is this client's own
     *  storage only, and `state().identity.status` says `local-only`. */
    static async create(config, store, options = {}) {
        const controller = new SessionController(config, store, options.fetcher, options.sharedDevice ?? null);
        if (controller.#shared)
            await controller.#resolveSharedIdentity();
        else if (controller.#state.device === null) {
            await controller.#publish(current => ({ ...current, revision: current.revision + 1, device: createDevice() }));
            controller.#identity = controller.#identityOf('local-only', 'created', null);
        }
        else
            controller.#identity = controller.#identityOf('local-only', 'existing', null);
        return controller;
    }
    #identityOf(status, source, reason, detail = null) {
        return Object.freeze({ status, location: this.#shared?.location ?? null, source, reason, detail,
            replacedDeviceIds: Object.freeze((this.#state.replacedDevices ?? []).map(device => device.deviceId)) });
    }
    /** Never invents an identity on failure: an unreadable or corrupt shared file leaves this client not ready, with the
     *  reason and file location in `state().identity`, and leaves both the shared file and this client's storage untouched. */
    async #resolveSharedIdentity() {
        const shared = this.#shared;
        const local = this.#state.device;
        let device;
        let source;
        try {
            const existing = await shared.read();
            if (existing) {
                device = existing;
                source = local === null ? 'adopted' : local.deviceId === existing.deviceId ? 'existing' : 'conflict';
            }
            else {
                const candidate = local ?? createDevice();
                device = await shared.claim(candidate);
                source = device.deviceId === candidate.deviceId ? (local ? 'migrated' : 'created') : (local ? 'conflict' : 'adopted');
            }
        }
        catch (error) {
            const reason = error instanceof CoreError && error.code === 'CORE_DEVICE_CORRUPT' ? 'CORE_DEVICE_CORRUPT' : 'CORE_DEVICE_STORE_UNAVAILABLE';
            const detail = error?.detail;
            this.#identity = this.#identityOf('failed', null, reason, typeof detail === 'string' ? detail : error instanceof CoreError ? null : String(error?.message ?? error));
            return;
        }
        if (local?.deviceId !== device.deviceId) {
            const replacedAt = new Date().toISOString();
            // Decided against the serialized `current`, so overlapping resolutions (two refreshes) record a replacement once.
            await this.#publish(current => {
                if (current.device?.deviceId === device.deviceId)
                    return current;
                const replaced = current.device;
                return { ...current, revision: current.revision + 1, device, ...(replaced === null ? {} : {
                        replacedDevices: [...(current.replacedDevices ?? []), { ...replaced, replacedAt }],
                        // The server registration belonged to the replaced key; the shared identity registers itself.
                        registration: { status: 'unregistered', principalId: null, registeredAt: null, lastError: null, attempts: 0 },
                    }) };
            });
        }
        this.#identity = this.#identityOf('shared', source, null);
    }
    #device() {
        if (this.#disposed)
            throw new CoreError('CORE_DISPOSED', 503);
        if (this.#identity.status === 'failed' || !this.#state.device)
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
            bound: this.#bound,
            serverReachable: this.#state.serverObservation.reachable,
            checkedAt: this.#state.serverObservation.checkedAt,
            reason: this.#state.registration.lastError,
        });
    }
    async #signRequest(input) {
        if (!input || typeof input.method !== 'string' || typeof input.path !== 'string' || (input.body !== null && !(input.body instanceof Uint8Array)))
            throw new CoreError('CORE_INPUT_INVALID', 400);
        const timestamp = Date.now().toString(); // identity: Unix milliseconds, ±300 s
        let nonce = requestNonce();
        if (this.#config.authNonceSource === 'server') {
            const response = await this.#transport.request('/v1/identity/devices/challenge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ purpose: 'auth' }) });
            if (!response.ok)
                throw await upstreamError(response);
            const challenge = await upstreamJson(response);
            if (typeof challenge.nonce !== 'string' || !challenge.nonce)
                throw new CoreError('CORE_UPSTREAM_RESPONSE_INVALID', 502);
            nonce = challenge.nonce;
        }
        const bodyHash = createHash('sha256').update(input.body ?? new Uint8Array()).digest('hex');
        // O1 servers verify over the bare route path (identity `/v1/identity/me`, usage `/v1/usage/me/contributions`): PATH = pathname, no query/fragment.
        const pathname = input.path.replace(/[?#].*$/u, '');
        if (!pathname.startsWith('/') || pathname.includes('|'))
            throw new CoreError('CORE_INPUT_INVALID', 400);
        // identity docs/API.md: `METHOD|PATH|TIMESTAMP|NONCE|sha256(body)` (P1 A1-1: identity API.md is authoritative).
        const canonical = new TextEncoder().encode(`${input.method.toUpperCase()}|${pathname}|${timestamp}|${nonce}|${bodyHash}`);
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
        this.#consentGeneration++;
        this.#registrationRecovery = null;
        this.#recoveryAttemptAt = null;
        this.#recoveryInFlight = null;
        const changedAt = new Date().toISOString();
        this.#pointsCheckedAt = 0;
        await this.#publish(current => ({ ...current, revision: current.revision + 1, consent: { state, changedAt } }));
        for (const listener of this.#consentListeners) {
            try {
                listener(state, changedAt);
            }
            catch { /* listener isolation is part of the contract */ }
        }
        // Registration sends the device key and label to the server, so it waits for consent. Withdrawing does not
        // unregister: Usage needs the registration to send the server-side deletion.
        if (state === 'granted') {
            if (this.#state.registration.status === 'registered')
                this.startContributions();
            else
                void this.startRegistration().catch(() => undefined); // failure is kept in registration.lastError / registrationFailure
        }
        else
            this.#stopContributions();
        return { state, changedAt };
    }
    /** Core settings page "服务端": null clears the override (back to the plugin config). Registration belongs to a server,
     *  so a change of the effective origin resets it, drops every server-owned cache and re-registers when consent allows. */
    async setServerOrigin(input) {
        if (input !== null && typeof input !== 'string')
            throw new CoreError('CORE_INPUT_INVALID', 400);
        const override = input === null ? null : serverOriginOf(input);
        const next = override ?? this.#config.serverOrigin;
        const changed = next !== this.#serverOrigin();
        if (changed)
            this.#serverGeneration++;
        this.#configurationWrites++;
        this.#websiteGeneration++;
        try {
            await this.#publish(current => ({ ...current, revision: current.revision + 1, serverOriginOverride: override,
                ...(changed ? { registration: { ...UNREGISTERED }, serverObservation: { reachable: null, checkedAt: null } } : {}) }));
            this.#serverOverride = override;
            this.#serverOriginFault = null;
            if (changed) {
                this.#stopContributions();
                this.#transport.dispose();
                this.#profileTransport.dispose();
                [this.#transport, this.#profileTransport] = this.#transportsFor(next);
                this.#registrationFailure = null;
                this.#registrationRecovery = null;
                this.#recoveryAttemptAt = null;
                this.#recoveryInFlight = null;
                this.#contributions = Object.freeze({ status: 'unavailable', reason: 'NOT_CONNECTED' });
                this.#contributionsCheckedAt = 0;
                this.#points = pointsUnavailable('NOT_CONNECTED');
                this.#pointsCheckedAt = 0;
                this.#hanaNames.clear();
                this.#bound = null;
                this.#account = null;
                if (this.#state.consent.state === 'granted')
                    void this.startRegistration().catch(() => undefined);
            }
        }
        finally {
            this.#configurationWrites--;
            this.#websiteGeneration++;
        }
        return this.state();
    }
    async register() {
        if (this.#state.consent.state !== 'granted')
            throw new CoreError('CORE_CONSENT_REQUIRED', 409);
        const attempts = this.#state.registration.attempts + 1;
        const checkedAt = new Date().toISOString();
        const generation = this.#serverGeneration;
        const consentGeneration = this.#consentGeneration;
        const transport = this.#transport;
        const same = () => generation === this.#serverGeneration && consentGeneration === this.#consentGeneration && !this.#disposed && this.#state.consent.state === 'granted';
        try {
            if (!transport.configured)
                throw new CoreError('CORE_SERVER_NOT_CONFIGURED', 503);
            const result = await registerDevice(transport, this.#device(), undefined, same);
            // The server changed meanwhile: this registration belongs to the old one and is not recorded.
            if (!same())
                return this.#session();
            await this.#publish(state => !same() ? state : { ...state, revision: state.revision + 1,
                registration: { status: 'registered', principalId: result.principalId, registeredAt: checkedAt, lastError: null, attempts },
                serverObservation: { reachable: true, checkedAt },
            });
            if (same())
                this.#registrationFailure = null;
            return this.#session();
        }
        catch (error) {
            if (!same())
                return this.#session();
            const safe = safeError(error);
            this.#registrationFailure = { code: safe.code, status: safe.status, ...upstreamFacts(safe), persistence: null };
            try {
                await this.#publish(current => !same() ? current : ({ ...current, revision: current.revision + 1,
                    registration: { ...current.registration, status: 'failed', lastError: safe.code, attempts },
                    serverObservation: { reachable: safe.upstreamStatus !== undefined || safe.code === 'CORE_DEVICE_ID_MISMATCH' || safe.code === 'CORE_UPSTREAM_RESPONSE_INVALID', checkedAt },
                }));
            }
            catch {
                this.#registrationFailure = { code: safe.code, status: safe.status, ...upstreamFacts(safe), persistence: 'CORE_STORAGE_UNAVAILABLE' };
                throw new CoreError('CORE_STORAGE_UNAVAILABLE', 503);
            }
            throw safe;
        }
    }
    /** Activation and consent grant. Without consent nothing is sent; the settings page shows "打开数据授权后注册". */
    async startRegistration() {
        if (!this.#transport.configured || this.#disposed || this.#identity.status === 'failed')
            return;
        if (this.#state.consent.state !== 'granted')
            return;
        await this.register();
        if (this.#state.registration.status === 'registered')
            this.startContributions();
    }
    #stopContributions() {
        if (this.#contributionsTimer)
            clearInterval(this.#contributionsTimer);
        this.#contributionsTimer = null;
    }
    startContributions() {
        if (!this.#transport.configured || this.#disposed || this.#contributionsTimer || this.#state.consent.state !== 'granted')
            return;
        void this.refreshContributions();
        this.#contributionsTimer = setInterval(() => { void this.refreshContributions(); }, this.#config.contributionIntervalMs);
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
    #websiteOrigin() { return this.#websiteOverride ?? this.#config.websiteOrigin; }
    #websiteBinding() {
        if (this.#configurationWrites > 0)
            return { ready: false, reason: 'CORE_CONFIGURATION_CHANGED', message: '地址正在保存，请完成后重新点击绑定。' };
        const server = this.#serverOrigin(), website = this.#websiteOrigin();
        const local = (origin) => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname);
        const missing = !server || !website;
        const mismatch = !!server && !!website && ((local(server) && !local(website)) || (server !== this.#config.serverOrigin && this.#websiteOverride === null));
        return { ready: !missing && !mismatch, reason: mismatch ? 'CORE_WEBSITE_CONFIGURATION_REQUIRED' : missing ? 'CORE_URL_NOT_ALLOWED' : null,
            message: mismatch ? '服务端已改为本机或非默认地址；请在同一处设置对应的网站地址。本机服务端只能使用本机网站，设置前不会签发绑定码或打开网站。' : missing ? '请先设置服务端和网站地址。' : null };
    }
    async setWebsiteOrigin(input) {
        if (input !== null && typeof input !== 'string')
            throw new CoreError('CORE_INPUT_INVALID', 400);
        const override = input === null ? null : serverOriginOf(input);
        this.#configurationWrites++;
        this.#websiteGeneration++;
        try {
            await this.#publish(current => ({ ...current, revision: current.revision + 1, websiteOriginOverride: override }));
            this.#websiteOverride = override;
            this.#websiteOriginFault = null;
        }
        finally {
            this.#configurationWrites--;
            this.#websiteGeneration++;
        }
        return this.state();
    }
    #websiteFacts() { return { websiteOrigin: this.#websiteOrigin(), websiteOriginSource: this.#websiteOverride === null ? 'config' : 'setting', configuredWebsiteOrigin: this.#config.websiteOrigin, websiteOriginFault: this.#websiteOriginFault, websiteBinding: this.#websiteBinding() }; }
    openExternal(url) {
        const websiteReason = this.#websiteBinding().reason;
        if (websiteReason === 'CORE_WEBSITE_CONFIGURATION_REQUIRED' || websiteReason === 'CORE_CONFIGURATION_CHANGED')
            throw new CoreError(websiteReason, 409);
        return openSystemExternal(url, this.#websiteOrigin(), this.#config.allowSystemBrowser);
    }
    /** Website bind landing (O2 `/me/bind` with the original challenge and advisory expiry metadata): a server `bind` challenge nonce signed by this device. */
    async bindLink() {
        const device = this.#device();
        const websiteReason = this.#websiteBinding().reason;
        if (websiteReason === 'CORE_WEBSITE_CONFIGURATION_REQUIRED' || websiteReason === 'CORE_CONFIGURATION_CHANGED')
            throw new CoreError(websiteReason, 409);
        if (!this.#transport.configured || !this.#websiteOrigin())
            throw new CoreError('CORE_URL_NOT_ALLOWED', 409);
        if (this.#state.consent.state !== 'granted')
            throw new CoreError('CORE_CONSENT_REQUIRED', 409);
        const serverGeneration = this.#serverGeneration, websiteGeneration = this.#websiteGeneration, website = this.#websiteOrigin();
        const response = await this.#transport.request('/v1/identity/devices/challenge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ purpose: 'bind' }) });
        if (!response.ok)
            throw await upstreamError(response);
        let challenge;
        try {
            challenge = await upstreamJson(response);
        }
        catch (error) {
            throw safeError(error);
        }
        if (serverGeneration !== this.#serverGeneration || websiteGeneration !== this.#websiteGeneration)
            throw new CoreError('CORE_CONFIGURATION_CHANGED', 409);
        return createBindLink(website, device, challenge);
    }
    /** A Usage denial alone is not proof that the server forgot the device. Verify with Identity first.
     * Revocation/replay never cause re-registration; signature-invalid is ambiguous (missing record/time/signature).
     * Re-registration uses the same key, single flight, at most once per visible contribution interval. */
    async #recoverRegistration(response, generation) {
        const consentGeneration = this.#consentGeneration;
        const current = () => generation === this.#serverGeneration && consentGeneration === this.#consentGeneration && !this.#disposed && this.#state.consent.state === 'granted';
        if ((response !== null && ![401, 403].includes(response.status)) || !current())
            return false;
        const transport = this.#transport;
        const identityRequest = async () => {
            const headers = await this.#signRequest({ method: 'GET', path: '/v1/identity/me', body: null });
            if (!current())
                throw new CoreError('CORE_CONSENT_REQUIRED', 409);
            return transport.request('/v1/identity/me', { method: 'GET', headers });
        };
        const verification = await identityRequest();
        if (!current())
            return false;
        const retryVerification = response === null && this.#registrationRecovery?.state === 'failed' && verification.ok;
        if (verification.ok && !retryVerification)
            return false;
        const verificationError = retryVerification ? null : await upstreamError(verification);
        const code = verificationError?.code;
        if (verification.status !== 401 && !retryVerification)
            throw verificationError;
        if (!current())
            return false;
        if (code === 'IDENTITY_DEVICE_REVOKED' || code === 'IDENTITY_DEVICE_REPLAY') {
            const revoked = code === 'IDENTITY_DEVICE_REVOKED';
            this.#registrationRecovery = { state: 'blocked', message: revoked ? '服务端已撤销本设备；不会自动重新注册，请联系维护者核对。' : '服务端拒绝了重放的设备请求；不会自动重新注册，请检查时间与请求签名。', nextAttemptAt: null, principalChanged: false };
            await this.#publish(state => !current() ? state : { ...state, revision: state.revision + 1, registration: { ...state.registration, status: 'failed', lastError: revoked ? 'CORE_DEVICE_REVOKED' : 'CORE_DEVICE_REPLAY' } });
            return false;
        }
        if (!current())
            return false;
        if (!retryVerification && code !== 'IDENTITY_DEVICE_SIGNATURE_INVALID')
            throw verificationError;
        if (this.#recoveryInFlight)
            return this.#recoveryInFlight;
        if (this.#recoveryAttemptAt !== null && Date.now() - this.#recoveryAttemptAt < this.#config.contributionIntervalMs)
            return false;
        this.#recoveryAttemptAt = Date.now();
        const previousPrincipal = this.#state.registration.principalId;
        const recovery = (async () => {
            this.#registrationRecovery = { state: 'checking', message: '服务端无法验证本设备（可能记录缺失或签名、时间有问题）；正在用原设备密钥重新注册并核对。', nextAttemptAt: null, principalChanged: false };
            this.#bound = null;
            this.#account = null;
            this.#points = pointsUnavailable('NOT_REGISTERED');
            this.#contributions = { status: 'unavailable', reason: 'NOT_REGISTERED' };
            try {
                await this.#publish(state => !current() ? state : { ...state, revision: state.revision + 1, registration: { ...state.registration, status: 'failed', principalId: null, registeredAt: null, lastError: 'CORE_DEVICE_REVALIDATING' } });
                if (!current())
                    return false;
                await this.register();
                if (!current())
                    return false;
                const confirmed = await identityRequest();
                if (!current())
                    return false;
                if (!confirmed.ok)
                    throw await upstreamError(confirmed);
                const payload = await upstreamJson(confirmed);
                if (!current())
                    return false;
                if (payload.principal?.principalId !== this.#state.registration.principalId)
                    throw new CoreError('CORE_DEVICE_REVALIDATION_FAILED', 503);
                this.#registrationRecovery = { state: 'recovered', message: '已用原设备密钥重新注册，服务端校验通过；请核对网站账号绑定，数据恢复前的积分不会由客户端重建。', nextAttemptAt: null, principalChanged: previousPrincipal !== this.#state.registration.principalId };
                return true;
            }
            catch (error) {
                if (!current())
                    return false;
                this.#registrationRecovery = { state: 'failed', message: '设备重新注册或校验尚未完成；请核对服务端与本机时间，将按贡献检查间隔自动重试。', nextAttemptAt: new Date((this.#recoveryAttemptAt ?? Date.now()) + this.#config.contributionIntervalMs).toISOString(), principalChanged: false };
                await this.#publish(state => !current() ? state : { ...state, revision: state.revision + 1, registration: { ...state.registration, status: 'failed', lastError: safeError(error).code } });
                this.#registrationFailure = { code: safeError(error).code, status: safeError(error).status, ...upstreamFacts(safeError(error)), persistence: null };
                throw error;
            }
        })();
        this.#recoveryInFlight = recovery;
        try {
            return await recovery;
        }
        finally {
            if (this.#recoveryInFlight === recovery)
                this.#recoveryInFlight = null;
        }
    }
    async refreshContributions() {
        if (!this.#transport.configured) {
            this.#contributions = Object.freeze({ status: 'unavailable', reason: 'NOT_CONNECTED' });
            return this.#contributions;
        }
        if (this.#state.consent.state !== 'granted') {
            this.#contributions = Object.freeze({ status: 'unavailable', reason: 'CONSENT_WITHHELD' });
            return this.#contributions;
        }
        // An interrupted post-registration verification must retry even when Usage now accepts the device.
        const generation = this.#serverGeneration;
        const consentGeneration = this.#consentGeneration;
        const current = () => generation === this.#serverGeneration && consentGeneration === this.#consentGeneration && !this.#disposed && this.#state.consent.state === 'granted';
        if (this.#registrationRecovery?.state === 'failed' && (this.#recoveryAttemptAt === null || Date.now() - this.#recoveryAttemptAt >= this.#config.contributionIntervalMs)) {
            try {
                await this.#recoverRegistration(null, generation);
            }
            catch { /* original request still reports transport availability */ }
            if (!current())
                return this.#contributions;
        }
        if (Date.now() - this.#contributionsCheckedAt < this.#config.contributionIntervalMs && this.#contributions.status === 'ready')
            return this.#contributions;
        const windowDays = this.#config.contributionWindowDays;
        const to = new Date();
        const from = new Date(to.getTime() - windowDays * DAY_MS);
        const path = `/v1/usage/me/contributions?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
        const transport = this.#transport;
        let next;
        try {
            const headers = await this.#signRequest({ method: 'GET', path, body: null });
            if (!current())
                return this.#contributions;
            let response = await transport.request(path, { method: 'GET', headers });
            if (!response.ok && await this.#recoverRegistration(response, generation)) {
                if (!current())
                    return this.#contributions;
                const retryHeaders = await this.#signRequest({ method: 'GET', path, body: null });
                if (!current())
                    return this.#contributions;
                response = await transport.request(path, { method: 'GET', headers: retryHeaders });
            }
            if (!current())
                return this.#contributions;
            if (!response.ok)
                throw await upstreamError(response);
            const payload = await upstreamJson(response);
            if (!Array.isArray(payload.byHana))
                throw new CoreError('CORE_UPSTREAM_RESPONSE_INVALID', 502);
            const availability = payload.availability === undefined ? null : payload.availability;
            if (availability !== null && availability !== 'available' && availability !== 'unavailable')
                throw new CoreError('CORE_UPSTREAM_RESPONSE_INVALID', 502);
            const actions = { install: 0, open: 0, use: 0, uninstall: 0 };
            for (const row of payload.byHana)
                for (const key of Object.keys(actions)) {
                    const value = row.actions?.[key];
                    if (!Number.isSafeInteger(value) || value < 0)
                        throw new CoreError('CORE_UPSTREAM_RESPONSE_INVALID', 502);
                    actions[key] += value;
                }
            next = Object.freeze({ status: 'ready', windowDays, availability, actions: Object.freeze(actions) });
            if (!current())
                return this.#contributions; // answer of the previous server
            this.#contributionsCheckedAt = Date.now();
            this.#bound = typeof payload.bound === 'boolean' ? payload.bound : null;
            this.#account = this.#bound === true ? linkedAccount(payload.account) : null;
        }
        catch (error) {
            if (!current())
                return this.#contributions;
            next = Object.freeze({ status: 'unavailable', reason: safeError(error).code, ...upstreamFacts(safeError(error)) });
        }
        this.#contributions = next;
        return this.#contributions;
    }
    async refresh() {
        if (this.#identity.status === 'failed' && !this.#disposed) {
            await this.#resolveSharedIdentity();
            if (this.#identity.status === 'failed')
                return this.state();
            void this.startRegistration().catch(() => undefined);
        }
        this.#contributionsCheckedAt = 0;
        this.#pointsCheckedAt = 0;
        this.#hanaNames.clear();
        await this.refreshContributions();
        await this.refreshPoints();
        return this.state();
    }
    /** T2 "我的 Hana": the device-signed read of the unified points ledger. Consent and registration are checked first so a
     *  user who never opted in gets a readable empty state instead of an upstream error. */
    async refreshPoints() {
        if (!this.#transport.configured)
            return (this.#points = pointsUnavailable('NOT_CONNECTED'));
        if (this.#state.consent.state !== 'granted')
            return (this.#points = pointsUnavailable('CONSENT_WITHHELD'));
        if (this.#state.registration.status !== 'registered')
            return (this.#points = pointsUnavailable('NOT_REGISTERED'));
        if (Date.now() - this.#pointsCheckedAt < this.#config.pointsRefreshMs && this.#points.status === 'ready')
            return this.#points;
        const path = '/v1/custody/me/points';
        const generation = this.#serverGeneration;
        const transport = this.#transport;
        try {
            const headers = await this.#signRequest({ method: 'GET', path, body: null });
            const response = await transport.request(path, { method: 'GET', headers });
            if (!response.ok)
                throw await upstreamError(response);
            const payload = await upstreamJson(response);
            // C-POINTS v0.10.0 requires bindingStatus UNBOUND|BOUND; the shape is validated as the server contract, but
            // "bound" has exactly one source — Usage contributions `bound` (+`account`) — so it is not exposed or used here.
            if (payload.bindingStatus !== 'UNBOUND' && payload.bindingStatus !== 'BOUND')
                throw new CoreError('CORE_UPSTREAM_RESPONSE_INVALID', 502);
            if (!Array.isArray(payload.hanas))
                throw new CoreError('CORE_UPSTREAM_RESPONSE_INVALID', 502);
            if (payload.hanas.length > this.#config.maxHanaRows)
                throw new CoreError('CORE_POINTS_LIMIT_EXCEEDED', 503);
            const hanas = payload.hanas.map(hanaPoints);
            let next = 0;
            const names = new Array(hanas.length);
            await Promise.all(Array.from({ length: Math.min(this.#config.catalogConcurrency, hanas.length) }, async () => {
                for (;;) {
                    const index = next++;
                    if (index >= hanas.length)
                        return;
                    names[index] = await this.#hanaName(hanas[index].hanaId, generation);
                }
            }));
            const namedHanas = hanas.map((row, index) => Object.freeze({ ...row, ...names[index] }));
            const pendingTotal = namedHanas.reduce((sum, row) => sum + row.pending, 0);
            if (generation !== this.#serverGeneration)
                return this.#points; // answer of the previous server
            this.#points = Object.freeze({ status: 'ready', reason: null, totalPoints: amount(payload.totalPoints), pendingTotal, hanas: Object.freeze(namedHanas) });
            this.#pointsCheckedAt = Date.now();
        }
        catch (error) {
            if (generation !== this.#serverGeneration)
                return this.#points;
            this.#points = pointsUnavailable(safeError(error).code, upstreamFacts(safeError(error)));
        }
        return this.#points;
    }
    async #hanaName(hanaId, generation) {
        const cached = this.#hanaNames.get(hanaId);
        if (cached)
            return cached;
        const remember = (name) => { if (generation === this.#serverGeneration)
            this.#hanaNames.set(hanaId, name); };
        try {
            const response = await this.#profileTransport.request(`/v1/registry/hanas/${encodeURIComponent(hanaId)}`);
            if (response.status === 404) {
                const error = await upstreamError(response);
                if (error.code !== 'REGISTRY_NOT_FOUND')
                    throw error;
                const missing = { displayName: null, displayNameStatus: 'not-found', displayNameReason: 'REGISTRY_NOT_FOUND' };
                remember(missing);
                return missing;
            }
            if (!response.ok)
                throw await upstreamError(response);
            const profile = await upstreamJson(response);
            if (profile.hanaId !== hanaId || typeof profile.displayName !== 'string' || !profile.displayName.trim() || profile.displayName.length > 120)
                throw new CoreError('CORE_UPSTREAM_RESPONSE_INVALID', 502);
            const result = { displayName: profile.displayName.trim(), displayNameStatus: 'ready', displayNameReason: null };
            remember(result);
            return result;
        }
        catch (error) {
            // Failure is visible beside authoritative points and never cached as absence.
            return { displayName: null, displayNameStatus: 'failed', displayNameReason: safeError(error).code, ...upstreamFacts(safeError(error)) };
        }
    }
    /** Usage's device-signed raw events are observations, not a per-event points ledger. */
    async activity(query = {}) {
        if (!this.#transport.configured)
            return activityUnavailable('NOT_CONNECTED');
        if (this.#state.consent.state !== 'granted')
            return activityUnavailable('CONSENT_WITHHELD');
        if (this.#state.registration.status !== 'registered')
            return activityUnavailable('NOT_REGISTERED');
        const to = query.to ?? new Date().toISOString();
        const from = query.from ?? new Date(Date.parse(to) - this.#config.contributionWindowDays * DAY_MS).toISOString();
        const window = { from, to };
        const path = `/v1/usage/me/devices/${encodeURIComponent(this.#device().deviceId)}/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=200${query.after ? `&after=${encodeURIComponent(query.after)}` : ''}`;
        try {
            const headers = await this.#signRequest({ method: 'GET', path, body: null });
            const response = await this.#transport.request(path, { method: 'GET', headers });
            if (!response.ok)
                throw await upstreamError(response);
            const payload = await upstreamJson(response);
            if (!Array.isArray(payload.items) || payload.items.length > 200 || payload.window?.from !== from || payload.window?.to !== to ||
                !(payload.nextAfter === null || (typeof payload.nextAfter === 'string' && /^[A-Za-z0-9_-]{1,512}$/u.test(payload.nextAfter))))
                throw new CoreError('CORE_UPSTREAM_RESPONSE_INVALID', 502);
            const items = payload.items.map(value => activityItem(value, window));
            for (let i = 1; i < items.length; i++)
                if (items[i].occurredAt < items[i - 1].occurredAt)
                    throw new CoreError('CORE_UPSTREAM_RESPONSE_INVALID', 502);
            return { status: 'ready', reason: null, items, nextAfter: payload.nextAfter, window };
        }
        catch (error) {
            return activityUnavailable(safeError(error).code, upstreamFacts(safeError(error)));
        }
    }
    /** Public JSON for `GET /api/hanamesh/core/points`. `prompt.show` is decided here, never in the client bundle:
     *  pending points exist, this device is not bound, and the one-time prompt has never been shown. */
    async points() {
        const points = await this.refreshPoints();
        const shownAt = this.#state.pointsBindPromptShownAt ?? null;
        const show = points.pendingTotal > 0 && this.#bound !== true && shownAt === null;
        return publicJson({ ...points, configuration: { pointsRefreshMs: this.#config.pointsRefreshMs }, bound: this.#bound, deviceId: this.#device().deviceId, prompt: { show, shownAt } });
    }
    /** Idempotent: the first call stamps the marker, later calls (restart, reinstall of the same profile) return it unchanged. */
    async markPointsPromptShown() {
        const existing = this.#state.pointsBindPromptShownAt ?? null;
        if (existing !== null)
            return { shownAt: existing };
        const shownAt = new Date().toISOString();
        await this.#publish(current => ({ ...current, revision: current.revision + 1, pointsBindPromptShownAt: shownAt }));
        return { shownAt };
    }
    /** An explicit older refusal/withdrawal has changedAt, whereas a fresh withheld snapshot has null. */
    consentPrompt() {
        const shownAt = this.#state.usageConsentPromptShownAt ?? null;
        return { show: this.#state.consent.state === 'withheld' && this.#state.consent.changedAt === null && shownAt === null, shownAt };
    }
    /** Called only after the native dialog opens. Serialized inside the existing storage publication barrier. */
    markConsentPromptShown() {
        const shownAt = this.#state.usageConsentPromptShownAt;
        if (shownAt != null)
            return Promise.resolve({ shownAt });
        if (this.#consentPromptWrite)
            return this.#consentPromptWrite;
        this.#consentPromptWrite = this.#publish(current => ({ ...current, revision: current.revision + 1,
            usageConsentPromptShownAt: new Date().toISOString() }))
            .then(() => ({ shownAt: this.#state.usageConsentPromptShownAt }))
            .catch(error => { throw error instanceof CoreError ? error : new CoreError('CORE_STORAGE_UNAVAILABLE', 503); })
            .finally(() => { this.#consentPromptWrite = null; });
        return this.#consentPromptWrite;
    }
    /** Effective server plus where it came from, so the settings page can show both the address and the default. */
    #serverFacts() {
        return { serverOrigin: this.#serverOrigin(), serverOriginSource: this.#serverOverride === null ? 'config' : 'setting',
            configuredServerOrigin: this.#config.serverOrigin, serverOriginFault: this.#serverOriginFault };
    }
    /** What the page should say about contributions right now: without a server there is nothing to read; without consent
     *  nothing is requested (the cached value may be from before consent was withdrawn). */
    #contributionsView() {
        if (!this.#transport.configured)
            return Object.freeze({ status: 'unavailable', reason: 'NOT_CONNECTED' });
        if (this.#state.consent.state !== 'granted')
            return Object.freeze({ status: 'unavailable', reason: 'CONSENT_WITHHELD' });
        return this.#contributions;
    }
    state() {
        const device = this.#identity.status === 'failed' && !this.#disposed ? null : this.#device();
        const health = this.service.getHealth();
        const components = health.components.map(component => component && typeof component === 'object' && component.id === 'usage'
            ? { ...component, serviceReady: this.#usageReady?.() ?? false }
            : component);
        return publicJson({ deviceId: device?.deviceId ?? null, publicKey: device?.publicKey ?? null, identity: this.#identity, registrationFailure: this.#registrationFailure, registrationRecovery: this.#registrationRecovery, registration: this.#state.registration, consent: this.#state.consent, consentPrompt: this.consentPrompt(),
            session: device ? this.#session() : null, account: this.#account, ...this.#serverFacts(), ...this.#websiteFacts(),
            configuration: this.#config, health: { mode: health.mode, fault: health.fault ?? null }, components, contributions: this.#contributionsView() });
    }
    diagnostics() {
        return publicJson({ configuration: this.#config, registrationFailure: this.#registrationFailure, registration: this.#state.registration, protocolVersion: '1', disposed: this.#disposed, ...this.#serverFacts(), ...this.#websiteFacts() });
    }
    async dispose() {
        if (this.#disposed)
            return;
        this.#disposed = true;
        this.#stopContributions();
        this.#transport.dispose();
        this.#profileTransport.dispose();
        this.#consentListeners.clear();
        await this.#publishTail;
        await this.#store.close();
    }
}

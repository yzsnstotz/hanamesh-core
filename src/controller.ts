import {createHash} from 'node:crypto';
import type {CoreStore, PluginConfig, StoredCoreSnapshot} from './contracts.js';
import type {HanaMeshCoreContract, HealthSnapshot, RequestSignatureInput} from './contract.js';
import {createDevice, requestNonce, signWithDevice} from './device.js';
import {CoreError, safeError} from './errors.js';
import {registerDevice} from './registration.js';
import {ServerTransport} from './transport.js';
import {openExternal as openSystemExternal} from './external.js';
import {configOf, publicJson, snapshotOf} from './validation.js';

const COLD_HEALTH: HealthSnapshot = Object.freeze({revision: 0, mode: 'repair', components: Object.freeze([]), fault: 'CHECK_NOT_RUN'});
interface HealthProvider {getHealth(): HealthSnapshot; recheck(): Promise<HealthSnapshot>}
type Contributions = {status: 'unavailable'; reason: string} | {status: 'ready'; windowDays: 90; actions: {install: number; open: number; use: number; uninstall: number}};

export class SessionController {
  readonly #config: Required<PluginConfig>;
  readonly #store: CoreStore;
  readonly #transport: ServerTransport;
  #state: StoredCoreSnapshot;
  #publishTail: Promise<void> = Promise.resolve();
  #disposed = false;
  #retryTimer: ReturnType<typeof setTimeout> | null = null;
  #contributionsTimer: ReturnType<typeof setInterval> | null = null;
  #health: HealthProvider | null = null;
  #usageReady: (() => boolean) | null = null;
  #contributions: Contributions = Object.freeze({status: 'unavailable', reason: 'NOT_CONNECTED'});
  #contributionsCheckedAt = 0;
  #bound: boolean | null = null;
  readonly #consentListeners = new Set<(state: 'granted' | 'withheld', changedAt: string) => void>();
  readonly service: HanaMeshCoreContract;
  private constructor(config: PluginConfig, store: CoreStore, fetcher?: typeof fetch) {
    this.#config = configOf(config);
    this.#store = store;
    this.#transport = new ServerTransport(this.#config.serverOrigin, this.#config.timeoutMs, fetcher);
    this.#state = snapshotOf(store.read());
    this.service = Object.freeze({
      protocolVersion: '1' as const,
      getDeviceId: () => this.#device().deviceId,
      getPublicKey: () => this.#device().publicKey,
      sign: (bytes: Uint8Array) => signWithDevice(this.#device(), bytes),
      signRequest: (input: RequestSignatureInput) => this.#signRequest(input),
      getConsent: () => this.#state.consent.state,
      onConsentChange: (listener: (state: 'granted' | 'withheld', changedAt: string) => void) => {
        this.#consentListeners.add(listener);
        return () => { this.#consentListeners.delete(listener); };
      },
      getSession: () => this.#session(),
      getServerOrigin: () => this.#config.serverOrigin,
      getHealth: () => this.#health?.getHealth() ?? COLD_HEALTH,
    });
  }

  static async create(config: PluginConfig, store: CoreStore, options: {fetcher?: typeof fetch} = {}): Promise<SessionController> {
    const controller = new SessionController(config, store, options.fetcher);
    if (controller.#state.device === null) {
      await controller.#publish(current => ({...current, revision: current.revision + 1, device: createDevice()}));
    }
    return controller;
  }

  #device() {
    if (this.#disposed) throw new CoreError('CORE_DISPOSED', 503);
    if (!this.#state.device) throw new CoreError('CORE_NOT_READY', 503);
    return this.#state.device;
  }

  async #publish(update: StoredCoreSnapshot | ((current: StoredCoreSnapshot) => StoredCoreSnapshot)): Promise<void> {
    const publish = this.#publishTail.then(async () => {
      if (this.#disposed) throw new CoreError('CORE_DISPOSED', 503);
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
      protocolVersion: '1' as const,
      deviceId: device.deviceId,
      registration: this.#state.registration.status,
      principalId: this.#state.registration.principalId,
      bound: this.#bound,
      serverReachable: this.#state.serverObservation.reachable,
      checkedAt: this.#state.serverObservation.checkedAt,
      reason: this.#state.registration.lastError,
    });
  }

  async #signRequest(input: RequestSignatureInput) {
    if (!input || typeof input.method !== 'string' || typeof input.path !== 'string' || (input.body !== null && !(input.body instanceof Uint8Array))) throw new CoreError('CORE_INPUT_INVALID', 400);
    const timestamp = Date.now().toString(); // identity: Unix milliseconds, ±300 s
    let nonce = requestNonce();
    if (this.#config.authNonceSource === 'server') {
      const response = await this.#transport.request('/v1/identity/devices/challenge', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({purpose: 'auth'})});
      if (!response.ok) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
      const challenge = await response.json() as {nonce?: unknown};
      if (typeof challenge.nonce !== 'string' || !challenge.nonce) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
      nonce = challenge.nonce;
    }
    const bodyHash = createHash('sha256').update(input.body ?? new Uint8Array()).digest('hex');
    // O1 servers verify over the bare route path (identity `/v1/identity/me`, usage `/v1/usage/me/contributions`): PATH = pathname, no query/fragment.
    const pathname = input.path.replace(/[?#].*$/u, '');
    if (!pathname.startsWith('/') || pathname.includes('|')) throw new CoreError('CORE_INPUT_INVALID', 400);
    // identity docs/API.md: `METHOD|PATH|TIMESTAMP|NONCE|sha256(body)` (P1 A1-1: identity API.md is authoritative).
    const canonical = new TextEncoder().encode(`${input.method.toUpperCase()}|${pathname}|${timestamp}|${nonce}|${bodyHash}`);
    return Object.freeze({
      'x-hm-device-id': this.#device().deviceId,
      'x-hm-timestamp': timestamp,
      'x-hm-nonce': nonce,
      'x-hm-signature': Buffer.from(signWithDevice(this.#device(), canonical)).toString('base64url'),
    });
  }

  async setConsent(state: 'granted' | 'withheld'): Promise<{state: 'granted' | 'withheld'; changedAt: string}> {
    if (state !== 'granted' && state !== 'withheld') throw new CoreError('CORE_INPUT_INVALID', 400);
    const changedAt = new Date().toISOString();
    await this.#publish(current => ({...current, revision: current.revision + 1, consent: {state, changedAt}}));
    for (const listener of this.#consentListeners) {
      try { listener(state, changedAt); } catch { /* listener isolation is part of the contract */ }
    }
    return {state, changedAt};
  }

  async register(): Promise<ReturnType<HanaMeshCoreContract['getSession']>> {
    if (this.#retryTimer) { clearTimeout(this.#retryTimer); this.#retryTimer = null; }
    const attempts = this.#state.registration.attempts + 1;
    const checkedAt = new Date().toISOString();
    try {
      if (!this.#transport.configured) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
      const result = await registerDevice(this.#transport, this.#device());
      await this.#publish(current => ({...current, revision: current.revision + 1,
        registration: {status: 'registered', principalId: result.principalId, registeredAt: checkedAt, lastError: null, attempts},
        serverObservation: {reachable: true, checkedAt},
      }));
      return this.#session();
    } catch (error) {
      const safe = safeError(error);
      await this.#publish(current => ({...current, revision: current.revision + 1,
        registration: {...current.registration, status: 'failed', lastError: safe.code, attempts},
        serverObservation: {reachable: safe.code === 'CORE_DEVICE_ID_MISMATCH', checkedAt},
      }));
      if (this.#transport.configured && !this.#disposed) {
        const delay = Math.min(15, 2 ** Math.max(0, attempts - 1)) * 60_000;
        this.#retryTimer = setTimeout(() => { this.#retryTimer = null; void this.startRegistration().catch(() => undefined); }, delay);
        this.#retryTimer.unref();
      }
      throw safe;
    }
  }

  async startRegistration(): Promise<void> {
    if (!this.#transport.configured || this.#disposed) return;
    await this.register();
    this.startContributions();
  }

  startContributions(): void {
    if (!this.#transport.configured || this.#disposed || this.#contributionsTimer) return;
    void this.refreshContributions();
    this.#contributionsTimer = setInterval(() => { void this.refreshContributions(); }, 60_000);
    this.#contributionsTimer.unref();
  }

  attachHealth(provider: HealthProvider): void {
    if (this.#health) throw new CoreError('CORE_INPUT_INVALID', 409);
    this.#health = provider;
  }

  attachUsageProbe(probe: () => boolean): void {
    if (this.#usageReady) throw new CoreError('CORE_INPUT_INVALID', 409);
    this.#usageReady = probe;
  }

  recheckHealth(): Promise<HealthSnapshot> {
    if (!this.#health) throw new CoreError('CORE_NOT_READY', 503);
    return this.#health.recheck();
  }

  openExternal(url: string): {opened: boolean; reason?: 'DISABLED'} {
    return openSystemExternal(url, this.#config.websiteOrigin, this.#config.allowSystemBrowser);
  }

  /** Website bind landing (O2 `/me/bind?deviceId&nonce&signature`): a server `bind` challenge nonce signed by this device. */
  async bindLink(): Promise<{url: string; expiresAt: string}> {
    const device = this.#device();
    if (!this.#transport.configured || !this.#config.websiteOrigin) throw new CoreError('CORE_URL_NOT_ALLOWED', 409);
    const response = await this.#transport.request('/v1/identity/devices/challenge', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({purpose: 'bind'})});
    if (!response.ok) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
    let challenge: {nonce?: unknown; expiresAt?: unknown};
    try { challenge = await response.json() as {nonce?: unknown; expiresAt?: unknown}; } catch { throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503); }
    if (typeof challenge.nonce !== 'string' || !challenge.nonce || typeof challenge.expiresAt !== 'string') throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
    const signature = Buffer.from(signWithDevice(device, Buffer.from(challenge.nonce, 'utf8'))).toString('base64url');
    const url = new URL('/me/bind', this.#config.websiteOrigin);
    url.searchParams.set('deviceId', device.deviceId);
    url.searchParams.set('nonce', challenge.nonce);
    url.searchParams.set('signature', signature);
    return Object.freeze({url: url.href, expiresAt: challenge.expiresAt});
  }

  async refreshContributions(): Promise<Contributions> {
    if (!this.#transport.configured) {
      this.#contributions = Object.freeze({status: 'unavailable', reason: 'NOT_CONNECTED'});
      return this.#contributions;
    }
    if (Date.now() - this.#contributionsCheckedAt < 60_000 && this.#contributions.status === 'ready') return this.#contributions;
    const to = new Date();
    const from = new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
    const path = `/v1/usage/me/contributions?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
    try {
      const headers = await this.#signRequest({method: 'GET', path, body: null});
      const response = await this.#transport.request(path, {method: 'GET', headers});
      if (!response.ok) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
      const payload = await response.json() as {bound?: unknown; byHana?: Array<{actions?: Partial<Record<'install' | 'open' | 'use' | 'uninstall', unknown>>}>};
      if (!Array.isArray(payload.byHana)) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
      const actions = {install: 0, open: 0, use: 0, uninstall: 0};
      for (const row of payload.byHana) for (const key of Object.keys(actions) as Array<keyof typeof actions>) {
        const value = row.actions?.[key];
        if (!Number.isSafeInteger(value) || (value as number) < 0) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
        actions[key] += value as number;
      }
      this.#contributions = Object.freeze({status: 'ready', windowDays: 90, actions: Object.freeze(actions)});
      this.#contributionsCheckedAt = Date.now();
      this.#bound = typeof payload.bound === 'boolean' ? payload.bound : null;
    } catch (error) {
      this.#contributions = Object.freeze({status: 'unavailable', reason: safeError(error).code});
    }
    return this.#contributions;
  }

  async refresh(): Promise<unknown> {
    this.#contributionsCheckedAt = 0;
    await this.refreshContributions();
    return this.state();
  }

  state(): unknown {
    const device = this.#device();
    const health = this.service.getHealth();
    const components = health.components.map(component => component && typeof component === 'object' && (component as {id?: unknown}).id === 'usage'
      ? {...component, serviceReady: this.#usageReady?.() ?? false}
      : component);
    return publicJson({deviceId: device.deviceId, publicKey: device.publicKey, registration: this.#state.registration, consent: this.#state.consent,
      session: this.#session(), serverOrigin: this.#config.serverOrigin, websiteOrigin: this.#config.websiteOrigin,
      health: {mode: health.mode, fault: health.fault ?? null}, components, contributions: this.#contributions});
  }
  diagnostics(): unknown {
    return publicJson({protocolVersion: '1', disposed: this.#disposed, serverOrigin: this.#config.serverOrigin, websiteOrigin: this.#config.websiteOrigin});
  }
  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#retryTimer) clearTimeout(this.#retryTimer);
    if (this.#contributionsTimer) clearInterval(this.#contributionsTimer);
    this.#retryTimer = null;
    this.#contributionsTimer = null;
    this.#consentListeners.clear();
    await this.#publishTail;
    await this.#store.close();
  }
}

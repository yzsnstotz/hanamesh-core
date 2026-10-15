import {createHash} from 'node:crypto';
import type {CoreStore, PluginConfig, StoredCoreSnapshot} from './contracts.js';
import type {HanaMeshCoreContract, HealthSnapshot, RequestSignatureInput} from './contract.js';
import {createDevice, requestNonce, signWithDevice, type StoredDevice} from './device.js';
import {CoreError, safeError} from './errors.js';
import {registerDevice} from './registration.js';
import {ServerTransport} from './transport.js';
import {openExternal as openSystemExternal} from './external.js';
import {configOf, publicJson, serverOriginOf, snapshotOf} from './validation.js';
import type {SharedDeviceStore} from './shared-device.js';

const COLD_HEALTH: HealthSnapshot = Object.freeze({revision: 0, mode: 'repair', components: Object.freeze([]), fault: 'CHECK_NOT_RUN'});
interface HealthProvider {getHealth(): HealthSnapshot; recheck(): Promise<HealthSnapshot>}
/** `availability` is Usage's own completeness verdict for the window (`unavailable` = part of it is past the server's raw
 *  retention or not exactly recoverable); `null` = the server did not say. The numbers are kept either way. */
type Contributions = {status: 'unavailable'; reason: string} | {status: 'ready'; windowDays: number; availability: 'available' | 'unavailable' | null; actions: {install: number; open: number; use: number; uninstall: number}};
const DAY_MS = 86_400_000;
const UNREGISTERED = Object.freeze({status: 'unregistered', principalId: null, registeredAt: null, lastError: null, attempts: 0} as const);
/** T2 custody `GET /v1/custody/me/points`: every number is 分 (points), never a token amount. `pending` is this device's
 *  unbound-device balance, which the server moves into the account the moment the device is bound. */
const BREAKDOWN_KEYS = Object.freeze(['install', 'open', 'use', 'claimBonus', 'creatorMirror', 'launchInitiator'] as const);
type BreakdownKey = (typeof BREAKDOWN_KEYS)[number];
type HanaName = {displayName: string | null; displayNameStatus: 'ready' | 'not-found' | 'failed'; displayNameReason: string | null};
export type HanaPoints = HanaName & {hanaId: string; displayName: string | null; points: number; pending: number; breakdown: Record<BreakdownKey, number>};
type Points =
  | {status: 'unavailable'; reason: string; totalPoints: 0; pendingTotal: 0; hanas: readonly HanaPoints[]}
  | {status: 'ready'; reason: null; totalPoints: number; pendingTotal: number; hanas: readonly HanaPoints[]};
const pointsUnavailable = (reason: string): Points => Object.freeze({status: 'unavailable', reason, totalPoints: 0, pendingTotal: 0, hanas: Object.freeze([] as HanaPoints[])} as const);
const amount = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
  return value;
};
function hanaPoints(value: unknown): HanaPoints {
  const row = value as {hanaId?: unknown; points?: unknown; pending?: unknown; breakdown?: Record<string, unknown>} | null;
  if (!row || typeof row !== 'object' || typeof row.hanaId !== 'string' || !row.hanaId || row.hanaId.length > 200) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
  const breakdown = {} as Record<BreakdownKey, number>;
  for (const key of BREAKDOWN_KEYS) breakdown[key] = row.breakdown?.[key] === undefined ? 0 : amount(row.breakdown[key]);
  return Object.freeze({hanaId: row.hanaId, displayName: null, displayNameStatus: 'not-found', displayNameReason: null, points: amount(row.points), pending: amount(row.pending), breakdown: Object.freeze(breakdown)});
}
type ActivityAction = 'install' | 'open' | 'use' | 'uninstall';
type ActivityItem = {hanaRef: string; action: ActivityAction; occurredAt: string};
type ActivityWindow = {from: string; to: string};
type ActivityPage = {status: 'ready' | 'unavailable'; reason: string | null; items: readonly ActivityItem[]; nextAfter: string | null; window: ActivityWindow | null};
const activityUnavailable = (reason: string): ActivityPage => ({status: 'unavailable', reason, items: [], nextAfter: null, window: null});
const activityItem = (value: unknown, window: ActivityWindow): ActivityItem => {
  const row = value as Record<string, unknown> | null;
  if (!row || typeof row !== 'object' || typeof row.hanaRef !== 'string' || !row.hanaRef || row.hanaRef.length > 200 ||
      !['install', 'open', 'use', 'uninstall'].includes(String(row.action)) || typeof row.occurredAt !== 'string' ||
      Number.isNaN(Date.parse(row.occurredAt)) || new Date(row.occurredAt).toISOString() !== row.occurredAt ||
      row.occurredAt < window.from || row.occurredAt >= window.to) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
  return {hanaRef: row.hanaRef, action: row.action as ActivityAction, occurredAt: row.occurredAt};
};
/** usage >=0.2.0-rc.3 contributions `account`: the GitHub account name of the bound canonical principal. Older servers omit it -> null. */
type LinkedAccount = {provider: 'github'; displayName: string};
const linkedAccount = (value: unknown): LinkedAccount | null => {
  const v = value as {provider?: unknown; displayName?: unknown} | null | undefined;
  return v && v.provider === 'github' && typeof v.displayName === 'string' && v.displayName.length > 0 && v.displayName.length <= 120 ? Object.freeze({provider: 'github', displayName: v.displayName}) : null;
};

/** J1.S4 machine-wide identity. `source` says how this client arrived at it: `existing` (already the shared identity),
 *  `created` (first client, new key), `migrated` (this client's pre-J1.S4 identity became the shared one), `adopted`
 *  (no local identity, took the shared one), `conflict` (this client's own identity lost to the shared one and was kept
 *  under `replacedDevices`). `failed` never creates or replaces an identity: signing stays CORE_NOT_READY until repaired. */
type IdentitySource = 'existing' | 'created' | 'migrated' | 'adopted' | 'conflict';
type Identity = {
  status: 'shared' | 'local-only' | 'failed';
  location: string | null;
  source: IdentitySource | null;
  reason: 'CORE_DEVICE_CORRUPT' | 'CORE_DEVICE_STORE_UNAVAILABLE' | null;
  /** OS errno behind CORE_DEVICE_STORE_UNAVAILABLE (EACCES, ENOSPC, …); null otherwise. */
  detail: string | null;
  replacedDeviceIds: readonly string[];
};

export class SessionController {
  readonly #config: Required<PluginConfig>;
  readonly #store: CoreStore;
  readonly #fetcher: typeof fetch | undefined;
  #transport: ServerTransport;
  #profileTransport: ServerTransport;
  /** Address set in Core's settings page (storage domain); null = the plugin config `serverOrigin` is effective. */
  #serverOverride: string | null = null;
  /** A stored override that no longer validates; the configured origin is effective and the state says so. */
  #serverOriginFault: 'CORE_ORIGIN_REJECTED' | null = null;
  /** Bumped on every effective server change: results of requests to the previous server are never committed. */
  #serverGeneration = 0;
  readonly #shared: SharedDeviceStore | null;
  #identity: Identity;
  #state: StoredCoreSnapshot;
  #publishTail: Promise<void> = Promise.resolve();
  #disposed = false;
  #registrationFailure: {code: string; persistence: string | null} | null = null;
  #contributionsTimer: ReturnType<typeof setInterval> | null = null;
  #health: HealthProvider | null = null;
  #usageReady: (() => boolean) | null = null;
  #contributions: Contributions = Object.freeze({status: 'unavailable', reason: 'NOT_CONNECTED'});
  #contributionsCheckedAt = 0;
  #points: Points = pointsUnavailable('NOT_CONNECTED');
  #pointsCheckedAt = 0;
  readonly #hanaNames = new Map<string, HanaName>();
  #bound: boolean | null = null;
  #account: LinkedAccount | null = null;
  readonly #consentListeners = new Set<(state: 'granted' | 'withheld', changedAt: string) => void>();
  readonly service: HanaMeshCoreContract;
  private constructor(config: PluginConfig, store: CoreStore, fetcher?: typeof fetch, shared: SharedDeviceStore | null = null) {
    this.#config = configOf(config);
    this.#store = store;
    this.#shared = shared;
    this.#fetcher = fetcher;
    this.#state = snapshotOf(store.read());
    const stored = this.#state.serverOriginOverride ?? null;
    if (stored !== null) {
      try { this.#serverOverride = serverOriginOf(stored); } catch { this.#serverOriginFault = 'CORE_ORIGIN_REJECTED'; }
    }
    [this.#transport, this.#profileTransport] = this.#transportsFor(this.#serverOrigin());
    this.#identity = this.#identityOf(shared ? 'failed' : 'local-only', null, null);
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
      getServerOrigin: () => this.#serverOrigin(),
      getHealth: () => this.#health?.getHealth() ?? COLD_HEALTH,
    });
  }

  #serverOrigin(): string | null { return this.#serverOverride ?? this.#config.serverOrigin; }

  #transportsFor(origin: string | null): [ServerTransport, ServerTransport] {
    return [
      new ServerTransport(origin, this.#config.timeoutMs, this.#fetcher, this.#config.maxResponseBytes),
      new ServerTransport(origin, Math.min(this.#config.profileTimeoutMs, this.#config.timeoutMs), this.#fetcher, this.#config.maxResponseBytes),
    ];
  }

  /** `sharedDevice` is the product path (dsh.mjs always passes it). Without it the identity is this client's own
   *  storage only, and `state().identity.status` says `local-only`. */
  static async create(config: PluginConfig, store: CoreStore, options: {fetcher?: typeof fetch; sharedDevice?: SharedDeviceStore} = {}): Promise<SessionController> {
    const controller = new SessionController(config, store, options.fetcher, options.sharedDevice ?? null);
    if (controller.#shared) await controller.#resolveSharedIdentity();
    else if (controller.#state.device === null) {
      await controller.#publish(current => ({...current, revision: current.revision + 1, device: createDevice()}));
      controller.#identity = controller.#identityOf('local-only', 'created', null);
    } else controller.#identity = controller.#identityOf('local-only', 'existing', null);
    return controller;
  }

  #identityOf(status: Identity['status'], source: IdentitySource | null, reason: Identity['reason'], detail: string | null = null): Identity {
    return Object.freeze({status, location: this.#shared?.location ?? null, source, reason, detail,
      replacedDeviceIds: Object.freeze((this.#state.replacedDevices ?? []).map(device => device.deviceId))});
  }

  /** Never invents an identity on failure: an unreadable or corrupt shared file leaves this client not ready, with the
   *  reason and file location in `state().identity`, and leaves both the shared file and this client's storage untouched. */
  async #resolveSharedIdentity(): Promise<void> {
    const shared = this.#shared!;
    const local = this.#state.device;
    let device: StoredDevice;
    let source: IdentitySource;
    try {
      const existing = await shared.read();
      if (existing) {
        device = existing;
        source = local === null ? 'adopted' : local.deviceId === existing.deviceId ? 'existing' : 'conflict';
      } else {
        const candidate = local ?? createDevice();
        device = await shared.claim(candidate);
        source = device.deviceId === candidate.deviceId ? (local ? 'migrated' : 'created') : (local ? 'conflict' : 'adopted');
      }
    } catch (error) {
      const reason = error instanceof CoreError && error.code === 'CORE_DEVICE_CORRUPT' ? 'CORE_DEVICE_CORRUPT' : 'CORE_DEVICE_STORE_UNAVAILABLE';
      const detail = (error as {detail?: unknown} | null)?.detail;
      this.#identity = this.#identityOf('failed', null, reason, typeof detail === 'string' ? detail : error instanceof CoreError ? null : String((error as Error)?.message ?? error));
      return;
    }
    if (local?.deviceId !== device.deviceId) {
      const replacedAt = new Date().toISOString();
      // Decided against the serialized `current`, so overlapping resolutions (two refreshes) record a replacement once.
      await this.#publish(current => {
        if (current.device?.deviceId === device.deviceId) return current;
        const replaced = current.device;
        return {...current, revision: current.revision + 1, device, ...(replaced === null ? {} : {
          replacedDevices: [...(current.replacedDevices ?? []), {...replaced, replacedAt}],
          // The server registration belonged to the replaced key; the shared identity registers itself.
          registration: {status: 'unregistered', principalId: null, registeredAt: null, lastError: null, attempts: 0},
        })};
      });
    }
    this.#identity = this.#identityOf('shared', source, null);
  }

  #device() {
    if (this.#disposed) throw new CoreError('CORE_DISPOSED', 503);
    if (this.#identity.status === 'failed' || !this.#state.device) throw new CoreError('CORE_NOT_READY', 503);
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
    this.#pointsCheckedAt = 0;
    await this.#publish(current => ({...current, revision: current.revision + 1, consent: {state, changedAt}}));
    for (const listener of this.#consentListeners) {
      try { listener(state, changedAt); } catch { /* listener isolation is part of the contract */ }
    }
    // Registration sends the device key and label to the server, so it waits for consent. Withdrawing does not
    // unregister: Usage needs the registration to send the server-side deletion.
    if (state === 'granted') {
      if (this.#state.registration.status === 'registered') this.startContributions();
      else void this.startRegistration().catch(() => undefined); // failure is kept in registration.lastError / registrationFailure
    } else this.#stopContributions();
    return {state, changedAt};
  }

  /** Core settings page "服务端": null clears the override (back to the plugin config). Registration belongs to a server,
   *  so a change of the effective origin resets it, drops every server-owned cache and re-registers when consent allows. */
  async setServerOrigin(input: string | null): Promise<unknown> {
    if (input !== null && typeof input !== 'string') throw new CoreError('CORE_INPUT_INVALID', 400);
    const override = input === null ? null : serverOriginOf(input);
    const next = override ?? this.#config.serverOrigin;
    const changed = next !== this.#serverOrigin();
    if (changed) this.#serverGeneration++;
    await this.#publish(current => ({...current, revision: current.revision + 1, serverOriginOverride: override,
      ...(changed ? {registration: {...UNREGISTERED}, serverObservation: {reachable: null, checkedAt: null}} : {})}));
    this.#serverOverride = override;
    this.#serverOriginFault = null;
    if (!changed) return this.state();
    this.#stopContributions();
    this.#transport.dispose();
    this.#profileTransport.dispose();
    [this.#transport, this.#profileTransport] = this.#transportsFor(next);
    this.#registrationFailure = null;
    this.#contributions = Object.freeze({status: 'unavailable', reason: 'NOT_CONNECTED'});
    this.#contributionsCheckedAt = 0;
    this.#points = pointsUnavailable('NOT_CONNECTED');
    this.#pointsCheckedAt = 0;
    this.#hanaNames.clear();
    this.#bound = null;
    this.#account = null;
    if (this.#state.consent.state === 'granted') void this.startRegistration().catch(() => undefined);
    return this.state();
  }

  async register(): Promise<ReturnType<HanaMeshCoreContract['getSession']>> {
    if (this.#state.consent.state !== 'granted') throw new CoreError('CORE_CONSENT_REQUIRED', 409);
    const attempts = this.#state.registration.attempts + 1;
    const checkedAt = new Date().toISOString();
    const generation = this.#serverGeneration;
    const transport = this.#transport;
    const same = (): boolean => generation === this.#serverGeneration;
    try {
      if (!transport.configured) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
      const result = await registerDevice(transport, this.#device());
      // The server changed meanwhile: this registration belongs to the old one and is not recorded.
      if (!same()) return this.#session();
      await this.#publish(state => !same() ? state : {...state, revision: state.revision + 1,
        registration: {status: 'registered', principalId: result.principalId, registeredAt: checkedAt, lastError: null, attempts},
        serverObservation: {reachable: true, checkedAt},
      });
      if (same()) this.#registrationFailure = null;
      return this.#session();
    } catch (error) {
      if (!same()) return this.#session();
      const safe = safeError(error);
      this.#registrationFailure = {code: safe.code, persistence: null};
      try { await this.#publish(current => !same() ? current : ({...current, revision: current.revision + 1,
        registration: {...current.registration, status: 'failed', lastError: safe.code, attempts},
        serverObservation: {reachable: safe.code === 'CORE_DEVICE_ID_MISMATCH', checkedAt},
      })); } catch {
        this.#registrationFailure = {code: safe.code, persistence: 'CORE_STORAGE_UNAVAILABLE'};
        throw new CoreError('CORE_STORAGE_UNAVAILABLE', 503);
      }
      throw safe;
    }
  }

  /** Activation and consent grant. Without consent nothing is sent; the settings page shows "打开数据授权后注册". */
  async startRegistration(): Promise<void> {
    if (!this.#transport.configured || this.#disposed || this.#identity.status === 'failed') return;
    if (this.#state.consent.state !== 'granted') return;
    await this.register();
    if (this.#state.registration.status === 'registered') this.startContributions();
  }

  #stopContributions(): void {
    if (this.#contributionsTimer) clearInterval(this.#contributionsTimer);
    this.#contributionsTimer = null;
  }

  startContributions(): void {
    if (!this.#transport.configured || this.#disposed || this.#contributionsTimer || this.#state.consent.state !== 'granted') return;
    void this.refreshContributions();
    this.#contributionsTimer = setInterval(() => { void this.refreshContributions(); }, this.#config.contributionIntervalMs);
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
    if (this.#state.consent.state !== 'granted') throw new CoreError('CORE_CONSENT_REQUIRED', 409);
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
    if (this.#state.consent.state !== 'granted') {
      this.#contributions = Object.freeze({status: 'unavailable', reason: 'CONSENT_WITHHELD'});
      return this.#contributions;
    }
    if (Date.now() - this.#contributionsCheckedAt < this.#config.contributionIntervalMs && this.#contributions.status === 'ready') return this.#contributions;
    const windowDays = this.#config.contributionWindowDays;
    const to = new Date();
    const from = new Date(to.getTime() - windowDays * DAY_MS);
    const path = `/v1/usage/me/contributions?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
    const generation = this.#serverGeneration;
    const transport = this.#transport;
    let next: Contributions;
    try {
      const headers = await this.#signRequest({method: 'GET', path, body: null});
      const response = await transport.request(path, {method: 'GET', headers});
      if (!response.ok) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
      const payload = await response.json() as {bound?: unknown; account?: unknown; availability?: unknown; byHana?: Array<{actions?: Partial<Record<'install' | 'open' | 'use' | 'uninstall', unknown>>}>};
      if (!Array.isArray(payload.byHana)) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
      const availability = payload.availability === undefined ? null : payload.availability;
      if (availability !== null && availability !== 'available' && availability !== 'unavailable') throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
      const actions = {install: 0, open: 0, use: 0, uninstall: 0};
      for (const row of payload.byHana) for (const key of Object.keys(actions) as Array<keyof typeof actions>) {
        const value = row.actions?.[key];
        if (!Number.isSafeInteger(value) || (value as number) < 0) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
        actions[key] += value as number;
      }
      next = Object.freeze({status: 'ready', windowDays, availability, actions: Object.freeze(actions)});
      if (generation !== this.#serverGeneration) return this.#contributions; // answer of the previous server
      this.#contributionsCheckedAt = Date.now();
      this.#bound = typeof payload.bound === 'boolean' ? payload.bound : null;
      this.#account = this.#bound === true ? linkedAccount(payload.account) : null;
    } catch (error) {
      if (generation !== this.#serverGeneration) return this.#contributions;
      next = Object.freeze({status: 'unavailable', reason: safeError(error).code});
    }
    this.#contributions = next;
    return this.#contributions;
  }

  async refresh(): Promise<unknown> {
    if (this.#identity.status === 'failed' && !this.#disposed) {
      await this.#resolveSharedIdentity();
      if (this.#identity.status === 'failed') return this.state();
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
  async refreshPoints(): Promise<Points> {
    if (!this.#transport.configured) return (this.#points = pointsUnavailable('NOT_CONNECTED'));
    if (this.#state.consent.state !== 'granted') return (this.#points = pointsUnavailable('CONSENT_WITHHELD'));
    if (this.#state.registration.status !== 'registered') return (this.#points = pointsUnavailable('NOT_REGISTERED'));
    if (Date.now() - this.#pointsCheckedAt < this.#config.pointsRefreshMs && this.#points.status === 'ready') return this.#points;
    const path = '/v1/custody/me/points';
    const generation = this.#serverGeneration;
    const transport = this.#transport;
    try {
      const headers = await this.#signRequest({method: 'GET', path, body: null});
      const response = await transport.request(path, {method: 'GET', headers});
      if (!response.ok) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
      const payload = await response.json() as {bindingStatus?: unknown; hanas?: unknown; totalPoints?: unknown};
      // C-POINTS v0.10.0 requires bindingStatus UNBOUND|BOUND; the shape is validated as the server contract, but
      // "bound" has exactly one source — Usage contributions `bound` (+`account`) — so it is not exposed or used here.
      if (payload.bindingStatus !== 'UNBOUND' && payload.bindingStatus !== 'BOUND') throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
      if (!Array.isArray(payload.hanas)) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
      if (payload.hanas.length > this.#config.maxHanaRows) throw new CoreError('CORE_POINTS_LIMIT_EXCEEDED', 503);
      const hanas = payload.hanas.map(hanaPoints);
      let next = 0;
      const names = new Array<HanaName>(hanas.length);
      await Promise.all(Array.from({length: Math.min(this.#config.catalogConcurrency, hanas.length)}, async () => {
        for (;;) {
          const index = next++;
          if (index >= hanas.length) return;
          names[index] = await this.#hanaName(hanas[index]!.hanaId, generation);
        }
      }));
      const namedHanas = hanas.map((row, index) => Object.freeze({...row, ...names[index]!}));
      const pendingTotal = namedHanas.reduce((sum, row) => sum + row.pending, 0);
      if (generation !== this.#serverGeneration) return this.#points; // answer of the previous server
      this.#points = Object.freeze({status: 'ready', reason: null, totalPoints: amount(payload.totalPoints), pendingTotal, hanas: Object.freeze(namedHanas)} as const);
      this.#pointsCheckedAt = Date.now();
    } catch (error) {
      if (generation !== this.#serverGeneration) return this.#points;
      this.#points = pointsUnavailable(safeError(error).code);
    }
    return this.#points;
  }

  async #hanaName(hanaId: string, generation: number): Promise<HanaName> {
    const cached = this.#hanaNames.get(hanaId);
    if (cached) return cached;
    const remember = (name: HanaName): void => { if (generation === this.#serverGeneration) this.#hanaNames.set(hanaId, name); };
    try {
      const response = await this.#profileTransport.request(`/v1/registry/hanas/${encodeURIComponent(hanaId)}`);
      if (response.status === 404) {
        const error = await response.json() as {error?: {code?: unknown}};
        if (error.error?.code !== 'REGISTRY_NOT_FOUND') throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
        const missing: HanaName = {displayName: null, displayNameStatus: 'not-found', displayNameReason: 'REGISTRY_NOT_FOUND'};
        remember(missing);
        return missing;
      }
      if (!response.ok) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
      const profile = await response.json() as {hanaId?: unknown; displayName?: unknown};
      if (profile.hanaId !== hanaId || typeof profile.displayName !== 'string' || !profile.displayName.trim() || profile.displayName.length > 120) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
      const result: HanaName = {displayName: profile.displayName.trim(), displayNameStatus: 'ready', displayNameReason: null};
      remember(result);
      return result;
    } catch (error) {
      // Failure is visible beside authoritative points and never cached as absence.
      return {displayName: null, displayNameStatus: 'failed', displayNameReason: safeError(error).code};
    }
  }

  /** Usage's device-signed raw events are observations, not a per-event points ledger. */
  async activity(query: {from?: string; to?: string; after?: string} = {}): Promise<ActivityPage> {
    if (!this.#transport.configured) return activityUnavailable('NOT_CONNECTED');
    if (this.#state.consent.state !== 'granted') return activityUnavailable('CONSENT_WITHHELD');
    if (this.#state.registration.status !== 'registered') return activityUnavailable('NOT_REGISTERED');
    const to = query.to ?? new Date().toISOString();
    const from = query.from ?? new Date(Date.parse(to) - this.#config.contributionWindowDays * DAY_MS).toISOString();
    const window = {from, to};
    const path = `/v1/usage/me/devices/${encodeURIComponent(this.#device().deviceId)}/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=200${query.after ? `&after=${encodeURIComponent(query.after)}` : ''}`;
    try {
      const headers = await this.#signRequest({method: 'GET', path, body: null});
      const response = await this.#transport.request(path, {method: 'GET', headers});
      if (!response.ok) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
      const payload = await response.json() as {items?: unknown; nextAfter?: unknown; window?: ActivityWindow};
      if (!Array.isArray(payload.items) || payload.items.length > 200 || payload.window?.from !== from || payload.window?.to !== to ||
          !(payload.nextAfter === null || (typeof payload.nextAfter === 'string' && /^[A-Za-z0-9_-]{1,512}$/u.test(payload.nextAfter)))) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
      const items = payload.items.map(value => activityItem(value, window));
      for (let i = 1; i < items.length; i++) if (items[i]!.occurredAt < items[i - 1]!.occurredAt) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
      return {status: 'ready', reason: null, items, nextAfter: payload.nextAfter, window};
    } catch (error) { return activityUnavailable(safeError(error).code); }
  }

  /** Public JSON for `GET /api/hanamesh/core/points`. `prompt.show` is decided here, never in the client bundle:
   *  pending points exist, this device is not bound, and the one-time prompt has never been shown. */
  async points(): Promise<unknown> {
    const points = await this.refreshPoints();
    const shownAt = this.#state.pointsBindPromptShownAt ?? null;
    const show = points.pendingTotal > 0 && this.#bound !== true && shownAt === null;
    return publicJson({...points, configuration: {pointsRefreshMs: this.#config.pointsRefreshMs}, bound: this.#bound, deviceId: this.#device().deviceId, prompt: {show, shownAt}});
  }

  /** Idempotent: the first call stamps the marker, later calls (restart, reinstall of the same profile) return it unchanged. */
  async markPointsPromptShown(): Promise<{shownAt: string}> {
    const existing = this.#state.pointsBindPromptShownAt ?? null;
    if (existing !== null) return {shownAt: existing};
    const shownAt = new Date().toISOString();
    await this.#publish(current => ({...current, revision: current.revision + 1, pointsBindPromptShownAt: shownAt}));
    return {shownAt};
  }

  /** Effective server plus where it came from, so the settings page can show both the address and the default. */
  #serverFacts() {
    return {serverOrigin: this.#serverOrigin(), serverOriginSource: this.#serverOverride === null ? 'config' as const : 'setting' as const,
      configuredServerOrigin: this.#config.serverOrigin, serverOriginFault: this.#serverOriginFault};
  }

  /** What the page should say about contributions right now: without a server there is nothing to read; without consent
   *  nothing is requested (the cached value may be from before consent was withdrawn). */
  #contributionsView(): Contributions {
    if (!this.#transport.configured) return Object.freeze({status: 'unavailable', reason: 'NOT_CONNECTED'});
    if (this.#state.consent.state !== 'granted') return Object.freeze({status: 'unavailable', reason: 'CONSENT_WITHHELD'});
    return this.#contributions;
  }

  state(): unknown {
    const device = this.#identity.status === 'failed' && !this.#disposed ? null : this.#device();
    const health = this.service.getHealth();
    const components = health.components.map(component => component && typeof component === 'object' && (component as {id?: unknown}).id === 'usage'
      ? {...component, serviceReady: this.#usageReady?.() ?? false}
      : component);
    return publicJson({deviceId: device?.deviceId ?? null, publicKey: device?.publicKey ?? null, identity: this.#identity, registrationFailure: this.#registrationFailure, registration: this.#state.registration, consent: this.#state.consent,
      session: device ? this.#session() : null, account: this.#account, ...this.#serverFacts(), websiteOrigin: this.#config.websiteOrigin,
      configuration: this.#config, health: {mode: health.mode, fault: health.fault ?? null}, components, contributions: this.#contributionsView()});
  }
  diagnostics(): unknown {
    return publicJson({configuration: this.#config, registrationFailure: this.#registrationFailure, registration: this.#state.registration, protocolVersion: '1', disposed: this.#disposed, ...this.#serverFacts(), websiteOrigin: this.#config.websiteOrigin});
  }
  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#stopContributions();
    this.#transport.dispose();
    this.#profileTransport.dispose();
    this.#consentListeners.clear();
    await this.#publishTail;
    await this.#store.close();
  }
}

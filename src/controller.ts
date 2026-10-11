import {createHash} from 'node:crypto';
import type {CoreStore, PluginConfig, StoredCoreSnapshot} from './contracts.js';
import type {HanaMeshCoreContract, HealthSnapshot, RequestSignatureInput} from './contract.js';
import {createDevice, requestNonce, signWithDevice, type StoredDevice} from './device.js';
import {CoreError, safeError} from './errors.js';
import {registerDevice} from './registration.js';
import {ServerTransport} from './transport.js';
import {openExternal as openSystemExternal} from './external.js';
import {configOf, publicJson, snapshotOf} from './validation.js';
import type {SharedDeviceStore} from './shared-device.js';

const COLD_HEALTH: HealthSnapshot = Object.freeze({revision: 0, mode: 'repair', components: Object.freeze([]), fault: 'CHECK_NOT_RUN'});
interface HealthProvider {getHealth(): HealthSnapshot; recheck(): Promise<HealthSnapshot>}
type Contributions = {status: 'unavailable'; reason: string} | {status: 'ready'; windowDays: 90; actions: {install: number; open: number; use: number; uninstall: number}};
/** T2 custody `GET /v1/custody/me/points`: every number is 分 (points), never a token amount. `pending` is this device's
 *  unbound-device balance, which the server moves into the account the moment the device is bound. */
const BREAKDOWN_KEYS = Object.freeze(['install', 'open', 'use', 'claimBonus', 'creatorMirror', 'launchInitiator'] as const);
type BreakdownKey = (typeof BREAKDOWN_KEYS)[number];
/** C-POINTS v0.10.0 OwnPointsDTO.bindingStatus; never inferred from balances or Usage's session. */
type PointsBindingStatus = 'UNBOUND' | 'BOUND';
type HanaName = {displayName: string | null; displayNameStatus: 'ready' | 'not-found' | 'failed'; displayNameReason: string | null};
export type HanaPoints = HanaName & {hanaId: string; displayName: string | null; points: number; pending: number; breakdown: Record<BreakdownKey, number>};
type Points =
  | {status: 'unavailable'; reason: string; totalPoints: 0; pendingTotal: 0; hanas: readonly HanaPoints[]}
  | {status: 'ready'; reason: null; bindingStatus: PointsBindingStatus; totalPoints: number; pendingTotal: number; hanas: readonly HanaPoints[]};
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
  readonly #transport: ServerTransport;
  readonly #profileTransport: ServerTransport;
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
    this.#transport = new ServerTransport(this.#config.serverOrigin, this.#config.timeoutMs, fetcher, this.#config.maxResponseBytes);
    this.#profileTransport = new ServerTransport(this.#config.serverOrigin, Math.min(this.#config.profileTimeoutMs, this.#config.timeoutMs), fetcher, this.#config.maxResponseBytes);
    this.#state = snapshotOf(store.read());
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
      getServerOrigin: () => this.#config.serverOrigin,
      getHealth: () => this.#health?.getHealth() ?? COLD_HEALTH,
    });
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
    return {state, changedAt};
  }

  async register(): Promise<ReturnType<HanaMeshCoreContract['getSession']>> {
    const attempts = this.#state.registration.attempts + 1;
    const checkedAt = new Date().toISOString();
    try {
      if (!this.#transport.configured) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
      const result = await registerDevice(this.#transport, this.#device());
      await this.#publish(current => ({...current, revision: current.revision + 1,
        registration: {status: 'registered', principalId: result.principalId, registeredAt: checkedAt, lastError: null, attempts},
        serverObservation: {reachable: true, checkedAt},
      }));
      this.#registrationFailure = null;
      return this.#session();
    } catch (error) {
      const safe = safeError(error);
      this.#registrationFailure = {code: safe.code, persistence: null};
      try { await this.#publish(current => ({...current, revision: current.revision + 1,
        registration: {...current.registration, status: 'failed', lastError: safe.code, attempts},
        serverObservation: {reachable: safe.code === 'CORE_DEVICE_ID_MISMATCH', checkedAt},
      })); } catch {
        this.#registrationFailure = {code: safe.code, persistence: 'CORE_STORAGE_UNAVAILABLE'};
        throw new CoreError('CORE_STORAGE_UNAVAILABLE', 503);
      }
      throw safe;
    }
  }

  async startRegistration(): Promise<void> {
    if (!this.#transport.configured || this.#disposed || this.#identity.status === 'failed') return;
    await this.register();
    this.startContributions();
  }

  startContributions(): void {
    if (!this.#transport.configured || this.#disposed || this.#contributionsTimer) return;
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
    if (Date.now() - this.#contributionsCheckedAt < this.#config.contributionIntervalMs && this.#contributions.status === 'ready') return this.#contributions;
    const to = new Date();
    const from = new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
    const path = `/v1/usage/me/contributions?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
    try {
      const headers = await this.#signRequest({method: 'GET', path, body: null});
      const response = await this.#transport.request(path, {method: 'GET', headers});
      if (!response.ok) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
      const payload = await response.json() as {bound?: unknown; account?: unknown; byHana?: Array<{actions?: Partial<Record<'install' | 'open' | 'use' | 'uninstall', unknown>>}>};
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
      this.#account = this.#bound === true ? linkedAccount(payload.account) : null;
    } catch (error) {
      this.#contributions = Object.freeze({status: 'unavailable', reason: safeError(error).code});
    }
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
    try {
      const headers = await this.#signRequest({method: 'GET', path, body: null});
      const response = await this.#transport.request(path, {method: 'GET', headers});
      if (!response.ok) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
      const payload = await response.json() as {bindingStatus?: unknown; hanas?: unknown; totalPoints?: unknown};
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
          names[index] = await this.#hanaName(hanas[index]!.hanaId);
        }
      }));
      const namedHanas = hanas.map((row, index) => Object.freeze({...row, ...names[index]!}));
      const pendingTotal = namedHanas.reduce((sum, row) => sum + row.pending, 0);
      this.#points = Object.freeze({status: 'ready', reason: null, bindingStatus: payload.bindingStatus, totalPoints: amount(payload.totalPoints), pendingTotal, hanas: Object.freeze(namedHanas)} as const);
      this.#pointsCheckedAt = Date.now();
    } catch (error) {
      this.#points = pointsUnavailable(safeError(error).code);
    }
    return this.#points;
  }

  async #hanaName(hanaId: string): Promise<HanaName> {
    const cached = this.#hanaNames.get(hanaId);
    if (cached) return cached;
    try {
      const response = await this.#profileTransport.request(`/v1/registry/hanas/${encodeURIComponent(hanaId)}`);
      if (response.status === 404) {
        const error = await response.json() as {error?: {code?: unknown}};
        if (error.error?.code !== 'REGISTRY_NOT_FOUND') throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
        const missing: HanaName = {displayName: null, displayNameStatus: 'not-found', displayNameReason: 'REGISTRY_NOT_FOUND'};
        this.#hanaNames.set(hanaId, missing);
        return missing;
      }
      if (!response.ok) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
      const profile = await response.json() as {hanaId?: unknown; displayName?: unknown};
      if (profile.hanaId !== hanaId || typeof profile.displayName !== 'string' || !profile.displayName.trim() || profile.displayName.length > 120) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
      const result: HanaName = {displayName: profile.displayName.trim(), displayNameStatus: 'ready', displayNameReason: null};
      this.#hanaNames.set(hanaId, result);
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
    const from = query.from ?? new Date(Date.parse(to) - 90 * 86400000).toISOString();
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

  state(): unknown {
    const device = this.#identity.status === 'failed' && !this.#disposed ? null : this.#device();
    const health = this.service.getHealth();
    const components = health.components.map(component => component && typeof component === 'object' && (component as {id?: unknown}).id === 'usage'
      ? {...component, serviceReady: this.#usageReady?.() ?? false}
      : component);
    return publicJson({deviceId: device?.deviceId ?? null, publicKey: device?.publicKey ?? null, identity: this.#identity, registrationFailure: this.#registrationFailure, registration: this.#state.registration, consent: this.#state.consent,
      session: device ? this.#session() : null, account: this.#account, serverOrigin: this.#config.serverOrigin, websiteOrigin: this.#config.websiteOrigin,
      configuration: this.#config, health: {mode: health.mode, fault: health.fault ?? null}, components, contributions: this.#contributions});
  }
  diagnostics(): unknown {
    return publicJson({configuration: this.#config, registrationFailure: this.#registrationFailure, registration: this.#state.registration, protocolVersion: '1', disposed: this.#disposed, serverOrigin: this.#config.serverOrigin, websiteOrigin: this.#config.websiteOrigin});
  }
  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#contributionsTimer) clearInterval(this.#contributionsTimer);
    this.#contributionsTimer = null;
    this.#transport.dispose();
    this.#profileTransport.dispose();
    this.#consentListeners.clear();
    await this.#publishTail;
    await this.#store.close();
  }
}

import {createHash, createPublicKey, generateKeyPairSync, randomBytes, sign as edSign, verify as edVerify} from 'node:crypto';
import {CORE_REQUIRED_METHODS, checkCoreService} from './contract.js';
import type {ConsentState, CoreHandshake, DeviceAuthHeaders, HanaMeshCoreContract, RequestSignatureInput} from './contract.js';

/** Every fixture carries this label so no screen, log or report can mistake it for the product provider. */
export const CORE_FIXTURE_LABEL = 'FIXTURE · hanamesh-core contract v1 (not the product provider)';

const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url');

/** v1 canonical request bytes, identical to the product provider: `METHOD|pathname|unixMilliseconds|nonce|hex(sha256(body))`. */
export function coreCanonicalRequest(input: RequestSignatureInput, timestamp: string, nonce: string): Uint8Array {
  const pathname = input.path.replace(/[?#].*$/u, '');
  const bodyHash = createHash('sha256').update(input.body ?? new Uint8Array()).digest('hex');
  return new TextEncoder().encode(`${input.method.toUpperCase()}|${pathname}|${timestamp}|${nonce}|${bodyHash}`);
}

/** Verifies an Ed25519 signature against a raw 32-byte base64url public key, as consumers and servers do. */
export function verifyCoreSignature(publicKey: string, bytes: Uint8Array, signature: Uint8Array): boolean {
  const raw = Buffer.from(publicKey, 'base64url');
  if (raw.byteLength !== 32 || signature.byteLength !== 64) return false;
  const key = createPublicKey({key: Buffer.concat([SPKI_ED25519_PREFIX, raw]), format: 'der', type: 'spki'});
  return edVerify(null, Buffer.from(bytes), key, Buffer.from(signature));
}

export interface CoreProviderUnderTest {
  readonly label: string;
  readonly service: HanaMeshCoreContract;
  /** Drives a real consent change through the provider's own write path (the suite never writes state behind its back). */
  setConsent(state: ConsentState): Promise<unknown>;
}

export interface CoreProviderFixtureOptions {
  readonly deviceId?: string;
  readonly initialConsent?: ConsentState;
  readonly serverOrigin?: string | null;
}

/** In-memory provider of protocol v1 for consumers to test against. Not a product provider: no storage, no server. */
export function createCoreProviderFixture(options: CoreProviderFixtureOptions = {}): CoreProviderUnderTest {
  const deviceId = options.deviceId ?? 'device_CONTRACT_FIXTURE';
  const origin = options.serverOrigin === undefined || options.serverOrigin === null ? null : new URL(options.serverOrigin).origin;
  const {privateKey, publicKey} = generateKeyPairSync('ed25519');
  const rawPublic = b64(publicKey.export({format: 'der', type: 'spki'}).subarray(-32));
  const listeners = new Set<(state: ConsentState, changedAt: string) => void>();
  let consent: ConsentState = options.initialConsent ?? 'withheld';
  const sign = (bytes: Uint8Array): Uint8Array => new Uint8Array(edSign(null, Buffer.from(bytes), privateKey));
  const service: HanaMeshCoreContract = Object.freeze({
    protocolVersion: '1' as const,
    getDeviceId: () => deviceId,
    getPublicKey: () => rawPublic,
    sign,
    async signRequest(input: RequestSignatureInput): Promise<DeviceAuthHeaders> {
      if (!input || typeof input.method !== 'string' || typeof input.path !== 'string' || (input.body !== null && !(input.body instanceof Uint8Array))) throw new TypeError('CORE_INPUT_INVALID');
      if (!input.path.replace(/[?#].*$/u, '').startsWith('/')) throw new TypeError('CORE_INPUT_INVALID');
      const timestamp = Date.now().toString();
      const nonce = b64(randomBytes(16));
      return Object.freeze({'x-hm-device-id': deviceId, 'x-hm-timestamp': timestamp, 'x-hm-nonce': nonce, 'x-hm-signature': b64(sign(coreCanonicalRequest(input, timestamp, nonce)))});
    },
    getConsent: () => consent,
    onConsentChange(listener: (state: ConsentState, changedAt: string) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getSession: () => Object.freeze({protocolVersion: '1' as const, deviceId, registration: 'unregistered' as const, principalId: null, bound: null, serverReachable: null, checkedAt: null, reason: null}),
    getServerOrigin: () => origin,
    getHealth: () => Object.freeze({revision: 0, mode: 'restricted' as const, components: Object.freeze([]), fault: 'CONTRACT_FIXTURE'}),
  });
  return {
    label: CORE_FIXTURE_LABEL,
    service,
    async setConsent(state: ConsentState) {
      if (state !== 'granted' && state !== 'withheld') throw new TypeError('CORE_INPUT_INVALID');
      consent = state;
      const changedAt = new Date().toISOString();
      for (const listener of listeners) { try { listener(state, changedAt); } catch { /* listener isolation */ } }
      return {state, changedAt};
    },
  };
}

export interface CoreHandshakeCase {
  readonly id: string;
  readonly value: unknown;
  readonly expected: CoreHandshake;
}

/** The fixed handshake matrix (13 cases) every consumer must classify the same way: match, absent, wrong shape, wrong version, each missing method. */
export function coreHandshakeCases(makeService: () => HanaMeshCoreContract = () => createCoreProviderFixture().service): CoreHandshakeCase[] {
  const base = (): Record<string, unknown> => ({...makeService()});
  const without = (key: string): Record<string, unknown> => { const value = base(); delete value[key]; return value; };
  const cases: CoreHandshakeCase[] = [
    {id: 'handshake.match', value: base(), expected: {status: 'present', protocolVersion: '1', optional: ['getPublicKey', 'getHealth']}},
    {id: 'handshake.absent-undefined', value: undefined, expected: {status: 'absent', reason: 'CORE_ABSENT'}},
    {id: 'handshake.absent-null', value: null, expected: {status: 'absent', reason: 'CORE_ABSENT'}},
    {id: 'handshake.not-object', value: 'hanameshCore', expected: {status: 'incompatible', reason: 'CORE_NOT_OBJECT'}},
    {id: 'handshake.protocol-2', value: {...base(), protocolVersion: '2'}, expected: {status: 'incompatible', reason: 'CORE_PROTOCOL_UNSUPPORTED', provided: '2', supported: ['1']}},
    {id: 'handshake.protocol-missing', value: without('protocolVersion'), expected: {status: 'incompatible', reason: 'CORE_PROTOCOL_UNSUPPORTED', provided: null, supported: ['1']}},
  ];
  for (const name of CORE_REQUIRED_METHODS) cases.push({id: `handshake.missing-${name}`, value: without(name), expected: {status: 'incompatible', reason: 'CORE_METHOD_MISSING', missing: [name]}});
  return cases;
}

export interface CoreConsumerObservation {
  readonly handshake: CoreHandshake;
  readonly signatureVerified: boolean;
  readonly requestVerified: boolean;
  readonly consent: ConsentState | null;
  readonly sessionDeviceMatches: boolean;
}

export interface CoreConsumerUnderTest {
  readonly label: string;
  /** The consumer's own acceptance decision for a candidate `hanameshCore` value. */
  accept(value: unknown): {readonly status: string; readonly reason?: string} | Promise<{readonly status: string; readonly reason?: string}>;
}

/** Reference consumer: handshake first, then the calls a v1 consumer makes (sign, signRequest, consent, session). */
export function createCoreConsumerFixture(options: {readonly accept?: readonly string[]} = {}): CoreConsumerUnderTest & {exercise(value: unknown): Promise<CoreConsumerObservation>} {
  const accept = (value: unknown): CoreHandshake => checkCoreService(value, options.accept);
  return {
    label: CORE_FIXTURE_LABEL,
    accept,
    async exercise(value: unknown): Promise<CoreConsumerObservation> {
      const handshake = accept(value);
      if (handshake.status !== 'present') return {handshake, signatureVerified: false, requestVerified: false, consent: null, sessionDeviceMatches: false};
      const core = value as HanaMeshCoreContract;
      const payload = new TextEncoder().encode(JSON.stringify({fixture: CORE_FIXTURE_LABEL}));
      const publicKey = handshake.optional.includes('getPublicKey') ? core.getPublicKey() : null;
      const signatureVerified = publicKey !== null && verifyCoreSignature(publicKey, payload, core.sign(payload));
      const input = {method: 'post', path: '/v1/usage/events?fixture=1', body: payload};
      const headers = await core.signRequest(input);
      const requestVerified = publicKey !== null && headers['x-hm-device-id'] === core.getDeviceId() &&
        verifyCoreSignature(publicKey, coreCanonicalRequest(input, headers['x-hm-timestamp'], headers['x-hm-nonce']), Buffer.from(headers['x-hm-signature'], 'base64url'));
      return {handshake, signatureVerified, requestVerified, consent: core.getConsent(), sessionDeviceMatches: core.getSession().deviceId === core.getDeviceId()};
    },
  };
}

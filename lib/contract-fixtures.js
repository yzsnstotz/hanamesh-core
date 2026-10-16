import { readFileSync } from 'node:fs';
import { createHash, createPublicKey, generateKeyPairSync, randomBytes, sign as edSign, verify as edVerify } from 'node:crypto';
import { CORE_REQUIRED_METHODS, checkCoreService } from './contract.js';
import { SUITE_MANIFEST } from './suite/index.js';
import { digest, frozen } from './suite/facts.js';
/** Every fixture carries this label so no screen, log or report can mistake it for the product provider. */
export const CORE_FIXTURE_LABEL = 'FIXTURE · hanamesh-core contract v1 (not the product provider)';
const schema = JSON.parse(readFileSync(new URL('../contract/hanamesh-core.v1.schema.json', import.meta.url), 'utf8'));
const typeNames = ['ConsentState', 'DeviceId', 'PublicKey', 'RequestSignatureInput', 'DeviceAuthHeaders', 'SessionSnapshot', 'ServerOrigin'];
/** Provider-owned public definition. References the existing v1 schema, without a second copy of its fields.
 * `errors` records the card's public contract; implementationErrors records additional existing provider guards.
 * Handshake failures are observations returned by checkCoreService, not exceptions from getConsent.
 */
export const CORE_CONTRACT_DEFINITION = Object.freeze({
    id: 'C-CORE',
    service: 'hanameshCore',
    protocolVersion: '1',
    types: Object.freeze(Object.fromEntries(typeNames.map(name => [name, schema.$defs[name]]))),
    optionalTypes: Object.freeze({ HealthSnapshot: schema.$defs.HealthSnapshot, SuiteDeclaration: schema.$defs.SuiteDeclaration, SuiteDeclarationRequest: schema.$defs.SuiteDeclarationRequest }),
    methods: {
        getConsent: { input: null, output: 'ConsentState', errors: ['CORE_ABSENT', 'CORE_PROTOCOL_UNSUPPORTED', 'CORE_METHOD_MISSING'], errorChannel: 'handshake', synchronous: true, note: 'Handshake diagnostics are not exceptions from this unconditional consent getter.' },
        signRequest: { input: 'RequestSignatureInput', output: 'Promise<DeviceAuthHeaders>', errors: ['CORE_NOT_READY', 'CORE_DEVICE_CORRUPT'], errorChannel: 'exception', implementationErrors: ['CORE_INPUT_INVALID', 'CORE_DISPOSED', 'CORE_UPSTREAM_UNAVAILABLE'], synchronous: false },
        getSession: { input: null, output: 'SessionSnapshot', errors: ['CORE_NOT_READY'], errorChannel: 'exception', implementationErrors: ['CORE_DISPOSED'], synchronous: true, note: 'Registration, principal, binding and reachability are observations; null is not a fabricated account or an availability error. reason is registration.lastError.' },
        getServerOrigin: { input: null, output: 'ServerOrigin', errors: ['CORE_NOT_READY'], errorChannel: 'exception', implementationErrors: [], synchronous: true, note: 'The current provider returns configured string | null unconditionally, including after disposal; null means offline. CORE_NOT_READY is card-declared availability, not a thrown guard in this implementation.' },
        getDeviceId: { input: null, output: 'DeviceId', errors: ['CORE_NOT_READY'], errorChannel: 'exception', implementationErrors: ['CORE_DISPOSED'], synchronous: true },
        getPublicKey: { input: null, output: 'PublicKey', errors: ['CORE_NOT_READY'], errorChannel: 'exception', implementationErrors: ['CORE_DISPOSED'], synchronous: true, optional: true, note: 'Reads the stored raw 32-byte Ed25519 public key as unpadded base64url; signing performs key consistency checks.' },
        sign: { input: 'Uint8Array', output: 'Uint8Array', errors: ['CORE_NOT_READY', 'CORE_DEVICE_CORRUPT'], errorChannel: 'exception', implementationErrors: ['CORE_DISPOSED'], synchronous: true, note: 'Signs exact supplied bytes with Ed25519, returning 64 raw bytes. No hashing, JSON encoding, framing, consent or registration gate is added.' },
        onConsentChange: { input: '(state: ConsentState, changedAt: string) => void', output: '() => void', errors: [], synchronous: true, note: 'Two positional callback arguments after successful persistence; ISO timestamp is stored consent.changedAt. No initial replay; same-value writes notify. Unsubscribe is synchronous and idempotent; listener errors are isolated.' },
        getHealth: { input: null, output: 'HealthSnapshot', errors: [], synchronous: true, optional: true, note: 'Read-only advisory view; cold state is repair with CHECK_NOT_RUN. Not an authorization decision.' },
        getSuiteDeclaration: { input: 'SuiteDeclarationRequest | undefined', output: 'Promise<SuiteDeclaration>', errors: ['CORE_DISPOSED'], synchronous: false, optional: true, note: 'Read-only current facts and registry-bound compatible tuples; blocked reasons are data, never installation authorization.' },
    },
    rawSigning: {
        algorithm: 'Ed25519', input: 'exact Uint8Array bytes', output: '64 raw signature bytes',
        deviceId: 'unpadded base64url(sha256(rawPublicKey32))',
        consent: 'The caller checks consent before collecting or sending events; signing primitives do not enforce consent.',
        businessEncoding: 'Caller-owned. Six-fact JSON examples are FIXTURE bytes, not C-USAGE authority.',
    },
    requestSigning: {
        algorithm: 'Ed25519',
        canonical: 'METHOD|pathname|unixMilliseconds|nonce|hex(sha256(body))',
        method: 'upper-case',
        path: 'strip query and fragment',
        body: 'Uint8Array | null; hash exact bytes; null hashes the empty byte sequence',
        signature: '64-byte Ed25519 signature encoded as base64url',
        publicKey: 'raw 32-byte Ed25519 public key encoded as base64url',
        headerNames: ['x-hm-device-id', 'x-hm-timestamp', 'x-hm-nonce', 'x-hm-signature'],
        excluded: ['deviceId header', 'query', 'fragment', 'Origin', 'Host', 'cookie', 'content-type', 'other headers'],
    },
});
/** Public deterministic byte vectors only. The fixed test key is not a product
 * identity; HTTP headers below illustrate the canonical bytes with fixed time/nonce,
 * not a live signRequest response. No private key or business encoding authority is exported. */
const deterministicVectors = {
    "label": "FIXTURE · deterministic Ed25519 bytes; not product identity or C-USAGE encoding authority",
    "publicKey": "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo",
    "deviceId": "If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk",
    "raw": {
        "utf8": "{\"deviceId\":\"If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk\",\"hanaRef\":\"hana_fixture_雪\",\"action\":\"use\",\"occurredAt\":\"2026-01-01T00:00:00.000Z\",\"eventId\":\"event-fixture-1\",\"nonce\":\"event-nonce-1\"}",
        "signatureBase64url": "HvBngPnB1nkwPUex8f5ZdgPFTfmgpF6xbDGB9nhks-gVNrAn2Y_af4pe9TWIdepcTLUCIANOczsUwGWHaGrHBA"
    },
    "requests": [
        {
            "method": "post",
            "path": "/v1/usage/events?fixture=1#ignored",
            "bodyUtf8": "[]",
            "headers": {
                "x-hm-device-id": "If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk",
                "x-hm-timestamp": "1767225600000",
                "x-hm-nonce": "auth-fixed-fixture-nonce",
                "x-hm-signature": "AGcqtZPgXwKDrA1J0yeWp9elokwB0NkxAJdn4aRCoWE50ADYohmBm-h8W_YhQ4TSjjhRLXzPfHMt3QyOpi9mAQ"
            }
        },
        {
            "method": "GET",
            "path": "/v1/usage/me/contributions?from=fixture&to=fixture",
            "bodyUtf8": null,
            "headers": {
                "x-hm-device-id": "If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk",
                "x-hm-timestamp": "1767225600000",
                "x-hm-nonce": "auth-fixed-fixture-nonce",
                "x-hm-signature": "qHL05B4S-Gu43iWUW-MKXZ87C3_8CoIQPxyIl0wH9tiBQ6plSOdTwcJPRpGza7Ke69oILo5I5ziioGrGwPU5Bg"
            }
        },
        {
            "method": "DELETE",
            "path": "/v1/usage/me/devices/If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk/events",
            "bodyUtf8": "",
            "headers": {
                "x-hm-device-id": "If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk",
                "x-hm-timestamp": "1767225600000",
                "x-hm-nonce": "auth-fixed-fixture-nonce",
                "x-hm-signature": "JAioaucbnXDA2OBxRSK1ysWNIZV_EupdMAGDGpZ5TncIDEPwjRKflggKKxJRvd-yANBmMiXDiAXHRPne-E3IAg"
            }
        }
    ]
};
export const CORE_DETERMINISTIC_FIXTURE_VECTORS = Object.freeze({
    ...deterministicVectors,
    raw: Object.freeze(deterministicVectors.raw),
    requests: Object.freeze(deterministicVectors.requests.map(request => Object.freeze({ ...request, headers: Object.freeze(request.headers) }))),
});
/** Fresh, verifiable sample data backed by the minimal in-memory provider; no credentials or private keys leave it. */
export async function createCoreContractExamples() {
    const { service } = createCoreProviderFixture({ serverOrigin: 'https://core.fixture.invalid' });
    const request = { method: 'POST', path: '/v1/usage/events?fixture=1', body: new TextEncoder().encode('[]') };
    return {
        label: CORE_FIXTURE_LABEL,
        consent: service.getConsent(),
        deviceId: service.getDeviceId(),
        publicKey: service.getPublicKey(),
        session: service.getSession(),
        serverOrigin: service.getServerOrigin(),
        request,
        headers: await service.signRequest(request),
        errors: {
            CORE_ABSENT: checkCoreService(undefined),
            CORE_PROTOCOL_UNSUPPORTED: checkCoreService({ ...service, protocolVersion: '2' }),
            CORE_METHOD_MISSING: checkCoreService({ ...service, signRequest: undefined }),
            CORE_NOT_READY: { code: 'CORE_NOT_READY', status: 503 },
            CORE_DEVICE_CORRUPT: { code: 'CORE_DEVICE_CORRUPT', status: 500 },
        },
    };
}
const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const b64 = (bytes) => Buffer.from(bytes).toString('base64url');
/** v1 canonical request bytes, identical to the product provider: `METHOD|pathname|unixMilliseconds|nonce|hex(sha256(body))`. */
export function coreCanonicalRequest(input, timestamp, nonce) {
    const pathname = input.path.replace(/[?#].*$/u, '');
    const bodyHash = createHash('sha256').update(input.body ?? new Uint8Array()).digest('hex');
    return new TextEncoder().encode(`${input.method.toUpperCase()}|${pathname}|${timestamp}|${nonce}|${bodyHash}`);
}
/** Verifies an Ed25519 signature against a raw 32-byte base64url public key, as consumers and servers do. */
export function verifyCoreSignature(publicKey, bytes, signature) {
    const raw = Buffer.from(publicKey, 'base64url');
    if (raw.byteLength !== 32 || signature.byteLength !== 64)
        return false;
    const key = createPublicKey({ key: Buffer.concat([SPKI_ED25519_PREFIX, raw]), format: 'der', type: 'spki' });
    return edVerify(null, Buffer.from(bytes), key, Buffer.from(signature));
}
/** In-memory provider of protocol v1 for consumers to test against. Not a product provider: no storage, no server. */
export function createCoreProviderFixture(options = {}) {
    const deviceId = options.deviceId ?? 'device_CONTRACT_FIXTURE';
    const origin = options.serverOrigin === undefined || options.serverOrigin === null ? null : new URL(options.serverOrigin).origin;
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const rawPublic = b64(publicKey.export({ format: 'der', type: 'spki' }).subarray(-32));
    const listeners = new Set();
    let consent = options.initialConsent ?? 'withheld';
    const sign = (bytes) => new Uint8Array(edSign(null, Buffer.from(bytes), privateKey));
    const service = Object.freeze({
        protocolVersion: '1',
        getDeviceId: () => deviceId,
        getPublicKey: () => rawPublic,
        sign,
        async signRequest(input) {
            if (!input || typeof input.method !== 'string' || typeof input.path !== 'string' || (input.body !== null && !(input.body instanceof Uint8Array)))
                throw new TypeError('CORE_INPUT_INVALID');
            if (!input.path.replace(/[?#].*$/u, '').startsWith('/'))
                throw new TypeError('CORE_INPUT_INVALID');
            const timestamp = Date.now().toString();
            const nonce = b64(randomBytes(16));
            return Object.freeze({ 'x-hm-device-id': deviceId, 'x-hm-timestamp': timestamp, 'x-hm-nonce': nonce, 'x-hm-signature': b64(sign(coreCanonicalRequest(input, timestamp, nonce))) });
        },
        getConsent: () => consent,
        onConsentChange(listener) {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
        getSession: () => Object.freeze({ protocolVersion: '1', deviceId, registration: 'unregistered', principalId: null, bound: null, serverReachable: null, checkedAt: null, reason: null }),
        getServerOrigin: () => origin,
        getHealth: () => Object.freeze({ revision: 0, mode: 'restricted', components: Object.freeze([]), fault: 'CONTRACT_FIXTURE' }),
        getSuiteDeclaration: async () => {
            const facts = { schemaVersion: 1, manifest: SUITE_MANIFEST, nodeVersion: process.versions.node, registry: null, completeness: 'unknown', installed: [], upgrades: [], blocked: [{ code: 'CORE_SUITE_FIXTURE' }, { code: 'CORE_SUITE_SOURCE_MISSING' }], peerFacts: {}, metadataDigests: {} };
            return frozen({ ...facts, checkedAt: new Date().toISOString(), declarationId: digest(facts) });
        },
    });
    return {
        label: CORE_FIXTURE_LABEL,
        service,
        async setConsent(state) {
            if (state !== 'granted' && state !== 'withheld')
                throw new TypeError('CORE_INPUT_INVALID');
            consent = state;
            const changedAt = new Date().toISOString();
            for (const listener of listeners) {
                try {
                    listener(state, changedAt);
                }
                catch { /* listener isolation */ }
            }
            return { state, changedAt };
        },
    };
}
/** The fixed handshake matrix (13 cases) every consumer must classify the same way: match, absent, wrong shape, wrong version, each missing method. */
export function coreHandshakeCases(makeService = () => createCoreProviderFixture().service) {
    const base = () => ({ ...makeService() });
    const without = (key) => { const value = base(); delete value[key]; return value; };
    const cases = [
        { id: 'handshake.match', value: base(), expected: { status: 'present', protocolVersion: '1', optional: ['getPublicKey', 'getHealth', 'getSuiteDeclaration'] } },
        { id: 'handshake.absent-undefined', value: undefined, expected: { status: 'absent', reason: 'CORE_ABSENT' } },
        { id: 'handshake.absent-null', value: null, expected: { status: 'absent', reason: 'CORE_ABSENT' } },
        { id: 'handshake.not-object', value: 'hanameshCore', expected: { status: 'incompatible', reason: 'CORE_NOT_OBJECT' } },
        { id: 'handshake.protocol-2', value: { ...base(), protocolVersion: '2' }, expected: { status: 'incompatible', reason: 'CORE_PROTOCOL_UNSUPPORTED', provided: '2', supported: ['1'] } },
        { id: 'handshake.protocol-missing', value: without('protocolVersion'), expected: { status: 'incompatible', reason: 'CORE_PROTOCOL_UNSUPPORTED', provided: null, supported: ['1'] } },
    ];
    for (const name of CORE_REQUIRED_METHODS)
        cases.push({ id: `handshake.missing-${name}`, value: without(name), expected: { status: 'incompatible', reason: 'CORE_METHOD_MISSING', missing: [name] } });
    return cases;
}
/** Reference consumer: handshake first, then the calls a v1 consumer makes (sign, signRequest, consent, session). */
export function createCoreConsumerFixture(options = {}) {
    const accept = (value) => checkCoreService(value, options.accept);
    return {
        label: CORE_FIXTURE_LABEL,
        accept,
        async exercise(value) {
            const handshake = accept(value);
            if (handshake.status !== 'present')
                return { handshake, signatureVerified: false, requestVerified: false, consent: null, sessionDeviceMatches: false };
            const core = value;
            const payload = new TextEncoder().encode(JSON.stringify({ fixture: CORE_FIXTURE_LABEL }));
            const publicKey = handshake.optional.includes('getPublicKey') ? core.getPublicKey() : null;
            const signatureVerified = publicKey !== null && verifyCoreSignature(publicKey, payload, core.sign(payload));
            const input = { method: 'post', path: '/v1/usage/events?fixture=1', body: payload };
            const headers = await core.signRequest(input);
            const requestVerified = publicKey !== null && headers['x-hm-device-id'] === core.getDeviceId() &&
                verifyCoreSignature(publicKey, coreCanonicalRequest(input, headers['x-hm-timestamp'], headers['x-hm-nonce']), Buffer.from(headers['x-hm-signature'], 'base64url'));
            return { handshake, signatureVerified, requestVerified, consent: core.getConsent(), sessionDeviceMatches: core.getSession().deviceId === core.getDeviceId() };
        },
    };
}

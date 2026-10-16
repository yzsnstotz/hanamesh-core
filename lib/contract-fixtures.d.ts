import type { ConsentState, CoreHandshake, DeviceAuthHeaders, HanaMeshCoreContract, RequestSignatureInput, SessionSnapshot } from './contract.js';
/** Every fixture carries this label so no screen, log or report can mistake it for the product provider. */
export declare const CORE_FIXTURE_LABEL = "FIXTURE \u00B7 hanamesh-core contract v1 (not the product provider)";
/** C-CORE types are re-exported here so the handoff has one import entry point. */
export type { ConsentState, CoreHandshake, DeviceAuthHeaders, HanaMeshCoreContract, HealthSnapshot, RequestSignatureInput, SessionSnapshot } from './contract.js';
/** Provider-owned public definition. References the existing v1 schema, without a second copy of its fields.
 * `errors` records the card's public contract; implementationErrors records additional existing provider guards.
 * Handshake failures are observations returned by checkCoreService, not exceptions from getConsent.
 */
export declare const CORE_CONTRACT_DEFINITION: Readonly<{
    readonly id: "C-CORE";
    readonly service: "hanameshCore";
    readonly protocolVersion: "1";
    readonly types: Readonly<{
        [k: string]: unknown;
    }>;
    readonly optionalTypes: Readonly<{
        HealthSnapshot: unknown;
        SuiteDeclaration: unknown;
        SuiteDeclarationRequest: unknown;
    }>;
    readonly methods: {
        readonly getConsent: {
            readonly input: null;
            readonly output: "ConsentState";
            readonly errors: readonly ["CORE_ABSENT", "CORE_PROTOCOL_UNSUPPORTED", "CORE_METHOD_MISSING"];
            readonly errorChannel: "handshake";
            readonly synchronous: true;
            readonly note: "Handshake diagnostics are not exceptions from this unconditional consent getter.";
        };
        readonly signRequest: {
            readonly input: "RequestSignatureInput";
            readonly output: "Promise<DeviceAuthHeaders>";
            readonly errors: readonly ["CORE_NOT_READY", "CORE_DEVICE_CORRUPT"];
            readonly errorChannel: "exception";
            readonly implementationErrors: readonly ["CORE_INPUT_INVALID", "CORE_DISPOSED", "CORE_UPSTREAM_UNAVAILABLE"];
            readonly synchronous: false;
        };
        readonly getSession: {
            readonly input: null;
            readonly output: "SessionSnapshot";
            readonly errors: readonly ["CORE_NOT_READY"];
            readonly errorChannel: "exception";
            readonly implementationErrors: readonly ["CORE_DISPOSED"];
            readonly synchronous: true;
            readonly note: "Registration, principal, binding and reachability are observations; null is not a fabricated account or an availability error. reason is registration.lastError.";
        };
        readonly getServerOrigin: {
            readonly input: null;
            readonly output: "ServerOrigin";
            readonly errors: readonly ["CORE_NOT_READY"];
            readonly errorChannel: "exception";
            readonly implementationErrors: readonly [];
            readonly synchronous: true;
            readonly note: "The current provider returns configured string | null unconditionally, including after disposal; null means offline. CORE_NOT_READY is card-declared availability, not a thrown guard in this implementation.";
        };
        readonly getDeviceId: {
            readonly input: null;
            readonly output: "DeviceId";
            readonly errors: readonly ["CORE_NOT_READY"];
            readonly errorChannel: "exception";
            readonly implementationErrors: readonly ["CORE_DISPOSED"];
            readonly synchronous: true;
        };
        readonly getPublicKey: {
            readonly input: null;
            readonly output: "PublicKey";
            readonly errors: readonly ["CORE_NOT_READY"];
            readonly errorChannel: "exception";
            readonly implementationErrors: readonly ["CORE_DISPOSED"];
            readonly synchronous: true;
            readonly optional: true;
            readonly note: "Reads the stored raw 32-byte Ed25519 public key as unpadded base64url; signing performs key consistency checks.";
        };
        readonly sign: {
            readonly input: "Uint8Array";
            readonly output: "Uint8Array";
            readonly errors: readonly ["CORE_NOT_READY", "CORE_DEVICE_CORRUPT"];
            readonly errorChannel: "exception";
            readonly implementationErrors: readonly ["CORE_DISPOSED"];
            readonly synchronous: true;
            readonly note: "Signs exact supplied bytes with Ed25519, returning 64 raw bytes. No hashing, JSON encoding, framing, consent or registration gate is added.";
        };
        readonly onConsentChange: {
            readonly input: "(state: ConsentState, changedAt: string) => void";
            readonly output: "() => void";
            readonly errors: readonly [];
            readonly synchronous: true;
            readonly note: "Two positional callback arguments after successful persistence; ISO timestamp is stored consent.changedAt. No initial replay; same-value writes notify. Unsubscribe is synchronous and idempotent; listener errors are isolated.";
        };
        readonly getHealth: {
            readonly input: null;
            readonly output: "HealthSnapshot";
            readonly errors: readonly [];
            readonly synchronous: true;
            readonly optional: true;
            readonly note: "Read-only advisory view; cold state is repair with CHECK_NOT_RUN. Not an authorization decision.";
        };
        readonly getSuiteDeclaration: {
            readonly input: "SuiteDeclarationRequest | undefined";
            readonly output: "Promise<SuiteDeclaration>";
            readonly errors: readonly ["CORE_DISPOSED"];
            readonly synchronous: false;
            readonly optional: true;
            readonly note: "Read-only current facts and registry-bound compatible tuples; blocked reasons are data, never installation authorization.";
        };
    };
    readonly rawSigning: {
        readonly algorithm: "Ed25519";
        readonly input: "exact Uint8Array bytes";
        readonly output: "64 raw signature bytes";
        readonly deviceId: "unpadded base64url(sha256(rawPublicKey32))";
        readonly consent: "The caller checks consent before collecting or sending events; signing primitives do not enforce consent.";
        readonly businessEncoding: "Caller-owned. Six-fact JSON examples are FIXTURE bytes, not C-USAGE authority.";
    };
    readonly requestSigning: {
        readonly algorithm: "Ed25519";
        readonly canonical: "METHOD|pathname|unixMilliseconds|nonce|hex(sha256(body))";
        readonly method: "upper-case";
        readonly path: "strip query and fragment";
        readonly body: "Uint8Array | null; hash exact bytes; null hashes the empty byte sequence";
        readonly signature: "64-byte Ed25519 signature encoded as base64url";
        readonly publicKey: "raw 32-byte Ed25519 public key encoded as base64url";
        readonly headerNames: readonly ["x-hm-device-id", "x-hm-timestamp", "x-hm-nonce", "x-hm-signature"];
        readonly excluded: readonly ["deviceId header", "query", "fragment", "Origin", "Host", "cookie", "content-type", "other headers"];
    };
}>;
export declare const CORE_DETERMINISTIC_FIXTURE_VECTORS: Readonly<{
    raw: Readonly<{
        readonly utf8: "{\"deviceId\":\"If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk\",\"hanaRef\":\"hana_fixture_雪\",\"action\":\"use\",\"occurredAt\":\"2026-01-01T00:00:00.000Z\",\"eventId\":\"event-fixture-1\",\"nonce\":\"event-nonce-1\"}";
        readonly signatureBase64url: "HvBngPnB1nkwPUex8f5ZdgPFTfmgpF6xbDGB9nhks-gVNrAn2Y_af4pe9TWIdepcTLUCIANOczsUwGWHaGrHBA";
    }>;
    requests: readonly Readonly<{
        headers: Readonly<{
            readonly "x-hm-device-id": "If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk";
            readonly "x-hm-timestamp": "1767225600000";
            readonly "x-hm-nonce": "auth-fixed-fixture-nonce";
            readonly "x-hm-signature": "AGcqtZPgXwKDrA1J0yeWp9elokwB0NkxAJdn4aRCoWE50ADYohmBm-h8W_YhQ4TSjjhRLXzPfHMt3QyOpi9mAQ";
        } | {
            readonly "x-hm-device-id": "If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk";
            readonly "x-hm-timestamp": "1767225600000";
            readonly "x-hm-nonce": "auth-fixed-fixture-nonce";
            readonly "x-hm-signature": "qHL05B4S-Gu43iWUW-MKXZ87C3_8CoIQPxyIl0wH9tiBQ6plSOdTwcJPRpGza7Ke69oILo5I5ziioGrGwPU5Bg";
        } | {
            readonly "x-hm-device-id": "If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk";
            readonly "x-hm-timestamp": "1767225600000";
            readonly "x-hm-nonce": "auth-fixed-fixture-nonce";
            readonly "x-hm-signature": "JAioaucbnXDA2OBxRSK1ysWNIZV_EupdMAGDGpZ5TncIDEPwjRKflggKKxJRvd-yANBmMiXDiAXHRPne-E3IAg";
        }>;
        method: "post";
        path: "/v1/usage/events?fixture=1#ignored";
        bodyUtf8: "[]";
    } | {
        headers: Readonly<{
            readonly "x-hm-device-id": "If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk";
            readonly "x-hm-timestamp": "1767225600000";
            readonly "x-hm-nonce": "auth-fixed-fixture-nonce";
            readonly "x-hm-signature": "AGcqtZPgXwKDrA1J0yeWp9elokwB0NkxAJdn4aRCoWE50ADYohmBm-h8W_YhQ4TSjjhRLXzPfHMt3QyOpi9mAQ";
        } | {
            readonly "x-hm-device-id": "If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk";
            readonly "x-hm-timestamp": "1767225600000";
            readonly "x-hm-nonce": "auth-fixed-fixture-nonce";
            readonly "x-hm-signature": "qHL05B4S-Gu43iWUW-MKXZ87C3_8CoIQPxyIl0wH9tiBQ6plSOdTwcJPRpGza7Ke69oILo5I5ziioGrGwPU5Bg";
        } | {
            readonly "x-hm-device-id": "If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk";
            readonly "x-hm-timestamp": "1767225600000";
            readonly "x-hm-nonce": "auth-fixed-fixture-nonce";
            readonly "x-hm-signature": "JAioaucbnXDA2OBxRSK1ysWNIZV_EupdMAGDGpZ5TncIDEPwjRKflggKKxJRvd-yANBmMiXDiAXHRPne-E3IAg";
        }>;
        method: "GET";
        path: "/v1/usage/me/contributions?from=fixture&to=fixture";
        bodyUtf8: null;
    } | {
        headers: Readonly<{
            readonly "x-hm-device-id": "If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk";
            readonly "x-hm-timestamp": "1767225600000";
            readonly "x-hm-nonce": "auth-fixed-fixture-nonce";
            readonly "x-hm-signature": "AGcqtZPgXwKDrA1J0yeWp9elokwB0NkxAJdn4aRCoWE50ADYohmBm-h8W_YhQ4TSjjhRLXzPfHMt3QyOpi9mAQ";
        } | {
            readonly "x-hm-device-id": "If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk";
            readonly "x-hm-timestamp": "1767225600000";
            readonly "x-hm-nonce": "auth-fixed-fixture-nonce";
            readonly "x-hm-signature": "qHL05B4S-Gu43iWUW-MKXZ87C3_8CoIQPxyIl0wH9tiBQ6plSOdTwcJPRpGza7Ke69oILo5I5ziioGrGwPU5Bg";
        } | {
            readonly "x-hm-device-id": "If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk";
            readonly "x-hm-timestamp": "1767225600000";
            readonly "x-hm-nonce": "auth-fixed-fixture-nonce";
            readonly "x-hm-signature": "JAioaucbnXDA2OBxRSK1ysWNIZV_EupdMAGDGpZ5TncIDEPwjRKflggKKxJRvd-yANBmMiXDiAXHRPne-E3IAg";
        }>;
        method: "DELETE";
        path: "/v1/usage/me/devices/If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk/events";
        bodyUtf8: "";
    }>[];
    label: "FIXTURE · deterministic Ed25519 bytes; not product identity or C-USAGE encoding authority";
    publicKey: "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo";
    deviceId: "If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk";
}>;
export interface CoreContractExamples {
    readonly label: string;
    readonly consent: ConsentState;
    readonly deviceId: string;
    readonly publicKey: string;
    readonly session: SessionSnapshot;
    readonly serverOrigin: string | null;
    readonly request: RequestSignatureInput;
    readonly headers: DeviceAuthHeaders;
    readonly errors: {
        readonly CORE_ABSENT: CoreHandshake;
        readonly CORE_PROTOCOL_UNSUPPORTED: CoreHandshake;
        readonly CORE_METHOD_MISSING: CoreHandshake;
        readonly CORE_NOT_READY: {
            readonly code: 'CORE_NOT_READY';
            readonly status: 503;
        };
        readonly CORE_DEVICE_CORRUPT: {
            readonly code: 'CORE_DEVICE_CORRUPT';
            readonly status: 500;
        };
    };
}
/** Fresh, verifiable sample data backed by the minimal in-memory provider; no credentials or private keys leave it. */
export declare function createCoreContractExamples(): Promise<CoreContractExamples>;
/** v1 canonical request bytes, identical to the product provider: `METHOD|pathname|unixMilliseconds|nonce|hex(sha256(body))`. */
export declare function coreCanonicalRequest(input: RequestSignatureInput, timestamp: string, nonce: string): Uint8Array;
/** Verifies an Ed25519 signature against a raw 32-byte base64url public key, as consumers and servers do. */
export declare function verifyCoreSignature(publicKey: string, bytes: Uint8Array, signature: Uint8Array): boolean;
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
export declare function createCoreProviderFixture(options?: CoreProviderFixtureOptions): CoreProviderUnderTest;
export interface CoreHandshakeCase {
    readonly id: string;
    readonly value: unknown;
    readonly expected: CoreHandshake;
}
/** The fixed handshake matrix (13 cases) every consumer must classify the same way: match, absent, wrong shape, wrong version, each missing method. */
export declare function coreHandshakeCases(makeService?: () => HanaMeshCoreContract): CoreHandshakeCase[];
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
    accept(value: unknown): {
        readonly status: string;
        readonly reason?: string;
    } | Promise<{
        readonly status: string;
        readonly reason?: string;
    }>;
}
/** Reference consumer: handshake first, then the calls a v1 consumer makes (sign, signRequest, consent, session). */
export declare function createCoreConsumerFixture(options?: {
    readonly accept?: readonly string[];
}): CoreConsumerUnderTest & {
    exercise(value: unknown): Promise<CoreConsumerObservation>;
};

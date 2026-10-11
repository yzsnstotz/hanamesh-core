import type { ConsentState, CoreHandshake, DeviceAuthHeaders, HanaMeshCoreContract, RequestSignatureInput, SessionSnapshot } from './contract.js';
/** Every fixture carries this label so no screen, log or report can mistake it for the product provider. */
export declare const CORE_FIXTURE_LABEL = "FIXTURE \u00B7 hanamesh-core contract v1 (not the product provider)";
/** C-CORE types are re-exported here so the handoff has one import entry point. */
export type { ConsentState, CoreHandshake, DeviceAuthHeaders, HanaMeshCoreContract, RequestSignatureInput, SessionSnapshot } from './contract.js';
/** Transfer definition for api-contracts. References the existing v1 schema, without a second copy of its fields.
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
    readonly methods: {
        readonly getConsent: {
            readonly input: null;
            readonly output: "ConsentState";
            readonly errors: readonly ["CORE_ABSENT", "CORE_PROTOCOL_UNSUPPORTED", "CORE_METHOD_MISSING"];
            readonly errorChannel: "handshake";
        };
        readonly signRequest: {
            readonly input: "RequestSignatureInput";
            readonly output: "Promise<DeviceAuthHeaders>";
            readonly errors: readonly ["CORE_NOT_READY", "CORE_DEVICE_CORRUPT"];
            readonly errorChannel: "exception";
            readonly implementationErrors: readonly ["CORE_INPUT_INVALID", "CORE_DISPOSED", "CORE_UPSTREAM_UNAVAILABLE"];
        };
        readonly getSession: {
            readonly input: null;
            readonly output: "SessionSnapshot";
            readonly errors: readonly ["CORE_NOT_READY"];
            readonly errorChannel: "exception";
            readonly implementationErrors: readonly ["CORE_DISPOSED"];
        };
        readonly getServerOrigin: {
            readonly input: null;
            readonly output: "ServerOrigin";
            readonly errors: readonly ["CORE_NOT_READY"];
            readonly errorChannel: "exception";
            readonly implementationErrors: readonly [];
            readonly note: "The current provider returns configured string | null unconditionally, including after disposal; null means offline. CORE_NOT_READY is card-declared availability, not a thrown guard in this implementation.";
        };
        readonly getDeviceId: {
            readonly input: null;
            readonly output: "DeviceId";
            readonly errors: readonly ["CORE_NOT_READY"];
            readonly errorChannel: "exception";
            readonly implementationErrors: readonly ["CORE_DISPOSED"];
        };
    };
    readonly requestSigning: {
        readonly algorithm: "Ed25519";
        readonly canonical: "METHOD|pathname|unixMilliseconds|nonce|hex(sha256(body))";
        readonly method: "upper-case";
        readonly path: "strip query and fragment";
        readonly body: "Uint8Array | null; hash exact bytes; null hashes the empty byte sequence";
        readonly signature: "64-byte Ed25519 signature encoded as base64url";
        readonly publicKey: "raw 32-byte Ed25519 public key encoded as base64url";
    };
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

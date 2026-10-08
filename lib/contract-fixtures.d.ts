import type { ConsentState, CoreHandshake, HanaMeshCoreContract, RequestSignatureInput } from './contract.js';
/** Every fixture carries this label so no screen, log or report can mistake it for the product provider. */
export declare const CORE_FIXTURE_LABEL = "FIXTURE \u00B7 hanamesh-core contract v1 (not the product provider)";
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

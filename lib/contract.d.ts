export type ConsentState = 'granted' | 'withheld';
export interface SessionSnapshot {
    readonly protocolVersion: '1';
    readonly deviceId: string;
    readonly registration: 'unregistered' | 'registered' | 'failed';
    readonly principalId: string | null;
    readonly bound: boolean | null;
    readonly serverReachable: boolean | null;
    readonly checkedAt: string | null;
    readonly reason: string | null;
}
export interface HealthSnapshot {
    readonly revision: number;
    readonly mode: 'normal' | 'restricted' | 'blocked' | 'repair';
    readonly components: readonly unknown[];
    readonly fault?: string;
}
export interface RequestSignatureInput {
    readonly method: string;
    readonly path: string;
    readonly body: Uint8Array | null;
}
export type DeviceAuthHeaders = Record<'x-hm-device-id' | 'x-hm-timestamp' | 'x-hm-nonce' | 'x-hm-signature', string>;
export interface HanaMeshCoreContract {
    readonly protocolVersion: '1';
    getDeviceId(): string;
    getPublicKey(): string;
    sign(bytes: Uint8Array): Uint8Array;
    signRequest(input: RequestSignatureInput): Promise<DeviceAuthHeaders>;
    getConsent(): ConsentState;
    onConsentChange(listener: (state: ConsentState, changedAt: string) => void): () => void;
    getSession(): SessionSnapshot;
    getServerOrigin(): string | null;
    getHealth(): HealthSnapshot;
}
/** Cordis service name under which Core provides the contract. */
export declare const CORE_SERVICE_NAME: "hanameshCore";
/** Protocol this package provides. A breaking change ships as `'2'`; v1 only ever gains optional members. */
export declare const CORE_PROTOCOL_VERSION: "1";
export declare const CORE_SUPPORTED_PROTOCOL_VERSIONS: readonly string[];
export declare const CORE_REQUIRED_METHODS: readonly ["getDeviceId", "sign", "signRequest", "getConsent", "onConsentChange", "getSession", "getServerOrigin"];
export declare const CORE_OPTIONAL_METHODS: readonly ["getPublicKey", "getHealth"];
export type CoreRequiredMethod = (typeof CORE_REQUIRED_METHODS)[number];
export type CoreOptionalMethod = (typeof CORE_OPTIONAL_METHODS)[number];
export type CoreHandshake = {
    readonly status: 'present';
    readonly protocolVersion: string;
    readonly optional: readonly CoreOptionalMethod[];
} | {
    readonly status: 'absent';
    readonly reason: 'CORE_ABSENT';
} | {
    readonly status: 'incompatible';
    readonly reason: 'CORE_NOT_OBJECT';
} | {
    readonly status: 'incompatible';
    readonly reason: 'CORE_PROTOCOL_UNSUPPORTED';
    readonly provided: string | null;
    readonly supported: readonly string[];
} | {
    readonly status: 'incompatible';
    readonly reason: 'CORE_METHOD_MISSING';
    readonly missing: readonly CoreRequiredMethod[];
};
/**
 * Consumer-side handshake: `accept` is the list of protocol versions the consumer implements.
 * Order is fixed (absent → not an object → protocol → required methods) so every input has exactly one result;
 * nothing is coerced or accepted silently. Optional methods are reported only when they are functions.
 */
export declare function checkCoreService(value: unknown, accept?: readonly string[]): CoreHandshake;

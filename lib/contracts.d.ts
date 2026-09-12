/** Versioned, framework-free SDK. Session observations NEVER grant resource rights. */
import type { PrincipalDTO } from '../vendor/srv-identity/contracts.js';
export type { PrincipalDTO } from '../vendor/srv-identity/contracts.js';
export declare const IDENTITY_CLIENT_PROTOCOL_VERSION: "1";
export declare const SESSION_STATUSES: readonly ["signed_out", "signing_in", "signed_in", "expired", "unavailable"];
export type SessionStatus = typeof SESSION_STATUSES[number];
export type ErrorCode = 'AUTH_REQUIRED' | 'AUTH_FORBIDDEN' | 'AUTH_UNAVAILABLE' | 'IDENTITY_NOT_READY' | 'IDENTITY_INPUT_INVALID' | 'IDENTITY_ORIGIN_REJECTED' | 'IDENTITY_RATE_LIMITED' | 'IDENTITY_AUTH_FAILED' | 'IDENTITY_NOT_FOUND' | 'IDENTITY_DEPLOYMENT_MISMATCH' | 'UPSTREAM_INVALID_RESPONSE' | 'REQUEST_NOT_ALLOWED' | 'OPERATION_SUPERSEDED' | 'STORAGE_UNAVAILABLE' | 'SESSION_RESTARTED' | 'SIGNED_OUT' | 'DISPOSED' | 'REVOCATION_UNCONFIRMED';
export interface SessionSnapshot {
    readonly protocolVersion: '1';
    readonly status: SessionStatus;
    readonly serviceReady: boolean | null;
    readonly principal: PrincipalDTO | null;
    readonly checkedAt: string | null;
    readonly reason: ErrorCode | null;
    readonly requiredLogin: boolean;
    readonly protectedOperations: 'blocked' | 'resource-check-required';
    readonly privateWork: 'preserved';
    readonly logoutPending: boolean;
    readonly persistence: 'ready' | 'unavailable';
}
export type Json = null | boolean | number | string | readonly Json[] | {
    readonly [key: string]: Json;
};
export interface ScopedRequest {
    readonly path: string;
    readonly method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    readonly body?: Json;
}
export interface ScopedResponse {
    readonly status: number;
    readonly data: Json;
}
export interface IdentityCheck {
    readonly serviceReady: boolean;
    readonly authenticated: boolean;
    readonly resourceAuthorization: 'not-evaluated';
}
/** No password, cookie, raw auth instance, session token, signer or permission issuer. */
export interface IdentityClientService {
    getState(): SessionSnapshot;
    subscribe(listener: (snapshot: SessionSnapshot) => void): () => void;
    checkIdentity(): Promise<IdentityCheck>;
    request(request: ScopedRequest): Promise<ScopedResponse>;
    checkLocalAccess(kind: 'local' | 'protected'): Readonly<{
        allowed: boolean;
        resourceAuthorization: 'not-evaluated';
    }>;
}
/** One non-authoritative observation, replaced with ONE global.set in ONE single-layout domain. */
export interface StoredObservation {
    readonly schemaVersion: 1;
    readonly revision: number;
    readonly status: SessionStatus;
    readonly observedAt: string | null;
    readonly logoutPending: boolean;
}
export interface ObservationStore {
    read(): StoredObservation;
    publish(value: StoredObservation): Promise<void>;
    close(): Promise<void>;
}
export interface PluginConfig {
    /** Exact, operator-controlled remote origin; never obtained from incoming Host headers. */
    readonly identityOrigin: string;
    readonly deploymentId: string;
    readonly requiredLogin?: boolean;
    readonly allowInsecureLoopback?: boolean;
    /** Same deployment only. Does not authorize any resource. */
    readonly protectedPrefixes?: readonly string[];
    readonly timeoutMs?: number;
}

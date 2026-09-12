/** Browser-safe protocol. No framework, ORM, credential or session imports. */
export declare const IDENTITY_PROTOCOL_VERSION: "1";
export declare const ERROR_CODES: readonly ["AUTH_REQUIRED", "AUTH_FORBIDDEN", "AUTH_UNAVAILABLE", "IDENTITY_NOT_READY", "IDENTITY_INPUT_INVALID", "IDENTITY_CONFIG_INVALID", "IDENTITY_NOT_FOUND", "IDENTITY_ORIGIN_REJECTED", "IDENTITY_RATE_LIMITED", "IDENTITY_AUTH_FAILED", "IDENTITY_DEPLOYMENT_MISMATCH", "DB_SCHEMA_MISSING", "DB_ROLE_UNSAFE"];
export type IdentityErrorCode = (typeof ERROR_CODES)[number];
export interface PrincipalDTO {
    readonly principalId: string;
    readonly deploymentId: string;
    readonly displayName: string;
    /** Identity capabilities only; never implies paid / publisher / wallet permission. */
    readonly scopes: readonly ('identity:read:self' | 'identity:update:self')[];
}
export interface MeResponse {
    readonly principal: PrincipalDTO;
}
export interface IdentityErrorResponse {
    readonly error: {
        readonly code: IdentityErrorCode;
        readonly message: string;
    };
}
export interface UpdateProfileInput {
    readonly displayName: string;
}
export interface LoginResponse {
    readonly ok: true;
}

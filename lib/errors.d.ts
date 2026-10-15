export type CoreErrorCode = 'CORE_POINTS_LIMIT_EXCEEDED' | 'CORE_RESPONSE_LIMIT_EXCEEDED' | 'CORE_INPUT_INVALID' | 'CORE_ORIGIN_REJECTED' | 'CORE_NOT_READY' | 'CORE_STORAGE_UNAVAILABLE' | 'CORE_DEVICE_CORRUPT' | 'CORE_DEVICE_STORE_UNAVAILABLE' | 'CORE_DEVICE_ID_MISMATCH' | 'CORE_DEVICE_REVALIDATING' | 'CORE_DEVICE_REVALIDATION_FAILED' | 'CORE_DEVICE_REVOKED' | 'CORE_DEVICE_REPLAY' | 'CORE_UPSTREAM_UNAVAILABLE' | 'CORE_UPSTREAM_HTTP_ERROR' | 'CORE_UPSTREAM_RESPONSE_INVALID' | 'CORE_SERVER_NOT_CONFIGURED' | 'CORE_INTERNAL_ERROR' | 'CORE_URL_NOT_ALLOWED'
/** 409: the action sends this device's identity to the server, which waits for the data consent. */
 | 'CORE_CONSENT_REQUIRED' | 'CORE_DISPOSED';
export declare class CoreError extends Error {
    readonly code: string;
    readonly upstreamStatus?: number;
    readonly status: number;
    constructor(code: string, status?: number, upstreamStatus?: number);
}
export declare function safeError(error: unknown): CoreError;
/** Keep only the bounded public code and HTTP status, never the upstream message/body. */
export declare function upstreamError(response: Response): Promise<CoreError>;
export declare function upstreamJson<T = unknown>(response: Response): Promise<T>;
export declare function upstreamFacts(error: CoreError): {
    upstreamStatus?: number;
};

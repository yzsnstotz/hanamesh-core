import type { ErrorCode } from './contracts.js';
export declare class IdentityClientError extends Error {
    readonly code: ErrorCode;
    readonly status: number;
    constructor(code: ErrorCode, status?: number);
    toJSON(): {
        error: {
            code: ErrorCode;
            message: string;
        };
    };
}
export declare function safeError(error: unknown): IdentityClientError;
/** Never trusts remote error messages and never retains the original cause. */
export declare function responseError(status: number): IdentityClientError;

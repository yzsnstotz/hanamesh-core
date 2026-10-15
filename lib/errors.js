export class CoreError extends Error {
    code;
    upstreamStatus;
    status;
    constructor(code, status = 500, upstreamStatus) {
        super(code);
        this.name = 'CoreError';
        this.code = code;
        this.status = status;
        if (upstreamStatus !== undefined)
            this.upstreamStatus = upstreamStatus;
    }
}
export function safeError(error) {
    return error instanceof CoreError ? error : new CoreError('CORE_INTERNAL_ERROR', 500);
}
/** Keep only the bounded public code and HTTP status, never the upstream message/body. */
export async function upstreamError(response) {
    let code = 'CORE_UPSTREAM_HTTP_ERROR';
    try {
        const body = await response.json();
        if (body && typeof body === 'object' && 'error' in body) {
            const error = body.error;
            if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(error.code))
                code = error.code;
        }
    }
    catch { /* Non-JSON errors still have an authoritative HTTP status. */ }
    return new CoreError(code, response.status, response.status);
}
export async function upstreamJson(response) {
    if (!response.ok)
        throw await upstreamError(response);
    try {
        const value = await response.json();
        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new Error('invalid envelope');
        return value;
    }
    catch {
        throw new CoreError('CORE_UPSTREAM_RESPONSE_INVALID', 502, response.status);
    }
}
export function upstreamFacts(error) {
    return error.upstreamStatus === undefined ? {} : { upstreamStatus: error.upstreamStatus };
}

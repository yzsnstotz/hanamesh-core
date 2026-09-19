export class CoreError extends Error {
    code;
    status;
    constructor(code, status = 500) {
        super(code);
        this.name = 'CoreError';
        this.code = code;
        this.status = status;
    }
}
export function safeError(error) {
    return error instanceof CoreError ? error : new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
}

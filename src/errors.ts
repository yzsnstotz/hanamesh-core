export type CoreErrorCode =
  | 'CORE_INPUT_INVALID'
  | 'CORE_ORIGIN_REJECTED'
  | 'CORE_NOT_READY'
  | 'CORE_STORAGE_UNAVAILABLE'
  | 'CORE_DEVICE_CORRUPT'
  | 'CORE_DEVICE_ID_MISMATCH'
  | 'CORE_UPSTREAM_UNAVAILABLE'
  | 'CORE_URL_NOT_ALLOWED'
  | 'CORE_DISPOSED';

export class CoreError extends Error {
  readonly code: CoreErrorCode;
  readonly status: number;
  constructor(code: CoreErrorCode, status = 500) {
    super(code);
    this.name = 'CoreError';
    this.code = code;
    this.status = status;
  }
}

export function safeError(error: unknown): CoreError {
  return error instanceof CoreError ? error : new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
}

export type CoreErrorCode =
  | 'CORE_POINTS_LIMIT_EXCEEDED'
  | 'CORE_RESPONSE_LIMIT_EXCEEDED'
  | 'CORE_INPUT_INVALID'
  | 'CORE_ORIGIN_REJECTED'
  | 'CORE_NOT_READY'
  | 'CORE_STORAGE_UNAVAILABLE'
  | 'CORE_DEVICE_CORRUPT'
  | 'CORE_DEVICE_STORE_UNAVAILABLE'
  | 'CORE_DEVICE_ID_MISMATCH'
  | 'CORE_DEVICE_REVALIDATING'
  | 'CORE_DEVICE_REVALIDATION_FAILED'
  | 'CORE_DEVICE_REVOKED'
  | 'CORE_DEVICE_REPLAY'
  | 'CORE_UPSTREAM_UNAVAILABLE'
  | 'CORE_UPSTREAM_HTTP_ERROR'
  | 'CORE_UPSTREAM_RESPONSE_INVALID'
  | 'CORE_SERVER_NOT_CONFIGURED'
  | 'CORE_INTERNAL_ERROR'
  | 'CORE_URL_NOT_ALLOWED'
  /** 409: the action sends this device's identity to the server, which waits for the data consent. */
  | 'CORE_CONSENT_REQUIRED'
  | 'CORE_DISPOSED';

export class CoreError extends Error {
  readonly code: string;
  readonly upstreamStatus?: number;
  readonly status: number;
  constructor(code: string, status = 500, upstreamStatus?: number) {
    super(code);
    this.name = 'CoreError';
    this.code = code;
    this.status = status;
    if (upstreamStatus !== undefined) this.upstreamStatus = upstreamStatus;
  }
}

export function safeError(error: unknown): CoreError {
  return error instanceof CoreError ? error : new CoreError('CORE_INTERNAL_ERROR', 500);
}

/** Keep only the bounded public code and HTTP status, never the upstream message/body. */
export async function upstreamError(response: Response): Promise<CoreError> {
  let code = 'CORE_UPSTREAM_HTTP_ERROR';
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'error' in body) {
      const error = body.error;
      if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(error.code)) code = error.code;
    }
  } catch { /* Non-JSON errors still have an authoritative HTTP status. */ }
  return new CoreError(code, response.status, response.status);
}
export async function upstreamJson<T = unknown>(response: Response): Promise<T> {
  if (!response.ok) throw await upstreamError(response);
  try { const value: unknown = await response.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid envelope');
    return value as T;
  } catch { throw new CoreError('CORE_UPSTREAM_RESPONSE_INVALID', 502, response.status); }
}
export function upstreamFacts(error: CoreError): {upstreamStatus?: number} {
  return error.upstreamStatus === undefined ? {} : {upstreamStatus: error.upstreamStatus};
}

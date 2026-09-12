import type { ErrorCode } from './contracts.js';
const messages: Record<ErrorCode, string> = {
  AUTH_REQUIRED: '请先登录。', AUTH_FORBIDDEN: '资源服务拒绝了本次操作。',
  AUTH_UNAVAILABLE: '身份服务暂时不可达；私有工作仍保留。', IDENTITY_NOT_READY: '身份服务尚未就绪。',
  IDENTITY_INPUT_INVALID: '输入格式不正确。', IDENTITY_ORIGIN_REJECTED: '请求来源不受信任。',
  IDENTITY_RATE_LIMITED: '请求过于频繁，请稍后重试。', IDENTITY_AUTH_FAILED: '登录未成功，请检查凭据。',
  IDENTITY_NOT_FOUND: '未找到请求的资源。', IDENTITY_DEPLOYMENT_MISMATCH: '身份不属于当前部署。',
  UPSTREAM_INVALID_RESPONSE: '服务响应不符合锁定协议。', REQUEST_NOT_ALLOWED: '请求不在已配置的接入范围内。',
  OPERATION_SUPERSEDED: '登录状态已变化，请重新操作。', STORAGE_UNAVAILABLE: '身份状态存储不可用；受保护操作已停止。',
  SESSION_RESTARTED: '宿主已重启，请重新登录。', SIGNED_OUT: '已退出登录。', DISPOSED: '身份插件已停止。',
  REVOCATION_UNCONFIRMED: '本机已停止使用会话，但服务器撤销尚未确认。',
};
export class IdentityClientError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  constructor(code: ErrorCode, status = 503) {
    super(messages[code]); this.name = 'IdentityClientError'; this.code = code; this.status = status;
  }
  toJSON(): { error: { code: ErrorCode; message: string } } {
    return { error: { code: this.code, message: this.message } };
  }
}
export function safeError(error: unknown): IdentityClientError {
  return error instanceof IdentityClientError ? error : new IdentityClientError('AUTH_UNAVAILABLE');
}
/** Never trusts remote error messages and never retains the original cause. */
export function responseError(status: number): IdentityClientError {
  if (status === 401) return new IdentityClientError('AUTH_REQUIRED', 401);
  if (status === 403) return new IdentityClientError('AUTH_FORBIDDEN', 403);
  if (status === 404) return new IdentityClientError('IDENTITY_NOT_FOUND', 404);
  if (status === 429) return new IdentityClientError('IDENTITY_RATE_LIMITED', 429);
  if ([400, 413, 415, 422].includes(status)) return new IdentityClientError('IDENTITY_INPUT_INVALID', 400);
  return new IdentityClientError('AUTH_UNAVAILABLE');
}

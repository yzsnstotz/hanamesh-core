import {CoreError} from './errors.js';
import {signWithDevice, type StoredDevice} from './device.js';

/** Carry the original Identity deadline as editable display metadata, never authorization. */
export function createBindLink(website: string, device: StoredDevice, value: unknown): {url: string; expiresAt: string} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CoreError('CORE_UPSTREAM_RESPONSE_INVALID', 502);
  const {nonce, expiresAt} = value as {nonce?: unknown; expiresAt?: unknown};
  if (typeof nonce !== 'string' || !nonce || typeof expiresAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(expiresAt) ||
      !Number.isFinite(Date.parse(expiresAt)) || new Date(expiresAt).toISOString() !== expiresAt) {
    throw new CoreError('CORE_UPSTREAM_RESPONSE_INVALID', 502);
  }
  const url = new URL('/me/bind', website);
  url.searchParams.set('deviceId', device.deviceId);
  url.searchParams.set('nonce', nonce);
  // Identity still verifies exactly utf8(nonce); the URL hints are not signed expiry proof.
  url.searchParams.set('signature', Buffer.from(signWithDevice(device, Buffer.from(nonce, 'utf8'))).toString('base64url'));
  url.searchParams.set('expiresAt', expiresAt);
  url.searchParams.set('expiryClock', 'identity-server');
  return Object.freeze({url: url.href, expiresAt});
}

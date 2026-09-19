import type {StoredDevice} from './device.js';
import {rawPublicKey, signWithDevice} from './device.js';
import {CoreError} from './errors.js';
import {ServerTransport} from './transport.js';

interface ChallengeResponse {nonce: string; expiresAt: string}
interface RegistrationResponse {deviceId: string; principalId: string}

async function jsonOf<T>(response: Response): Promise<T> {
  if (!response.ok) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
  try { return await response.json() as T; }
  catch { throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503); }
}

export async function registerDevice(transport: ServerTransport, device: StoredDevice): Promise<RegistrationResponse> {
  const challenge = await jsonOf<ChallengeResponse>(await transport.request('/v1/identity/devices/challenge', {
    method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({purpose: 'register'}),
  }));
  if (typeof challenge.nonce !== 'string' || !challenge.nonce) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
  const signed = Buffer.concat([Buffer.from(challenge.nonce, 'utf8'), rawPublicKey(device)]);
  const result = await jsonOf<RegistrationResponse>(await transport.request('/v1/identity/devices', {
    method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({
      publicKey: device.publicKey,
      nonce: challenge.nonce,
      signature: Buffer.from(signWithDevice(device, signed)).toString('base64url'),
    }),
  }));
  if (result.deviceId !== device.deviceId) throw new CoreError('CORE_DEVICE_ID_MISMATCH', 502);
  if (typeof result.principalId !== 'string' || !result.principalId) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
  return result;
}

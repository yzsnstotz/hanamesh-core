import { signWithDevice } from './device.js';
import { CoreError } from './errors.js';
async function jsonOf(response) {
    if (!response.ok)
        throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
    try {
        return await response.json();
    }
    catch {
        throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
    }
}
export async function registerDevice(transport, device) {
    const challenge = await jsonOf(await transport.request('/v1/identity/devices/challenge', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ purpose: 'register' }),
    }));
    if (typeof challenge.nonce !== 'string' || !challenge.nonce)
        throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
    // O1 identity docs/API.md: signature = ed25519(utf8(nonce ‖ publicKey)) where publicKey is the base64url string as sent (P1 A1-1: identity API.md is authoritative).
    const signed = Buffer.from(challenge.nonce + device.publicKey, 'utf8');
    const result = await jsonOf(await transport.request('/v1/identity/devices', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
            publicKey: device.publicKey,
            nonce: challenge.nonce,
            signature: Buffer.from(signWithDevice(device, signed)).toString('base64url'),
        }),
    }));
    if (result.deviceId !== device.deviceId)
        throw new CoreError('CORE_DEVICE_ID_MISMATCH', 502);
    if (typeof result.principalId !== 'string' || !result.principalId)
        throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
    return result;
}

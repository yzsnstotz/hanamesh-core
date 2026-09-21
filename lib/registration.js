import { hostname } from 'node:os';
import { signWithDevice } from './device.js';
import { CoreError } from './errors.js';
const LABEL_LIMITS = Object.freeze({ hostname: 64, os: 32, shell: 48 });
const clamp = (value, limit) => value.replace(/[\u0000-\u001f\u007f]/gu, '').trim().slice(0, limit).trim();
/** Owner-facing label so several DSH profiles on one machine can be told apart on the website (STATUS `DEVICE-PER-PROFILE`).
 *  `shell` is `HANAMESH_SHELL` when the hosting shell sets it (desktop: `hanamesh-desktop/<version>`), else `dsh` (official DSH sets nothing). */
export function deviceLabel(env = process.env) {
    const label = {
        hostname: clamp(hostname(), LABEL_LIMITS.hostname),
        os: clamp(`${process.platform}-${process.arch}`, LABEL_LIMITS.os),
        shell: clamp(env['HANAMESH_SHELL'] ?? 'dsh', LABEL_LIMITS.shell) || 'dsh',
    };
    return label.hostname && label.os && label.shell ? Object.freeze(label) : null;
}
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
async function attempt(transport, device, label) {
    const challenge = await jsonOf(await transport.request('/v1/identity/devices/challenge', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ purpose: 'register' }),
    }));
    if (typeof challenge.nonce !== 'string' || !challenge.nonce)
        throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
    // O1 identity docs/API.md: signature = ed25519(utf8(nonce ‖ publicKey)) where publicKey is the base64url string as sent (P1 A1-1: identity API.md is authoritative).
    const signed = Buffer.from(challenge.nonce + device.publicKey, 'utf8');
    return transport.request('/v1/identity/devices', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
            publicKey: device.publicKey,
            nonce: challenge.nonce,
            signature: Buffer.from(signWithDevice(device, signed)).toString('base64url'),
            ...(label ? { label } : {}),
        }),
    });
}
export async function registerDevice(transport, device, label = deviceLabel()) {
    let response = await attempt(transport, device, label);
    // identity ≤0.2.0-rc.2 rejects unknown body keys with 400 before consuming the nonce; re-register label-free so the
    // client keeps working against the server that is online now. Any other status is reported as-is.
    if (label && response.status === 400)
        response = await attempt(transport, device, null);
    const result = await jsonOf(response);
    if (result.deviceId !== device.deviceId)
        throw new CoreError('CORE_DEVICE_ID_MISMATCH', 502);
    if (typeof result.principalId !== 'string' || !result.principalId)
        throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
    return result;
}

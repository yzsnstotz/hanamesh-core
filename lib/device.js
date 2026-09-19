import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign as cryptoSign } from 'node:crypto';
import { CoreError } from './errors.js';
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
export function createDevice(now = new Date()) {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const spki = publicKey.export({ format: 'der', type: 'spki' });
    const raw = spki.subarray(-32);
    return Object.freeze({
        deviceId: createHash('sha256').update(raw).digest('base64url'),
        publicKey: raw.toString('base64url'),
        privateKeyPkcs8: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64url'),
        createdAt: now.toISOString(),
    });
}
export function rawPublicKey(device) {
    return Buffer.from(device.publicKey, 'base64url');
}
function checkedPrivateKey(device) {
    try {
        const raw = rawPublicKey(device);
        if (raw.byteLength !== 32)
            throw new Error('wrong public key length');
        const privateKey = createPrivateKey({ key: Buffer.from(device.privateKeyPkcs8, 'base64url'), format: 'der', type: 'pkcs8' });
        const derivedSpki = createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
        const derivedRaw = derivedSpki.subarray(-32);
        const derivedId = createHash('sha256').update(raw).digest('base64url');
        if (!derivedRaw.equals(raw) || derivedId !== device.deviceId)
            throw new Error('device snapshot mismatch');
        return privateKey;
    }
    catch {
        throw new CoreError('CORE_DEVICE_CORRUPT', 500);
    }
}
export function signWithDevice(device, bytes) {
    return new Uint8Array(cryptoSign(null, bytes, checkedPrivateKey(device)));
}
export function requestNonce() {
    return randomBytes(16).toString('base64url');
}

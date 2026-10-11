import type { StoredCoreSnapshot } from './contracts.js';
export type StoredDevice = NonNullable<StoredCoreSnapshot['device']>;
export declare function createDevice(now?: Date): StoredDevice;
export declare function rawPublicKey(device: StoredDevice): Buffer;
/** Throws CORE_DEVICE_CORRUPT unless the private key, public key and deviceId belong together. */
export declare function verifyDevice(device: StoredDevice): void;
export declare function signWithDevice(device: StoredDevice, bytes: Uint8Array): Uint8Array;
export declare function requestNonce(): string;

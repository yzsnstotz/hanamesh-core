import type { StoredCoreSnapshot } from './contracts.js';
export type StoredDevice = NonNullable<StoredCoreSnapshot['device']>;
export declare function createDevice(now?: Date): StoredDevice;
export declare function rawPublicKey(device: StoredDevice): Buffer;
export declare function signWithDevice(device: StoredDevice, bytes: Uint8Array): Uint8Array;
export declare function requestNonce(): string;

import { type StoredDevice } from './device.js';
/** Carry the original Identity deadline as editable display metadata, never authorization. */
export declare function createBindLink(website: string, device: StoredDevice, value: unknown): {
    url: string;
    expiresAt: string;
};

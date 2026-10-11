import { type StoredDevice } from './device.js';
import { CoreError } from './errors.js';
/** One device identity per OS user, shared by every client (DSH, HanaMesh desktop) that loads Core.
 *  The file is write-once: the first client to claim it defines the machine identity, later claims read it back. */
export interface SharedDeviceStore {
    readonly location: string;
    /** null = no shared identity yet. Unreadable → CORE_DEVICE_STORE_UNAVAILABLE; malformed or key mismatch → CORE_DEVICE_CORRUPT. */
    read(): Promise<StoredDevice | null>;
    /** Atomically publish `device` unless a shared identity already exists; returns whichever identity won. */
    claim(device: StoredDevice): Promise<StoredDevice>;
}
/** Resolution order: plugin config `sharedIdentityDir`, env `HANAMESH_SHARED_HOME`, `~/.hanamesh-shared`. Both clients must
 *  resolve the same root, so the default is per OS user and never inside a client's own home (`~/.dsh`, `~/.hanamesh`). */
export declare function sharedIdentityRoot(config: {
    sharedIdentityDir?: string | null;
}, env: Record<string, string | undefined>, home: string): string;
/** Keeps the OS errno (EACCES, ENOSPC, …) so the settings section can say what actually failed. */
export type SharedStoreError = CoreError & {
    readonly detail: string | null;
};
export declare function fileSharedDeviceStore(root: string): SharedDeviceStore;

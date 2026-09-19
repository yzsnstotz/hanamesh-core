export interface PluginConfig {
    readonly serverOrigin: string | null;
    readonly websiteOrigin: string | null;
    readonly allowSystemBrowser?: boolean;
    readonly timeoutMs?: number;
    readonly authNonceSource?: 'client' | 'server';
    readonly checkIntervalMs?: number;
}
export interface StoredCoreSnapshot {
    readonly schemaVersion: 1;
    readonly revision: number;
    readonly device: null | {
        readonly deviceId: string;
        readonly publicKey: string;
        readonly privateKeyPkcs8: string;
        readonly createdAt: string;
    };
    readonly registration: {
        readonly status: 'unregistered' | 'registered' | 'failed';
        readonly principalId: string | null;
        readonly registeredAt: string | null;
        readonly lastError: string | null;
        readonly attempts: number;
    };
    readonly consent: {
        readonly state: 'withheld' | 'granted';
        readonly changedAt: string | null;
    };
    readonly serverObservation: {
        readonly reachable: boolean | null;
        readonly checkedAt: string | null;
    };
}
export interface CoreStore {
    read(): unknown;
    publish(value: StoredCoreSnapshot): Promise<void>;
    close(): Promise<void>;
}
export declare const INITIAL_CORE_SNAPSHOT: StoredCoreSnapshot;

export interface PluginConfig {
    readonly serverOrigin: string | null;
    readonly websiteOrigin: string | null;
    readonly allowSystemBrowser?: boolean;
    readonly timeoutMs?: number;
    readonly authNonceSource?: 'client' | 'server';
    readonly checkIntervalMs?: number;
    /** Local response budget; not a server pagination limit. Default 200 Hana rows. */
    readonly maxHanaRows?: number;
    /** Catalog request deadline in milliseconds, default 1500, bounded by timeoutMs. */
    readonly profileTimeoutMs?: number;
    /** Local memory budget for each upstream response, default 1 MiB. */
    readonly maxResponseBytes?: number;
    readonly clientPollIntervalMs?: number;
    readonly pointsRefreshMs?: number;
    readonly contributionIntervalMs?: number;
    readonly activityPageBudget?: number;
    readonly activityDisplayRows?: number;
    readonly catalogConcurrency?: number;
    /** Absolute root of the machine-wide shared identity (`<root>/identity/device.json`). null/absent → env
     *  `HANAMESH_SHARED_HOME`, then `~/.hanamesh-shared`. Every client on the machine must resolve the same root. */
    readonly sharedIdentityDir?: string | null;
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
    /** T2: ISO timestamp of the one-time "bind to keep your pending points" prompt. Optional so rc.30 snapshots stay loadable. */
    readonly pointsBindPromptShownAt?: string | null;
    /** J1.S4: this client's own identity that lost to an existing shared identity. Kept (not deleted) so it stays
     *  recoverable; optional so pre-J1.S4 snapshots stay loadable. */
    readonly replacedDevices?: ReadonlyArray<NonNullable<StoredCoreSnapshot['device']> & {
        readonly replacedAt: string;
    }>;
}
export interface CoreStore {
    read(): unknown;
    publish(value: StoredCoreSnapshot): Promise<void>;
    close(): Promise<void>;
}
export declare const INITIAL_CORE_SNAPSHOT: StoredCoreSnapshot;

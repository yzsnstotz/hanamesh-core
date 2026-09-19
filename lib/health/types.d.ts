export type ComponentStatus = 'satisfied' | 'missing' | 'incompatible' | 'damaged' | 'unreadable' | 'inactive' | 'failed' | 'ambiguous';
export type FailurePolicy = 'block' | 'restrict' | 'notice';
export interface SuiteComponent {
    readonly id: string;
    readonly moduleName: string;
    readonly loaderEntryId?: string;
    readonly label: string;
    readonly versionRange: string;
    readonly onFailure: FailurePolicy;
    readonly impact: string;
}
export interface SuiteProfile {
    readonly schemaVersion: 1;
    readonly id: string;
    readonly version: string;
    readonly label: string;
    readonly runningTaskPolicy: 'preserve-and-pause' | 'preserve-and-drain';
    readonly components: readonly SuiteComponent[];
}
export interface ComponentObservation {
    readonly kind: 'present' | Exclude<ComponentStatus, 'satisfied' | 'incompatible' | 'inactive' | 'failed'>;
    readonly version?: string;
    readonly phase?: 'active' | 'staged' | 'disabled' | 'pending' | 'loading' | 'failed' | 'unloading';
    readonly stagedVersion?: string;
}
export interface ComponentHealth {
    readonly id: string;
    readonly moduleName: string;
    readonly label: string;
    readonly requiredRange: string;
    readonly onFailure: FailurePolicy;
    readonly status: ComponentStatus;
    readonly reason: string;
    readonly impact: string;
    readonly version: string | null;
    readonly phase: string;
    readonly stagedVersion: string | null;
    readonly nextStep: string | null;
}
export interface CoreHealthSnapshot {
    readonly schemaVersion: 1;
    readonly profile: {
        readonly id: string;
        readonly version: string;
        readonly label: string;
        readonly digest: string;
    };
    readonly revision: number;
    readonly checkedAt: string;
    readonly mode: 'normal' | 'restricted' | 'blocked' | 'repair';
    readonly components: readonly ComponentHealth[];
    readonly newProtectedOperations: 'reject' | 'resource-check-still-required';
    readonly runningTaskPolicy: 'unchanged' | 'preserve-and-pause' | 'preserve-and-drain';
    readonly nextStep: string;
    readonly persistence: 'durable' | 'unavailable';
    readonly fault?: 'CHECK_NOT_RUN' | 'INVENTORY_UNAVAILABLE' | 'PERSISTENCE_UNAVAILABLE';
}
export interface ObservationSource {
    observe(requirements: readonly SuiteComponent[]): Promise<readonly ComponentObservation[]>;
}
export interface HealthStore {
    publish(snapshot: CoreHealthSnapshot): Promise<void>;
    close?(): Promise<void>;
}

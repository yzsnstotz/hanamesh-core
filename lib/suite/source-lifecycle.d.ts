import { type SuitePackageSourceOptions } from './source.js';
export type SuiteSourceSelection = {
    readonly mode: 'configured';
} | {
    readonly mode: 'disabled';
} | {
    readonly mode: 'custom';
    readonly options: SuitePackageSourceOptions;
};
export interface SuiteSourceSnapshot {
    readonly schemaVersion: 1;
    readonly selection: SuiteSourceSelection;
}
export interface SuiteSourceStore {
    read(): unknown;
    publish(value: SuiteSourceSnapshot): Promise<void>;
    close(): Promise<void>;
}
export interface SuiteSourceState {
    readonly protocolVersion: '1';
    readonly status: 'disabled' | 'ready' | 'failed' | 'disposed';
    readonly selection: SuiteSourceSelection['mode'];
    readonly registry: string | null;
    readonly archiveCount: number;
    readonly lastError: string | null;
}
/** Cross-plugin discovery is read-only; source configuration belongs to Core's own admitted page. */
export interface HanaMeshSuiteSourceService {
    readonly protocolVersion: '1';
    getState(): SuiteSourceState;
}
export declare function suiteSourceOptions(value: unknown): SuitePackageSourceOptions;
export declare function suiteSourceSnapshot(value: unknown): SuiteSourceSnapshot;
/** All listeners belong to this ordinary plugin activation, never Electron or a boot hook. */
export declare function createManagedSuitePackageSource(configured: SuitePackageSourceOptions | null, store: SuiteSourceStore): Promise<ManagedSuitePackageSource>;
export interface ManagedSuitePackageSource {
    readonly service: HanaMeshSuiteSourceService;
    getConfiguration(): {
        configured: SuitePackageSourceOptions | null;
        selection: SuiteSourceSelection;
    };
    configure(input: unknown): Promise<SuiteSourceState>;
    close(): Promise<void>;
}

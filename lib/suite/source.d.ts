export interface SuitePackageSourceOptions {
    readonly archives: readonly {
        readonly path: string;
        readonly integrity: string;
    }[];
    readonly port: number;
    readonly peerRegistry: string;
    readonly maxArchiveBytes: number;
    readonly maxExpandedBytes: number;
    readonly maxEntries: number;
    readonly maxManifestBytes: number;
    readonly maxResponseBytes: number;
    readonly timeoutMs: number;
}
export interface SuitePackageSource {
    readonly registry: string;
    close(): Promise<void>;
}
/** Read-only, explicitly owned loopback npm source backed by normal SRI-verified package archives. */
export declare function createSuitePackageSource(options: SuitePackageSourceOptions): Promise<SuitePackageSource>;
export { createManagedSuitePackageSource, suiteSourceOptions, suiteSourceSnapshot } from './source-lifecycle.js';
export type { ManagedSuitePackageSource, SuiteSourceSelection, SuiteSourceSnapshot, SuiteSourceStore, SuiteSourceState, HanaMeshSuiteSourceService } from './source-lifecycle.js';

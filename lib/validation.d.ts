import { INITIAL_CORE_SNAPSHOT, type PluginConfig, type StoredCoreSnapshot } from './contracts.js';
export declare const CORE_DEFAULTS: Readonly<{
    timeoutMs: 10000;
    checkIntervalMs: 3000;
    maxHanaRows: 200;
    profileTimeoutMs: 1500;
    maxResponseBytes: number;
    clientPollIntervalMs: 10000;
    pointsRefreshMs: 60000;
    contributionIntervalMs: 60000;
    activityPageBudget: 5;
    activityDisplayRows: 25;
    catalogConcurrency: 4;
}>;
export declare function configOf(input: PluginConfig): Required<PluginConfig>;
export declare function snapshotOf(input: unknown): StoredCoreSnapshot;
export declare function publicJson(input: unknown): unknown;
export { INITIAL_CORE_SNAPSHOT };

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
    contributionWindowDays: 90;
    suiteLocalTestRegistries: readonly string[];
}>;
/** C-USAGE: a raw-event window (contributions from/to, device events from/to) is at most 90 days. Contract invariant, not a setting. */
export declare const USAGE_MAX_WINDOW_DAYS = 90;
/** The same rules as the `serverOrigin` config, for the address set in Core's settings page (a non-null string). */
export declare function serverOriginOf(value: unknown): string;
export declare function configOf(input: PluginConfig): Required<PluginConfig>;
export declare function snapshotOf(input: unknown): StoredCoreSnapshot;
export declare function publicJson(input: unknown): unknown;
export { INITIAL_CORE_SNAPSHOT };

import { INITIAL_CORE_SNAPSHOT, type PluginConfig, type StoredCoreSnapshot } from './contracts.js';
export declare function configOf(input: PluginConfig): Required<PluginConfig>;
export declare function snapshotOf(input: unknown): StoredCoreSnapshot;
export declare function publicJson(input: unknown): unknown;
export { INITIAL_CORE_SNAPSHOT };

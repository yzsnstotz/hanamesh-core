import type { ComponentObservation } from '../health/types.js';
import type { PackageMetadata } from './types.js';
/** Reads public package metadata only; resolving an entry never executes its module. */
export declare function packageMetadata(name: string, baseUrl: string, entry?: string, maxResponseBytes?: number): Promise<PackageMetadata | null>;
export declare function suiteInspector(maxResponseBytes?: number): (name: string, baseUrl: string, entry?: string) => Promise<ComponentObservation>;

import type { RegistryMetadata } from './types.js';
export interface RegistryReaderOptions {
    readonly timeoutMs?: number;
    readonly maxResponseBytes?: number;
    /** Explicitly owned test registries only. Production DSH never supplies this option. */
    readonly localTestRegistries?: readonly string[];
}
export declare class RegistryMetadataReader {
    readonly options: RegistryReaderOptions;
    readonly timeoutMs: number;
    readonly maxResponseBytes: number;
    constructor(options?: RegistryReaderOptions);
    normalize(registry: string): string;
    read(registry: string, name: string): Promise<RegistryMetadata>;
}

import type { ComponentObservation, ObservationSource, SuiteComponent } from './types.js';
type LoaderEntry = {
    id: string;
    disabled?: boolean;
    options: {
        name?: string;
        group?: boolean;
    };
    fiber?: {
        state?: number;
    };
    parent?: {
        tree?: {
            ctx?: {
                baseUrl?: string;
            };
        };
    };
};
type LoaderLike = {
    entries(): Iterable<LoaderEntry>;
};
export declare function inspectPackage(moduleName: string, baseUrl: string, entrySpecifier?: string): Promise<ComponentObservation>;
export declare class LoaderObservationSource implements ObservationSource {
    readonly loader: LoaderLike;
    readonly baseUrl: string;
    readonly inspector: typeof inspectPackage;
    constructor(loader: LoaderLike, baseUrl: string, inspector?: typeof inspectPackage);
    observe(requirements: readonly SuiteComponent[]): Promise<readonly ComponentObservation[]>;
}
export {};

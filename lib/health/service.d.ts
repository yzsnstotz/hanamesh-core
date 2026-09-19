import type { CoreHealthSnapshot, HealthStore, ObservationSource, SuiteProfile } from './types.js';
export declare class HealthService {
    #private;
    constructor(profile: SuiteProfile, source: ObservationSource, store: HealthStore);
    getHealth(): CoreHealthSnapshot;
    recheck(): Promise<CoreHealthSnapshot>;
    close(): Promise<void>;
}

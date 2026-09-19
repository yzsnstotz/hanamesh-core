import type { ComponentObservation, CoreHealthSnapshot, SuiteProfile } from './types.js';
export declare function evaluate(profile: SuiteProfile, observations: readonly ComponentObservation[], revision: number, now?: Date): CoreHealthSnapshot;
export declare function faultSnapshot(profile: SuiteProfile, revision: number, fault: NonNullable<CoreHealthSnapshot['fault']>): CoreHealthSnapshot;

import type { CoreConsumerUnderTest, CoreProviderUnderTest } from './contract-fixtures.js';
export interface CoreSuiteRow {
    readonly id: string;
    readonly ok: boolean;
    readonly detail: string;
}
export interface CoreSuiteResult {
    readonly suite: 'hanamesh-core/contract';
    readonly protocolVersion: '1';
    readonly side: 'provider' | 'consumer';
    readonly subject: string;
    readonly ok: boolean;
    readonly results: readonly CoreSuiteRow[];
}
type Schema = Record<string, unknown>;
export declare function loadCoreSchema(): Promise<Schema>;
/** Returns schema violations of `value` against `$defs/<defName>` of the v1 schema (empty array = valid). */
export declare function validateCoreValue(defName: string, value: unknown, schema?: Schema | null): string[];
/**
 * Provider side: runs a candidate `hanameshCore` provider through every v1 expectation.
 * Consent is changed only through `provider.setConsent` and restored to its starting value afterwards.
 */
export declare function runCoreProviderSuite(provider: CoreProviderUnderTest): Promise<CoreSuiteResult>;
/** Consumer side: the consumer's acceptance function must classify the fixed handshake matrix exactly (no silent compatibility). */
export declare function runCoreConsumerSuite(consumer: CoreConsumerUnderTest, cases?: import("./contract-fixtures.js").CoreHandshakeCase[]): Promise<CoreSuiteResult>;
export {};

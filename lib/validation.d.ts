import type { Json, PluginConfig, PrincipalDTO, ScopedRequest, StoredObservation } from './contracts.js';
export declare const INITIAL_OBSERVATION: StoredObservation;
export declare function object(value: unknown): value is Record<string, unknown>;
export declare function configOf(config: PluginConfig): Required<PluginConfig>;
export declare function principalOf(value: unknown, deploymentId: string): PrincipalDTO;
export declare function observationOf(value: unknown): StoredObservation;
export declare function loginOf(value: unknown): {
    email: string;
    password: string;
};
export declare function requestOf(value: ScopedRequest, config: Required<PluginConfig>): {
    url: URL;
    method: string;
    body?: string;
};
/** JSON-only public results; suppress credential-shaped keys and echoed in-memory cookie bytes. */
export declare function publicJson(value: unknown, secrets?: readonly string[], depth?: number): Json;

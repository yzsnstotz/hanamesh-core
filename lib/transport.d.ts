import type { Json, PluginConfig } from './contracts.js';
interface WireResult {
    status: number;
    data: Json;
}
/** Host-private carrier. Never publishes Cookie or Set-Cookie through its result. */
export declare class IdentityTransport {
    #private;
    constructor(config: Required<PluginConfig>, fetcher?: typeof fetch);
    clear(): void;
    hasCredentials(): boolean;
    auth(kind: 'login' | 'logout', body: string, signal: AbortSignal): Promise<WireResult>;
    readPrincipal(signal: AbortSignal): Promise<WireResult>;
    resource(url: URL, method: string, body: string | undefined, signal: AbortSignal): Promise<WireResult>;
}
export {};

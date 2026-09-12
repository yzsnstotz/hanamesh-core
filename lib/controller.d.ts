import type { IdentityCheck, IdentityClientService, ObservationStore, PluginConfig, ScopedRequest, ScopedResponse, SessionSnapshot } from './contracts.js';
/** Single owner per DSH profile. Not a multi-user server or plugin security sandbox. */
export declare class IdentityController {
    #private;
    readonly service: IdentityClientService;
    constructor(config: PluginConfig, store: ObservationStore, fetcher?: typeof fetch);
    getState(): SessionSnapshot;
    subscribe(listener: (snapshot: SessionSnapshot) => void): () => void;
    /** Owner/UI-only. Not exported on ctx.hanameshIdentity or the ordinary plugin SDK. */
    signIn(input: unknown): Promise<SessionSnapshot>;
    signOut(): Promise<SessionSnapshot>;
    checkIdentity(): Promise<IdentityCheck>;
    request(input: ScopedRequest): Promise<ScopedResponse>;
    dispose(): Promise<void>;
}

/** Browser SDK; talks only to the authenticated DSH carrier. No credential or login API. */
import type { IdentityCheck, ScopedRequest, ScopedResponse, SessionSnapshot } from './contracts.js';
export declare class BrowserIdentityClient {
    #private;
    constructor(origin?: string, fetcher?: typeof fetch);
    state(): Promise<SessionSnapshot>;
    checkIdentity(): Promise<IdentityCheck>;
    request(input: ScopedRequest): Promise<ScopedResponse>;
}

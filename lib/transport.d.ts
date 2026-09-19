export declare class ServerTransport {
    #private;
    constructor(origin: string | null, timeoutMs: number, fetcher?: typeof fetch);
    get configured(): boolean;
    request(path: string, init?: RequestInit): Promise<Response>;
}

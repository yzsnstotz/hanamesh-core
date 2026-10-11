export declare class ServerTransport {
    #private;
    constructor(origin: string | null, timeoutMs: number, fetcher?: typeof fetch, maxResponseBytes?: number);
    get configured(): boolean;
    dispose(): void;
    request(path: string, init?: RequestInit): Promise<Response>;
}

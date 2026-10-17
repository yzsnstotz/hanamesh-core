export interface ClientPeerFacts {
    readonly source: 'core-client-lease';
    readonly status: 'known' | 'unknown';
    readonly reason: string | null;
    readonly reactVersion: string | null;
    /** Opaque, process-local observation token; not a Host epoch or execution authorization. */
    readonly contextId: string;
}
type Result = {
    ok: false;
    error: {
        code: string;
        message: string;
        details: object;
    };
};
/** Each authenticated Fetch invocation owns one live observation until its actual transport aborts. */
export declare class ClientPeerLeases {
    private readonly capable;
    private readonly salt;
    private revision;
    private disposed;
    private readonly active;
    constructor(capable: boolean);
    snapshot(): ClientPeerFacts;
    hold(payload: unknown, signal: AbortSignal): Promise<Result>;
    close(): void;
}
export {};

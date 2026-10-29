export declare class AgentOriginLedger {
    private readonly db;
    private readonly hmacKey;
    constructor(sharedHome: string, deviceId: string);
    static validateExisting(sharedHome: string, deviceId: string): void;
    close(): void;
    private fingerprint;
    private transaction;
    /** Core-internal identity lifecycle serialization; no corresponding agentCall operation. */
    withIdentityTransaction<T>(fn: () => T): T;
    observe(factId: string, admitted: boolean): {
        admitted: boolean;
        first: boolean;
    };
    sign(factId: string, hanaRef: string, action: 'use' | 'install', bytes: Buffer, signer: () => string): {
        signature: string;
    };
}
export declare function checkedAgentEvent(value: unknown, factId: string, deviceId: string, consentId: string): {
    hanaRef: string;
    action: 'use' | 'install';
    bytes: Buffer;
};

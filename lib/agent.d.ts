export interface AgentCoreConfig {
    sharedHome: string;
    serverOrigin: string | null;
    websiteOrigin: string | null;
    timeoutMs?: number;
}
export declare function agentCall(config: AgentCoreConfig, input: Record<string, unknown>): Promise<Record<string, unknown>>;

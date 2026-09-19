import type { CoreStore, PluginConfig } from './contracts.js';
import type { HanaMeshCoreContract, HealthSnapshot } from './contract.js';
interface HealthProvider {
    getHealth(): HealthSnapshot;
    recheck(): Promise<HealthSnapshot>;
}
type Contributions = {
    status: 'unavailable';
    reason: string;
} | {
    status: 'ready';
    windowDays: 90;
    actions: {
        install: number;
        open: number;
        use: number;
        uninstall: number;
    };
};
export declare class SessionController {
    #private;
    readonly service: HanaMeshCoreContract;
    private constructor();
    static create(config: PluginConfig, store: CoreStore, options?: {
        fetcher?: typeof fetch;
    }): Promise<SessionController>;
    setConsent(state: 'granted' | 'withheld'): Promise<{
        state: 'granted' | 'withheld';
        changedAt: string;
    }>;
    register(): Promise<ReturnType<HanaMeshCoreContract['getSession']>>;
    startRegistration(): Promise<void>;
    startContributions(): void;
    attachHealth(provider: HealthProvider): void;
    attachUsageProbe(probe: () => boolean): void;
    recheckHealth(): Promise<HealthSnapshot>;
    openExternal(url: string): {
        opened: boolean;
        reason?: 'DISABLED';
    };
    refreshContributions(): Promise<Contributions>;
    state(): unknown;
    diagnostics(): unknown;
    dispose(): Promise<void>;
}
export {};

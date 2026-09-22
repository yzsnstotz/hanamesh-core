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
/** T2 custody `GET /v1/custody/me/points`: every number is 分 (points), never a token amount. `pending` is this device's
 *  unbound-device balance, which the server moves into the account the moment the device is bound. */
declare const BREAKDOWN_KEYS: readonly ["install", "open", "use", "claimBonus", "creatorMirror", "launchInitiator"];
type BreakdownKey = (typeof BREAKDOWN_KEYS)[number];
export type HanaPoints = {
    hanaId: string;
    points: number;
    pending: number;
    breakdown: Record<BreakdownKey, number>;
};
type Points = {
    status: 'unavailable';
    reason: string;
    totalPoints: 0;
    pendingTotal: 0;
    hanas: readonly HanaPoints[];
} | {
    status: 'ready';
    reason: null;
    totalPoints: number;
    pendingTotal: number;
    hanas: readonly HanaPoints[];
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
    /** Website bind landing (O2 `/me/bind?deviceId&nonce&signature`): a server `bind` challenge nonce signed by this device. */
    bindLink(): Promise<{
        url: string;
        expiresAt: string;
    }>;
    refreshContributions(): Promise<Contributions>;
    refresh(): Promise<unknown>;
    /** T2 "我的 Hana": the device-signed read of the unified points ledger. Consent and registration are checked first so a
     *  user who never opted in gets a readable empty state instead of an upstream error. */
    refreshPoints(): Promise<Points>;
    /** Public JSON for `GET /api/hanamesh/core/points`. `prompt.show` is decided here, never in the client bundle:
     *  pending points exist, this device is not bound, and the one-time prompt has never been shown. */
    points(): Promise<unknown>;
    /** Idempotent: the first call stamps the marker, later calls (restart, reinstall of the same profile) return it unchanged. */
    markPointsPromptShown(): Promise<{
        shownAt: string;
    }>;
    state(): unknown;
    diagnostics(): unknown;
    dispose(): Promise<void>;
}
export {};

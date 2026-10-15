import type { CoreStore, PluginConfig } from './contracts.js';
import type { HanaMeshCoreContract, HealthSnapshot } from './contract.js';
import type { SharedDeviceStore } from './shared-device.js';
interface HealthProvider {
    getHealth(): HealthSnapshot;
    recheck(): Promise<HealthSnapshot>;
}
/** `availability` is Usage's own completeness verdict for the window (`unavailable` = part of it is past the server's raw
 *  retention or not exactly recoverable); `null` = the server did not say. The numbers are kept either way. */
type Contributions = {
    status: 'unavailable';
    reason: string;
} | {
    status: 'ready';
    windowDays: number;
    availability: 'available' | 'unavailable' | null;
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
type HanaName = {
    displayName: string | null;
    displayNameStatus: 'ready' | 'not-found' | 'failed';
    displayNameReason: string | null;
};
export type HanaPoints = HanaName & {
    hanaId: string;
    displayName: string | null;
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
type ActivityAction = 'install' | 'open' | 'use' | 'uninstall';
type ActivityItem = {
    hanaRef: string;
    action: ActivityAction;
    occurredAt: string;
};
type ActivityWindow = {
    from: string;
    to: string;
};
type ActivityPage = {
    status: 'ready' | 'unavailable';
    reason: string | null;
    items: readonly ActivityItem[];
    nextAfter: string | null;
    window: ActivityWindow | null;
};
export declare class SessionController {
    #private;
    readonly service: HanaMeshCoreContract;
    private constructor();
    /** `sharedDevice` is the product path (dsh.mjs always passes it). Without it the identity is this client's own
     *  storage only, and `state().identity.status` says `local-only`. */
    static create(config: PluginConfig, store: CoreStore, options?: {
        fetcher?: typeof fetch;
        sharedDevice?: SharedDeviceStore;
    }): Promise<SessionController>;
    setConsent(state: 'granted' | 'withheld'): Promise<{
        state: 'granted' | 'withheld';
        changedAt: string;
    }>;
    /** Core settings page "服务端": null clears the override (back to the plugin config). Registration belongs to a server,
     *  so a change of the effective origin resets it, drops every server-owned cache and re-registers when consent allows. */
    setServerOrigin(input: string | null): Promise<unknown>;
    register(): Promise<ReturnType<HanaMeshCoreContract['getSession']>>;
    /** Activation and consent grant. Without consent nothing is sent; the settings page shows "打开数据授权后注册". */
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
    /** Usage's device-signed raw events are observations, not a per-event points ledger. */
    activity(query?: {
        from?: string;
        to?: string;
        after?: string;
    }): Promise<ActivityPage>;
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

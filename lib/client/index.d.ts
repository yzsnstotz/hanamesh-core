import { type ReactNode } from 'react';
/** Structural subset of Connection's public client contract; optional for older supported peers. */
interface PeerConnection {
    generation?: {
        getSnapshot(): {
            id: number;
        } | undefined;
        subscribe(listener: () => void): () => void;
    };
}
interface SlotRegistry {
    inject(name: string, run: () => (() => void)): () => void;
    register(spec: {
        name: string;
        id: string;
        order: number;
        label: string;
    }, component: unknown): () => void;
}
interface ClientContext {
    slots: SlotRegistry;
    connection?: PeerConnection;
    effect(run: () => (() => void), label?: string): unknown;
}
/** Current external React observation only. No storage, timers, retries or backend dependency inference. */
export declare function startClientPeerLease(connection: PeerConnection | undefined, page: Pick<Window, 'addEventListener' | 'removeEventListener'>, doFetch?: typeof fetch | undefined): () => void;
type ActivityItem = {
    hanaRef: string;
    action: 'install' | 'open' | 'use' | 'uninstall';
    occurredAt: string;
};
type ActivityState = {
    status: 'ready' | 'unavailable';
    reason: string | null;
    upstreamStatus?: number;
    items: ActivityItem[];
    nextAfter: string | null;
    window: {
        from: string;
        to: string;
    } | null;
};
type ActivityView = ActivityState & {
    scanned: number;
};
/** Usage pages are oldest-first. Never present a scanned prefix as "latest" until its cursor reaches the tail. */
export declare function collectLatestActivity(fetchPage: (query: {
    from?: string;
    to?: string;
    after?: string;
}) => Promise<ActivityState>, previous: ActivityView | null, limits?: {
    activityPageBudget: number;
    activityDisplayRows: number;
}): Promise<ActivityView>;
export declare function coreErrorText(code: string | null, upstreamStatus?: number): string;
export declare function FirstConsentPrompt({ openSettings }: {
    openSettings: () => void;
}): ReactNode;
export declare const name = "hanamesh-core-client";
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
export {};

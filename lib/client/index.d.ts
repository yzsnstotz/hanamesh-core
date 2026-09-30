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
    effect(run: () => (() => void), label?: string): unknown;
}
type ActivityItem = {
    hanaRef: string;
    action: 'install' | 'open' | 'use' | 'uninstall';
    occurredAt: string;
};
type ActivityState = {
    status: 'ready' | 'unavailable';
    reason: string | null;
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
}) => Promise<ActivityState>, previous: ActivityView | null): Promise<ActivityView>;
export declare const name = "hanamesh-core-client";
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
export {};

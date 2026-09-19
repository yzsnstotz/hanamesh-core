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
export declare const name = "hanamesh-core-client";
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
export {};

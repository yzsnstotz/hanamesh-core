import type { SessionStatus } from './contracts.js';
export declare const STATE_PRESENTATION: Readonly<Record<SessionStatus, Readonly<{
    label: string;
    description: string;
    marker: string;
}>>>;
/** Semantic functional UI only. ui-kit artifact is missing; do not invent theme tokens. */
export declare function renderLoginPage(): string;

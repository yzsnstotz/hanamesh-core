import { SessionController } from './controller.js';
import type { ClientPeerLeases } from './suite/client-peers.js';
export declare const ROUTES: Readonly<{
    state: "/api/hanamesh/core/state";
    consent: "/api/hanamesh/core/consent";
    consentPromptShown: "/api/hanamesh/core/consent/prompt-shown";
    server: "/api/hanamesh/core/server";
    website: "/api/hanamesh/core/website";
    register: "/api/hanamesh/core/device/register";
    health: "/api/hanamesh/core/health";
    points: "/api/hanamesh/core/points";
    activity: "/api/hanamesh/core/activity";
    pointsPromptShown: "/api/hanamesh/core/points/prompt-shown";
    healthRecheck: "/api/hanamesh/core/health/recheck";
    refresh: "/api/hanamesh/core/refresh";
    openExternal: "/api/hanamesh/core/open-external";
    bindLink: "/api/hanamesh/core/bind-link";
    diagnostics: "/api/hanamesh/core/diagnostics";
    clientPeerLease: "/api/hanamesh/core/client-peer-lease";
}>;
export declare function createRouteHandler(controller: SessionController, admission?: {
    requestRejection(request: Request): 401 | 403 | undefined;
} | null, clientPeers?: Pick<ClientPeerLeases, 'open'>): (request: Request) => Promise<Response>;
export declare function requireSameCarrierOrigin(request: Request): void;

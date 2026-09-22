import { SessionController } from './controller.js';
export declare const ROUTES: Readonly<{
    state: "/api/hanamesh/core/state";
    consent: "/api/hanamesh/core/consent";
    register: "/api/hanamesh/core/device/register";
    health: "/api/hanamesh/core/health";
    points: "/api/hanamesh/core/points";
    pointsPromptShown: "/api/hanamesh/core/points/prompt-shown";
    healthRecheck: "/api/hanamesh/core/health/recheck";
    refresh: "/api/hanamesh/core/refresh";
    openExternal: "/api/hanamesh/core/open-external";
    bindLink: "/api/hanamesh/core/bind-link";
    diagnostics: "/api/hanamesh/core/diagnostics";
}>;
export declare function createRouteHandler(controller: SessionController): (request: Request) => Promise<Response>;
export declare function requireSameCarrierOrigin(request: Request): void;

import { IdentityController } from './controller.js';
export declare const ROUTES: Readonly<{
    state: "/api/hanamesh/identity/state";
    refresh: "/api/hanamesh/identity/refresh";
    signIn: "/api/hanamesh/identity/sign-in";
    signOut: "/api/hanamesh/identity/sign-out";
    request: "/api/hanamesh/identity/request";
    diagnostics: "/api/hanamesh/identity/diagnostics";
}>;
/** Call only AFTER the carrier's Host/Origin fence and DSH browser authentication. */
export declare function createRouteHandler(controller: IdentityController): (request: Request) => Promise<Response>;

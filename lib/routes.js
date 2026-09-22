import { CoreError, safeError } from './errors.js';
export const ROUTES = Object.freeze({
    state: '/api/hanamesh/core/state',
    consent: '/api/hanamesh/core/consent',
    register: '/api/hanamesh/core/device/register',
    health: '/api/hanamesh/core/health',
    points: '/api/hanamesh/core/points',
    pointsPromptShown: '/api/hanamesh/core/points/prompt-shown',
    healthRecheck: '/api/hanamesh/core/health/recheck',
    refresh: '/api/hanamesh/core/refresh',
    openExternal: '/api/hanamesh/core/open-external',
    bindLink: '/api/hanamesh/core/bind-link',
    diagnostics: '/api/hanamesh/core/diagnostics',
});
const ROUTE_PATHS = new Set(Object.values(ROUTES));
function response(value, status = 200) {
    return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
export function createRouteHandler(controller) {
    return async (request) => {
        try {
            const url = new URL(request.url);
            if (url.search || url.hash)
                return response({ error: { code: 'CORE_NOT_FOUND' } }, 404);
            if (!ROUTE_PATHS.has(url.pathname))
                return response({ error: { code: 'CORE_NOT_FOUND' } }, 404);
            if (url.pathname === ROUTES.state || url.pathname === ROUTES.diagnostics || url.pathname === ROUTES.health || url.pathname === ROUTES.points) {
                if (request.method !== 'GET')
                    return response({ error: { code: 'CORE_METHOD_NOT_ALLOWED' } }, 405);
                if (url.pathname === ROUTES.state)
                    return response(controller.state());
                if (url.pathname === ROUTES.health)
                    return response(controller.service.getHealth());
                if (url.pathname === ROUTES.points)
                    return response(await controller.points());
                return response(controller.diagnostics());
            }
            if (request.method !== 'POST')
                return response({ error: { code: 'CORE_METHOD_NOT_ALLOWED' } }, 405);
            requireSameCarrierOrigin(request);
            if (url.pathname === ROUTES.register)
                return response(await controller.register());
            if (url.pathname === ROUTES.healthRecheck)
                return response(await controller.recheckHealth());
            if (url.pathname === ROUTES.refresh)
                return response(await controller.refresh());
            if (url.pathname === ROUTES.bindLink)
                return response(await controller.bindLink());
            if (url.pathname === ROUTES.pointsPromptShown)
                return response(await controller.markPointsPromptShown());
            const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim();
            if (contentType !== 'application/json')
                throw new CoreError('CORE_INPUT_INVALID', 415);
            const declaredLength = Number(request.headers.get('content-length') ?? '0');
            if (Number.isFinite(declaredLength) && declaredLength > 4096)
                throw new CoreError('CORE_INPUT_INVALID', 413);
            const body = await request.text();
            if (Buffer.byteLength(body, 'utf8') > 4096)
                throw new CoreError('CORE_INPUT_INVALID', 413);
            let parsed;
            try {
                parsed = JSON.parse(body);
            }
            catch {
                throw new CoreError('CORE_INPUT_INVALID', 400);
            }
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length !== 1)
                throw new CoreError('CORE_INPUT_INVALID', 400);
            if (url.pathname === ROUTES.openExternal) {
                const target = parsed.url;
                if (typeof target !== 'string')
                    throw new CoreError('CORE_INPUT_INVALID', 400);
                return response(controller.openExternal(target));
            }
            if (!('state' in parsed))
                throw new CoreError('CORE_INPUT_INVALID', 400);
            const state = parsed.state;
            if (state !== 'granted' && state !== 'withheld')
                throw new CoreError('CORE_INPUT_INVALID', 400);
            return response(await controller.setConsent(state));
        }
        catch (error) {
            const safe = safeError(error);
            return response({ error: { code: safe.code, message: safe.message } }, safe.status);
        }
    };
}
export function requireSameCarrierOrigin(request) {
    const origin = request.headers.get('origin');
    const requestOrigin = new URL(request.url).origin;
    const host = request.headers.get('host');
    const fetchSite = request.headers.get('sec-fetch-site');
    let parsedOrigin = null;
    try {
        parsedOrigin = origin ? new URL(origin) : null;
    }
    catch { /* rejected below */ }
    const allowedProtocol = parsedOrigin?.protocol === 'http:' || parsedOrigin?.protocol === 'https:';
    const canonicalOrigin = parsedOrigin !== null && origin === parsedOrigin.origin;
    const carrierMatches = parsedOrigin !== null && (host ? parsedOrigin.host === host : parsedOrigin.origin === requestOrigin);
    if (!allowedProtocol || !canonicalOrigin || !carrierMatches || (fetchSite !== null && fetchSite !== 'same-origin'))
        throw new CoreError('CORE_INPUT_INVALID', 403);
}

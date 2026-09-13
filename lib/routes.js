import { IdentityClientError, safeError } from './errors.js';
import { object } from './validation.js';
export const ROUTES = Object.freeze({ state: '/api/hanamesh/identity/state', refresh: '/api/hanamesh/identity/refresh',
    signIn: '/api/hanamesh/identity/sign-in', signOut: '/api/hanamesh/identity/sign-out', request: '/api/hanamesh/identity/request', diagnostics: '/api/hanamesh/identity/diagnostics' });
function json(data, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}
async function readJson(request, limit) {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? ''))
        throw new IdentityClientError('IDENTITY_INPUT_INVALID', 415);
    const length = request.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit))
        throw new IdentityClientError('IDENTITY_INPUT_INVALID', 413);
    const reader = request.body?.getReader();
    if (!reader)
        throw new IdentityClientError('IDENTITY_INPUT_INVALID', 400);
    const chunks = [];
    let size = 0;
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done)
                break;
            size += value.byteLength;
            if (size > limit) {
                await reader.cancel();
                throw new IdentityClientError('IDENTITY_INPUT_INVALID', 413);
            }
            chunks.push(value);
        }
    }
    finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    try {
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    }
    catch {
        throw new IdentityClientError('IDENTITY_INPUT_INVALID', 400);
    }
}
function sameCarrierOrigin(request, url) {
    const origin = request.headers.get('origin');
    if (origin === null)
        return false;
    const host = request.headers.get('host');
    // DSH's authenticated HTTP bridge constructs Request.url with dsh.internal,
    // while preserving the already-fenced external Host and Origin headers.
    if (host === null)
        return origin === url.origin;
    try {
        const parsed = new URL(origin);
        return parsed.origin === origin && (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host === host;
    }
    catch {
        return false;
    }
}
/** Call only AFTER the carrier's Host/Origin fence and DSH browser authentication. */
export function createRouteHandler(controller) {
    return async (request) => {
        try {
            const url = new URL(request.url);
            const path = url.pathname;
            if (url.search || !Object.values(ROUTES).includes(path))
                return json({ error: { code: 'IDENTITY_NOT_FOUND', message: '未找到接口。' } }, 404);
            const read = path === ROUTES.state || path === ROUTES.diagnostics;
            if (request.method !== (read ? 'GET' : 'POST'))
                return json({ error: { code: 'REQUEST_NOT_ALLOWED', message: '请求方法不受支持。' } }, 405);
            if (!read && (!sameCarrierOrigin(request, url) ||
                ['cross-site', 'same-site'].includes(request.headers.get('sec-fetch-site') ?? '')))
                throw new IdentityClientError('IDENTITY_ORIGIN_REJECTED', 403);
            if (path === ROUTES.state)
                return json(controller.getState());
            if (path === ROUTES.diagnostics) {
                const state = controller.getState();
                return json({ protocolVersion: state.protocolVersion, status: state.status, serviceReady: state.serviceReady,
                    reason: state.reason, persistence: state.persistence, logoutPending: state.logoutPending, privateWork: state.privateWork });
            }
            const input = await readJson(request, path === ROUTES.request ? 32768 : 8192);
            if (path === ROUTES.signIn)
                return json(await controller.signIn(input));
            if (path === ROUTES.request)
                return json(await controller.request(input));
            if (!object(input) || Object.keys(input).length !== 0)
                throw new IdentityClientError('IDENTITY_INPUT_INVALID', 400);
            if (path === ROUTES.signOut)
                return json(await controller.signOut());
            return json(await controller.checkIdentity());
        }
        catch (error) {
            const safe = safeError(error);
            return json(safe.toJSON(), safe.status);
        }
    };
}

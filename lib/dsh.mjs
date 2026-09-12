import { readFile } from 'node:fs/promises';
import { IdentityController } from './controller.js';
import { createRouteHandler, ROUTES } from './routes.js';
import { SESSION_STATUSES } from './contracts.js';
import { INITIAL_OBSERVATION, observationOf } from './validation.js';
import { renderLoginPage } from './view.js';
export const name = 'hanamesh-plugin-identity';
export const inject = ['connection', 'webServer', 'storageDomain'];
/**
 * Actual pinned public APIs used: storageDomain.open/global.get/global.set/close,
 * connection.fetch.register/requestRejection, webServer.register, ctx.provide/on/effect.
 * No guessed ctx.web, custom browser-token exchange, or session append API.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {import('./contracts.js').PluginConfig} config
 */
export async function apply(ctx, config) {
  const { defineDomain } = await import('@deepseek-ai/dsh-storage-domain');
  const { z } = await import('zod');
  const spec = defineDomain({name: 'hanamesh_identity', version: 1, layout: 'single', tables: {}, global: {
    schema: z.object({schemaVersion: z.literal(1), revision: z.number().int().nonnegative(), status: z.enum(SESSION_STATUSES),
      observedAt: z.string().nullable(), logoutPending: z.boolean()}).strict(), initial: INITIAL_OBSERVATION,
  }});
  const domain = await ctx.storageDomain.open(spec);
  /** @type {IdentityController | undefined} */
  let controller;
  /** @type {Array<() => unknown | Promise<unknown>>} */
  const disposers = [];
  try {
    controller = new IdentityController(config, {
      read: () => observationOf(domain.global.get()),
      publish: async value => { await domain.global.set(observationOf(value)); },
      close: () => domain.close(),
    });
    const owned = controller;
    const handler = createRouteHandler(owned);
    disposers.push(ctx.provide('hanameshIdentity', owned.service));
    for (const [key, path] of Object.entries(ROUTES)) {
      disposers.push(ctx.connection.fetch.register({path, methods: [key === 'state' || key === 'diagnostics' ? 'GET' : 'POST'], requestBody: 'buffered', fetch: handler}));
    }
    const page = renderLoginPage();
    const script = await readFile(new URL('./ui/login.js', import.meta.url), 'utf8');
    /** @type {Array<[string, string, string]>} */
    const assets = [['/hanamesh/identity', 'text/html; charset=utf-8', page], ['/hanamesh/identity/ui.js', 'text/javascript; charset=utf-8', script]];
    for (const [path, type, body] of assets) {
      disposers.push(ctx.webServer.register({kind: 'exact', path, handler: (request, response) => {
        const rejection = ctx.connection.requestRejection(request);
        if (rejection !== undefined) { response.writeHead(rejection, {'cache-control': 'no-store'}); response.end('Host authentication required.'); return; }
        if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405, {'allow': 'GET, HEAD', 'cache-control': 'no-store'}); response.end(); return; }
        response.writeHead(200, {'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY',
          'content-security-policy': "default-src 'none'; script-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'"});
        response.end(request.method === 'HEAD' ? undefined : body);
      }}));
    }
    disposers.push(ctx.on('webserver/index-inject', table => { table.push({kind: 'html', placement: 'body',
      html: '<nav aria-label="HanaMesh 账户"><a href="/hanamesh/identity">账户与登录</a></nav>'}); }));
    ctx.effect(() => async () => {
      // Clear credentials even when the storage facility was disposed first.
      try { await owned.dispose(); } finally { for (const dispose of disposers.reverse()) await dispose(); }
    });
  } catch (error) {
    try { if (controller) await controller.dispose(); else await domain.close(); }
    finally { for (const dispose of disposers.reverse()) await dispose(); }
    throw error;
  }
}

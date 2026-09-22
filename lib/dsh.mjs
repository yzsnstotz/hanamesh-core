import {readFile} from 'node:fs/promises';
import {SessionController} from './controller.js';
import {createRouteHandler, ROUTES} from './routes.js';
import {HealthService} from './health/service.js';
import {LoaderObservationSource} from './health/loader.js';
import {INITIAL_CORE_SNAPSHOT, snapshotOf} from './validation.js';

export const name = 'hanamesh-core';
export const inject = ['connection', 'storageDomain', 'loader'];

/** Duck-typed optional seam: do not add a hard inject edge to the usage plugin.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function usageServiceReady(ctx) {
  try { return Boolean(ctx.get('hanameshUsage')); }
  catch { return false; }
}

/** @param {import('@deepseek-ai/cordis').Context} ctx @param {import('./contracts.js').PluginConfig} config */
export async function apply(ctx, config) {
  const {defineDomain} = await import('@deepseek-ai/dsh-storage-domain');
  const {z} = await import('zod');
  const registration = z.object({status: z.enum(['unregistered', 'registered', 'failed']), principalId: z.string().nullable(), registeredAt: z.string().nullable(), lastError: z.string().nullable(), attempts: z.number().int().nonnegative()}).strict();
  const consent = z.object({state: z.enum(['withheld', 'granted']), changedAt: z.string().nullable()}).strict();
  const serverObservation = z.object({reachable: z.boolean().nullable(), checkedAt: z.string().nullable()}).strict();
  // T2 marker: optional so a profile upgraded from rc.30 keeps loading its stored snapshot (DELIVERY_RULES §1.6 incident 20).
  const pointsBindPromptShownAt = z.string().nullable().optional();
  const device = z.object({deviceId: z.string(), publicKey: z.string(), privateKeyPkcs8: z.string(), createdAt: z.string()}).strict().nullable();
  const spec = defineDomain({name: 'hanamesh_core', version: 1, layout: 'single', tables: {}, global: {
    schema: z.object({schemaVersion: z.literal(1), revision: z.number().int().nonnegative(), device, registration, consent, serverObservation, pointsBindPromptShownAt}).strict(),
    initial: INITIAL_CORE_SNAPSHOT,
  }});
  const domain = await ctx.storageDomain.open(spec);
  const healthComponent = z.object({id: z.string(), moduleName: z.string(), label: z.string(), requiredRange: z.string(), onFailure: z.enum(['block', 'restrict', 'notice']), status: z.enum(['satisfied', 'missing', 'incompatible', 'damaged', 'unreadable', 'inactive', 'failed', 'ambiguous']), reason: z.string(), impact: z.string(), version: z.string().nullable(), phase: z.string(), stagedVersion: z.string().nullable(), nextStep: z.string().nullable()}).strict();
  const healthSnapshot = z.object({schemaVersion: z.literal(1), profile: z.object({id: z.string(), version: z.string(), label: z.string(), digest: z.string()}).strict(), revision: z.number().int().nonnegative(), checkedAt: z.string(), mode: z.enum(['normal', 'restricted', 'blocked', 'repair']), components: z.array(healthComponent), newProtectedOperations: z.enum(['reject', 'resource-check-still-required']), runningTaskPolicy: z.enum(['unchanged', 'preserve-and-pause', 'preserve-and-drain']), nextStep: z.string(), persistence: z.enum(['durable', 'unavailable']), fault: z.enum(['CHECK_NOT_RUN', 'INVENTORY_UNAVAILABLE', 'PERSISTENCE_UNAVAILABLE']).optional()}).strict();
  const healthSpec = defineDomain({name: 'hanamesh_core_health', version: 1, layout: 'single', tables: {}, global: {schema: z.union([z.object({boot: z.literal('unchecked')}).strict(), healthSnapshot]), initial: {boot: 'unchecked'}}});
  /** @type {any} */
  let healthDomain;
  let controller;
  /** @type {HealthService | undefined} */
  let healthService;
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let healthTimer;
  /** @type {Array<() => unknown | Promise<unknown>>} */
  const disposers = [];
  try {
    healthDomain = await ctx.storageDomain.open(healthSpec);
    controller = await SessionController.create(config, {
      read: () => snapshotOf(domain.global.get()),
      publish: async value => { await domain.global.set(snapshotOf(value)); },
      close: () => domain.close(),
    });
    const suiteProfile = JSON.parse(await readFile(new URL('../profile/suite.profile.json', import.meta.url), 'utf8'));
    healthService = new HealthService(suiteProfile, new LoaderObservationSource(/** @type {any} */ (ctx).loader, import.meta.url), {
      publish: async value => { await healthDomain.global.set(value); },
      close: () => healthDomain.close(),
    });
    const ownedHealth = healthService;
    controller.attachHealth(ownedHealth);
    controller.attachUsageProbe(() => usageServiceReady(/** @type {any} */ (ctx)));
    await ownedHealth.recheck();
    const handler = createRouteHandler(controller);
    disposers.push(ctx.provide('hanameshCore', controller.service));
    for (const path of Object.values(ROUTES)) {
      const methods = path === ROUTES.state || path === ROUTES.diagnostics || path === ROUTES.health || path === ROUTES.points ? /** @type {const} */ (['GET']) : /** @type {const} */ (['POST']);
      disposers.push(ctx.connection.fetch.register({path, methods, requestBody: 'buffered', fetch: handler}));
    }
    healthTimer = setInterval(() => { void ownedHealth.recheck(); }, config.checkIntervalMs ?? 3000);
    healthTimer.unref();
    disposers.push(/** @type {any} */ (ctx).on('loader/config-update', () => { void ownedHealth.recheck(); }));
    void controller.startRegistration().catch(() => undefined);
    const owned = controller;
    ctx.effect(() => async () => {
      try {
        clearInterval(healthTimer);
        await owned.dispose();
        await ownedHealth.close();
      } finally { for (const dispose of disposers.reverse()) await dispose(); }
    });
  } catch (error) {
    try {
      if (healthTimer) clearInterval(healthTimer);
      if (controller) await controller.dispose(); else await domain.close();
      if (healthService) await healthService.close(); else if (healthDomain) await healthDomain.close();
    }
    finally { for (const dispose of disposers.reverse()) await dispose(); }
    throw error;
  }
}

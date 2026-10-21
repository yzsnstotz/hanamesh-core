import {createActivationGate} from './activation.js';
import {createManagedSuitePackageSource,suiteSourceSnapshot} from './suite/source.js';
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {SessionController} from './controller.js';
import {createRouteHandler, ROUTES} from './routes.js';
import {HealthService} from './health/service.js';
import {LoaderObservationSource, inspectPackage} from './health/loader.js';
import {SuiteDeclarationService} from './suite/service.js';
import {RegistryMetadataReader} from './suite/registry.js';
import {suiteInspector, packageMetadata} from './suite/local.js';
import {SUITE_MANIFEST} from './suite/index.js';
import {OWN_PACKAGE} from './suite/own.js';
import {ClientPeerLeases} from './suite/client-peers.js';
import {INITIAL_CORE_SNAPSHOT, snapshotOf, configOf} from './validation.js';
import {fileSharedDeviceStore, sharedIdentityRoot} from './shared-device.js';

export const name = 'hanamesh-core';
export const inject = ['connection', 'storageDomain', 'loader'];

/** Duck-typed optional seam: do not add a hard inject edge to the usage plugin.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function usageServiceReady(ctx) {
  try { return Boolean(ctx.get('hanameshUsage')); }
  catch { return false; }
}

/** Stored `hanamesh_core` snapshot. New fields are optional so snapshots from older releases keep loading.
 * @param {typeof import('zod').z} z */
export function coreSnapshotSchema(z) {
  const registration = z.object({status: z.enum(['unregistered', 'registered', 'failed']), principalId: z.string().nullable(), registeredAt: z.string().nullable(), lastError: z.string().nullable(), attempts: z.number().int().nonnegative()}).strict();
  const consent = z.object({state: z.enum(['withheld', 'granted']), changedAt: z.string().nullable()}).strict();
  const serverObservation = z.object({reachable: z.boolean().nullable(), checkedAt: z.string().nullable()}).strict();
  // T2 marker: optional so a profile upgraded from rc.30 keeps loading its stored snapshot (DELIVERY_RULES §1.6 incident 20).
  const pointsBindPromptShownAt = z.string().nullable().optional();
  const usageConsentPromptShownAt = z.string().nullable().optional();
  const deviceFields = {deviceId: z.string(), publicKey: z.string(), privateKeyPkcs8: z.string(), createdAt: z.string()};
  // J1.S4: `device` mirrors the machine-wide shared identity; `replacedDevices` keeps this client's own identities that
  // lost to it. Optional so pre-J1.S4 snapshots keep loading.
  const device = z.object(deviceFields).strict().nullable();
  const replacedDevices = z.array(z.object({...deviceFields, replacedAt: z.string()}).strict()).optional();
  // 0.3.4: server address set in Core's settings page; null/absent = plugin config `serverOrigin`.
  const serverOriginOverride = z.string().nullable().optional();
  const websiteOriginOverride = z.string().nullable().optional();
  return z.object({schemaVersion: z.literal(1), revision: z.number().int().nonnegative(), device, registration, consent, serverObservation, pointsBindPromptShownAt, usageConsentPromptShownAt, replacedDevices, serverOriginOverride, websiteOriginOverride}).strict();
}

/** @param {import('@deepseek-ai/cordis').Context} ctx @param {import('./contracts.js').PluginConfig} config */
export async function apply(ctx, config) {
  const resolved = configOf(config);
  config = resolved;
  /** @type {any} */
  let healthDomain;
  /** @type {any} */ let domain;
  /** @type {any} */ let sourceDomain;
  /** @type {import('./suite/source.js').ManagedSuitePackageSource | undefined} */ let suiteSource;
  /** @type {SessionController | undefined} */
  let controller;
  /** @type {HealthService | undefined} */
  let healthService;
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let healthTimer;
  /** @type {Array<() => unknown | Promise<unknown>>} */
  const disposers = [];
  const activation=createActivationGate({requestRejection:request=>ctx.connection.requestRejection(request)});
  const clientPeers = new ClientPeerLeases(typeof ctx.connection.fetch?.register === 'function');
  async function cleanup(){
    activation.dispose();
    const failures=[];
    if(healthTimer)clearInterval(healthTimer);
    for(const operation of [()=>suiteSource?suiteSource.close():sourceDomain?.close(),()=>controller?controller.dispose():domain?.close(),()=>healthService?healthService.close():healthDomain?.close(),()=>clientPeers.close(),...disposers.reverse()])try{await operation()}catch(error){failures.push(error)}
    if(failures.length)throw Object.assign(new AggregateError(failures,'CORE_PLUGIN_CLEANUP_FAILED'),{code:'CORE_PLUGIN_CLEANUP_FAILED'});
  }
  try {
    for (const path of Object.values(ROUTES)) {
      const methods = path===ROUTES.suiteSource?/** @type {const} */(['GET','POST']):path === ROUTES.state || path === ROUTES.diagnostics || path === ROUTES.health || path === ROUTES.points || path === ROUTES.activity ? /** @type {const} */ (['GET']) : /** @type {const} */ (['POST']);
      disposers.push(ctx.connection.fetch.register({path, methods, requestBody: 'buffered', fetch: activation.fetch}));
    }
  const {defineDomain} = await import('@deepseek-ai/dsh-storage-domain');
  const {z} = await import('zod');
  const spec = defineDomain({name: 'hanamesh_core', version: 1, layout: 'single', tables: {}, global: {
    schema: coreSnapshotSchema(z),
    initial: INITIAL_CORE_SNAPSHOT,
  }});
  domain = await ctx.storageDomain.open(spec);
  const healthComponent = z.object({id: z.string(), moduleName: z.string(), label: z.string(), requiredRange: z.string(), onFailure: z.enum(['block', 'restrict', 'notice']), status: z.enum(['satisfied', 'missing', 'incompatible', 'damaged', 'unreadable', 'inactive', 'failed', 'ambiguous']), reason: z.string(), impact: z.string(), version: z.string().nullable(), phase: z.string(), stagedVersion: z.string().nullable(), nextStep: z.string().nullable()}).strict();
  const healthSnapshot = z.object({schemaVersion: z.literal(1), profile: z.object({id: z.string(), version: z.string(), label: z.string(), digest: z.string()}).strict(), revision: z.number().int().nonnegative(), checkedAt: z.string(), mode: z.enum(['normal', 'restricted', 'blocked', 'repair']), components: z.array(healthComponent), newProtectedOperations: z.enum(['reject', 'resource-check-still-required']), runningTaskPolicy: z.enum(['unchanged', 'preserve-and-pause', 'preserve-and-drain']), nextStep: z.string(), persistence: z.enum(['durable', 'unavailable']), fault: z.enum(['CHECK_NOT_RUN', 'INVENTORY_UNAVAILABLE', 'PERSISTENCE_UNAVAILABLE']).optional()}).strict();
  const healthSpec = defineDomain({name: 'hanamesh_core_health', version: 1, layout: 'single', tables: {}, global: {schema: z.union([z.object({boot: z.literal('unchecked')}).strict(), healthSnapshot]), initial: {boot: 'unchecked'}}});
    healthDomain = await ctx.storageDomain.open(healthSpec);
    const sourceSpec=defineDomain({name:'hanamesh_core_suite_source',version:1,layout:'single',tables:{},global:{schema:z.custom(value=>{try{suiteSourceSnapshot(value);return true}catch{return false}}),initial:{schemaVersion:1,selection:{mode:'configured'}}}});
    sourceDomain=await ctx.storageDomain.open(sourceSpec);
    suiteSource=await createManagedSuitePackageSource(resolved.suitePackageSource,{read:()=>sourceDomain.global.get(),publish:async value=>{await sourceDomain.global.set(value)},close:()=>sourceDomain.close()});
    const sourceOwner=suiteSource;
    const registryReader=()=>{const registry=sourceOwner.service.getState().registry;return new RegistryMetadataReader({timeoutMs:config.timeoutMs,maxResponseBytes:config.maxResponseBytes,localTestRegistries:config.suiteLocalTestRegistries,packageRegistries:[...resolved.suitePackageRegistries,...(registry?[registry]:[])]});};
    // Device identity lives outside this client's storage domain so DSH and HanaMesh desktop sign as one device.
    const sharedDevice = fileSharedDeviceStore(sharedIdentityRoot(config, process.env, homedir()));
    controller = await SessionController.create(config, {
      read: () => snapshotOf(domain.global.get()),
      publish: async value => { await domain.global.set(snapshotOf(value)); },
      close: () => domain.close(),
    }, {sharedDevice});
    const suiteProfile = JSON.parse(await readFile(new URL('../profile/suite.profile.json', import.meta.url), 'utf8'));
    healthService = new HealthService(suiteProfile, new LoaderObservationSource(/** @type {any} */ (ctx).loader, import.meta.url), {
      publish: async value => { await healthDomain.global.set(value); },
      close: () => healthDomain.close(),
    });
    const ownedHealth = healthService;
    controller.attachHealth(ownedHealth);
    const suiteInventory = new LoaderObservationSource(/** @type {any} */ (ctx).loader, import.meta.url, suiteInspector(config.maxResponseBytes));
    controller.attachSuite(new SuiteDeclarationService({
      profile: suiteProfile, core: OWN_PACKAGE, manifest: SUITE_MANIFEST,
      inventory: suiteInventory, nodeVersion: process.versions.node,
      clientPeerFacts: () => clientPeers.snapshot(),
      registry:{normalize:value=>registryReader().normalize(value),read:(registry,name)=>registryReader().read(registry,name)},
      coreInventory: async () => (await suiteInventory.observe([{id: 'core', moduleName: SUITE_MANIFEST.core.name, label: 'Core', versionRange: SUITE_MANIFEST.core.version, onFailure: 'block', impact: 'suite'}]))[0] ?? {kind: 'unreadable'},
      peerVersion: async name => {
        if (name === 'react') return clientPeers.snapshot().reactVersion ?? {status: 'unknown'};
        const observed = (await suiteInventory.observe([{id: name, moduleName: name, label: name, versionRange: '*', onFailure: 'notice', impact: 'peer'}]))[0];
        if (observed?.kind === 'ambiguous' || observed?.kind === 'unreadable') return {status: 'unknown'};
        if (observed?.kind === 'present') return observed.version ?? null;
        const local = await inspectPackage(name, import.meta.url);
        if (local.kind === 'missing') return null;
        const metadata = await packageMetadata(name, import.meta.url, name, config.maxResponseBytes);
        return metadata?.version ?? {status: 'unknown'};
      },
    }));
    controller.attachUsageProbe(() => usageServiceReady(/** @type {any} */ (ctx)));
    await ownedHealth.recheck();
    const handler = createRouteHandler(controller, {requestRejection: request => ctx.connection.requestRejection(request)}, clientPeers, suiteSource);
    disposers.push(ctx.provide('hanameshCore', controller.service));
    disposers.push(ctx.provide('hanameshSuiteSource',suiteSource.service));
    healthTimer = setInterval(() => { void ownedHealth.recheck(); }, config.checkIntervalMs ?? 3000);
    healthTimer.unref();
    disposers.push(/** @type {any} */ (ctx).on('loader/config-update', () => { void ownedHealth.recheck(); }));
    // 0.3.4: registers only when consent is already granted; otherwise setConsent(granted) starts it.
    void controller.startRegistration().catch(() => undefined);
    ctx.effect(()=>()=>cleanup());
    activation.ready(handler);
  } catch (error) {
    activation.fail();
    try{await cleanup()}catch(cleanupError){throw Object.assign(new AggregateError([error,cleanupError],'CORE_ACTIVATION_CLEANUP_FAILED'),{code:'CORE_ACTIVATION_CLEANUP_FAILED'})}
    throw error;
  }
}

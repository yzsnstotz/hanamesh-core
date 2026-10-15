import {createRequire} from 'node:module';
import {readFile, stat} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import type {ComponentObservation, ObservationSource, SuiteComponent} from './types.js';

type FiberLike = {state?: number; await?: () => Promise<unknown>};
type LoaderEntry = {id: string; disabled?: boolean; options: {name?: string; group?: boolean}; fiber?: FiberLike; parent?: {tree?: {ctx?: {baseUrl?: string}}}};
type LoaderLike = {entries(): Iterable<LoaderEntry>};
const phase: Record<number, NonNullable<ComponentObservation['phase']>> = {0: 'pending', 1: 'loading', 2: 'active', 3: 'failed', 4: 'disabled', 5: 'unloading'};
type StartupFailure = NonNullable<ComponentObservation['startupFailure']>;

function safeStartupFailure(error: unknown): StartupFailure {
  try {
    if (!error || typeof error !== 'object') return {code: 'startup-failed'};
    const {name, code, message} = error as {name?: unknown; code?: unknown; message?: unknown};
    if (name === 'DomainError' && code === 'invalid-record') {
      // DomainError has no structured domain field. Match one finite public prefix;
      // never retain prose, record locations, causes, stacks, or arbitrary domains.
      return typeof message === 'string' && message.startsWith("domain 'hanamesh_usage_events':")
        ? {code: 'invalid-record', domain: 'hanamesh_usage_events'} : {code: 'invalid-record'};
    }
    if (name === 'StorageError' && (code === 'version-mismatch' || code === 'backend-not-found' || code === 'malformed-medium')) return {code};
    if (name === 'ValidationError' || (name === 'UsageError' && code === 'INVALID_CONFIG')) return {code: 'invalid-config'};
  } catch { /* hostile fields must not break inventory or expose their errors */ }
  return {code: 'startup-failed'};
}

async function startupFailure(fiber: FiberLike | undefined, timeoutMs: number): Promise<StartupFailure> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (typeof fiber?.await !== 'function') return {code: 'startup-failed'};
    const settled = Promise.resolve().then(() => fiber.await!()).then<StartupFailure, StartupFailure>(
      () => ({code: 'startup-failed'}), safeStartupFailure);
    return await Promise.race([settled, new Promise<StartupFailure>(resolve => {
      timer = setTimeout(() => resolve({code: 'diagnostic-timeout'}), timeoutMs);
    })]);
  } catch { return {code: 'startup-failed'}; }
  finally { if (timer !== undefined) clearTimeout(timer); }
}

export async function inspectPackage(moduleName: string, baseUrl: string, entrySpecifier = moduleName): Promise<ComponentObservation> {
  try {
    const require = createRequire(baseUrl);
    let packagePath: string | undefined;
    try { packagePath = require.resolve(`${moduleName}/package.json`); } catch {
      try {
        let cursor = dirname(require.resolve(entrySpecifier));
        for (let index = 0; index < 32; index++) {
          const candidate = join(cursor, 'package.json');
          try { if (JSON.parse(await readFile(candidate, 'utf8')).name === moduleName) { packagePath = candidate; break; } } catch { /* continue upward */ }
          const parent = dirname(cursor); if (parent === cursor) break; cursor = parent;
        }
      } catch { return {kind: 'missing'}; }
    }
    if (!packagePath) return {kind: 'missing'};
    if ((await stat(packagePath)).size > 256 * 1024) return {kind: 'unreadable'};
    const metadata = JSON.parse(await readFile(packagePath, 'utf8')) as {name?: unknown; version?: unknown};
    if (metadata.name !== moduleName || typeof metadata.version !== 'string') return {kind: 'unreadable'};
    try { require.resolve(entrySpecifier); } catch { return {kind: 'damaged', version: metadata.version}; }
    return {kind: 'present', version: metadata.version};
  } catch { return {kind: 'unreadable'}; }
}

export class LoaderObservationSource implements ObservationSource {
  constructor(readonly loader: LoaderLike, readonly baseUrl: string, readonly inspector = inspectPackage, readonly diagnosticTimeoutMs = 250) {}
  async observe(requirements: readonly SuiteComponent[]): Promise<readonly ComponentObservation[]> {
    const entries = [...this.loader.entries()].filter(entry => !entry.options.group);
    return Promise.all(requirements.map(async requirement => {
      const matches = entries.filter(entry => {
        const nameMatches = entry.options.name === requirement.moduleName || entry.options.name === `${requirement.moduleName}/dsh`;
        const idMatches = !requirement.loaderEntryId || entry.id === requirement.loaderEntryId || entry.id.endsWith(`:${requirement.loaderEntryId}`);
        return nameMatches && idMatches;
      });
      if (matches.length === 0) return {kind: 'missing'} as const;
      if (matches.length > 1) return {kind: 'ambiguous'} as const;
      const entry = matches[0]!;
      const observed = await this.inspector(requirement.moduleName, entry.parent?.tree?.ctx?.baseUrl ?? this.baseUrl, entry.options.name ?? requirement.moduleName);
      const observedPhase = entry.disabled ? 'disabled' : phase[entry.fiber?.state ?? 0] ?? 'pending';
      const diagnostic = observedPhase === 'failed'
        ? {startupFailure: await startupFailure(entry.fiber, Number.isFinite(this.diagnosticTimeoutMs) ? Math.min(1000, Math.max(1, this.diagnosticTimeoutMs)) : 250)} : {};
      return {...observed, kind: observed.kind === 'missing' ? 'damaged' : observed.kind, phase: observedPhase, ...diagnostic};
    }));
  }
}

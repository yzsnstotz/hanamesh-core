import {createRequire} from 'node:module';
import {readFile, stat} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectPackage} from '../health/loader.js';
import {CORE_DEFAULTS} from '../validation.js';
import type {PackageMetadata, SuiteObservation} from './types.js';
import {isPackageName} from './facts.js';

/** Reads public package metadata only; resolving an entry never executes its module. */
export async function packageMetadata(name: string, baseUrl: string, entry = name, maxResponseBytes = CORE_DEFAULTS.maxResponseBytes): Promise<PackageMetadata | null> {
  try {
    if (!isPackageName(name) || (entry !== name && entry !== `${name}/dsh`)) return null;
    const require = createRequire(baseUrl);
    let path: string | undefined;
    try {path = require.resolve(`${name}/package.json`);} catch {
      let cursor = dirname(require.resolve(entry));
      for (;;) {
        const candidate = join(cursor, 'package.json');
        try {if ((await stat(candidate)).size <= maxResponseBytes && JSON.parse(await readFile(candidate, 'utf8')).name === name) {path = candidate; break;}} catch { /* a parent may contain the package's public metadata */ }
        const parent = dirname(cursor); if (parent === cursor) break; cursor = parent;
      }
    }
    if (!path || (await stat(path)).size > maxResponseBytes) return null;
    const value = JSON.parse(await readFile(path, 'utf8')) as PackageMetadata;
    return value.name === name && typeof value.version === 'string' ? value : null;
  } catch {return null;}
}
export function suiteInspector(maxResponseBytes = CORE_DEFAULTS.maxResponseBytes, resolveEntry?: (entry: string, baseUrl: string) => string): (name: string, baseUrl: string, entry?: string) => Promise<SuiteObservation> {
  return async (name, baseUrl, entry = name) => {
    const observed = await inspectPackage(name, baseUrl, entry);
    const metadata = await packageMetadata(name, baseUrl, entry, maxResponseBytes);
    if (!metadata) return observed;
    let entryURL: string | undefined;
    if (observed.kind === 'present' && resolveEntry) {
      try { entryURL = pathToFileURL(resolveEntry(entry, baseUrl)).href; }
      catch { /* Preserve the package observation; its peer resolution is unknown. */ }
    }
    return {...observed, repository: metadata.repository, metadata, ...(entryURL ? {entryURL} : {})};
  };
}

/** A total bundle must be known absent before applying the legacy policy. Never hide read/format failures as absence. */
export async function bundleMetadata(name: string, baseUrl: string, maxResponseBytes = CORE_DEFAULTS.maxResponseBytes): Promise<PackageMetadata | null> {
  if (!isPackageName(name)) throw new Error('CORE_SUITE_METADATA_INVALID');
  const resolver = createRequire(baseUrl);
  let path: string;
  try {path = resolver.resolve(`${name}/package.json`);}
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') throw error;
    for (const base of resolver.resolve.paths(name) ?? []) {
      try {await stat(join(base, name));}
      catch (missing) {if (['ENOENT','ENOTDIR'].includes((missing as NodeJS.ErrnoException).code ?? '')) continue; throw missing;}
      throw new Error('CORE_SUITE_INSTALLED_METADATA_UNKNOWN');
    }
    return null;
  }
  if ((await stat(path)).size > maxResponseBytes) throw new Error('CORE_SUITE_METADATA_LIMIT');
  const value = JSON.parse(await readFile(path, 'utf8')) as PackageMetadata;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('CORE_SUITE_METADATA_INVALID');
  return value;
}

import {CoreError} from '../errors.js';
import {CORE_DEFAULTS} from '../validation.js';
import type {RegistryMetadata} from './types.js';
import {isPackageName, registryUrl} from './facts.js';

export interface RegistryReaderOptions {
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
  /** Explicitly owned test registries only. Production DSH never supplies this option. */
  readonly localTestRegistries?: readonly string[];
  readonly packageRegistries?: readonly string[];
}
export class RegistryMetadataReader {
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
  constructor(readonly options: RegistryReaderOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? CORE_DEFAULTS.timeoutMs;
    this.maxResponseBytes = options.maxResponseBytes ?? CORE_DEFAULTS.maxResponseBytes;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs <= 0 || !Number.isSafeInteger(this.maxResponseBytes) || this.maxResponseBytes <= 0) throw new CoreError('CORE_INPUT_INVALID', 400);
    if (options.packageRegistries !== undefined && (!Array.isArray(options.packageRegistries) || options.packageRegistries.some(value => {
      try {return registryUrl(value, [value]) !== value || new URL(value).protocol !== 'http:' || new URL(value).hostname !== '127.0.0.1';} catch {return true;}
    }))) throw new CoreError('CORE_INPUT_INVALID', 400);
  }
  normalize(registry: string): string {return registryUrl(registry, [...(this.options.localTestRegistries ?? []), ...(this.options.packageRegistries ?? [])]);}
  async read(registry: string, name: string): Promise<RegistryMetadata> {
    const base = new URL(this.normalize(registry));
    if (!isPackageName(name)) throw new CoreError('CORE_SUITE_SOURCE_UNSUPPORTED', 400);
    const target = new URL(encodeURIComponent(name), base);
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), this.timeoutMs);
    try {
      const response = await fetch(target, {headers: {accept: 'application/json'}, redirect: 'manual', signal: abort.signal});
      if (response.url !== target.href || (response.status >= 300 && response.status < 400)) {await response.body?.cancel(); throw new CoreError('CORE_SUITE_SOURCE_MISMATCH', 502);}
      if (!response.ok) {await response.body?.cancel(); throw new CoreError('CORE_SUITE_METADATA_UNAVAILABLE', 502);}
      const reader = response.body?.getReader();
      if (!reader) throw new CoreError('CORE_SUITE_METADATA_INVALID', 502);
      const chunks: Uint8Array[] = []; let bytes = 0;
      for (;;) {
        const chunk = await reader.read(); if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > this.maxResponseBytes) {await reader.cancel(); throw new CoreError('CORE_SUITE_METADATA_LIMIT', 502);}
        chunks.push(chunk.value);
      }
      let data: unknown;
      try {data = JSON.parse(Buffer.concat(chunks).toString('utf8'));} catch {throw new CoreError('CORE_SUITE_METADATA_INVALID', 502);}
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new CoreError('CORE_SUITE_METADATA_INVALID', 502);
      const row = data as RegistryMetadata;
      if (row.name !== name) throw new CoreError('CORE_SUITE_SOURCE_MISMATCH', 502);
      if (!row.versions || typeof row.versions !== 'object' || Array.isArray(row.versions)) throw new CoreError('CORE_SUITE_METADATA_INVALID', 502);
      return {registry: base.href, name, versions: row.versions};
    } catch (error) {
      if (error instanceof CoreError) throw error;
      throw new CoreError(abort.signal.aborted ? 'CORE_SUITE_METADATA_TIMEOUT' : 'CORE_SUITE_METADATA_UNAVAILABLE', 502);
    } finally {clearTimeout(timer);}
  }
}

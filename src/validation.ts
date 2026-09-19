import {CoreError} from './errors.js';
import {INITIAL_CORE_SNAPSHOT, type PluginConfig, type StoredCoreSnapshot} from './contracts.js';

const SECRET_KEY = /(?:password|token|cookie|authorization|credential|secret|signer|private.?key)/i;

function originOf(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new CoreError('CORE_INPUT_INVALID', 400);
  let url: URL;
  try { url = new URL(value); } catch { throw new CoreError('CORE_ORIGIN_REJECTED', 400); }
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1';
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || value.replace(/\/$/, '') !== url.origin) {
    throw new CoreError('CORE_ORIGIN_REJECTED', 400);
  }
  return url.origin;
}

export function configOf(input: PluginConfig): Required<PluginConfig> {
  if (!input || typeof input !== 'object') throw new CoreError('CORE_INPUT_INVALID', 400);
  const timeoutMs = input.timeoutMs ?? 10_000;
  const checkIntervalMs = input.checkIntervalMs ?? 3_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 60_000 || !Number.isInteger(checkIntervalMs) || checkIntervalMs < 250 || checkIntervalMs > 60_000) {
    throw new CoreError('CORE_INPUT_INVALID', 400);
  }
  return Object.freeze({
    serverOrigin: originOf(input.serverOrigin),
    websiteOrigin: originOf(input.websiteOrigin),
    allowSystemBrowser: input.allowSystemBrowser ?? false,
    timeoutMs,
    authNonceSource: input.authNonceSource ?? 'client',
    checkIntervalMs,
  });
}

export function snapshotOf(input: unknown): StoredCoreSnapshot {
  if (!input || typeof input !== 'object') throw new CoreError('CORE_STORAGE_UNAVAILABLE');
  return structuredClone(input) as StoredCoreSnapshot;
}

export function publicJson(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(publicJson);
  if (input && typeof input === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) if (!SECRET_KEY.test(key)) output[key] = publicJson(value);
    return output;
  }
  return input;
}

export {INITIAL_CORE_SNAPSHOT};

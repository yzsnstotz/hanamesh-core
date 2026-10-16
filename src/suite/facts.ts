import {createHash} from 'node:crypto';
import {CoreError} from '../errors.js';
export const isPackageName = (name: unknown): name is string => typeof name === 'string' && name.length <= 214 && /^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/.test(name);
export function registryUrl(value: unknown, localTestRegistries: readonly string[] = []): string {
  try {
    if (typeof value !== 'string') throw new Error();
    const url = new URL(value);
    const local = url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) && localTestRegistries.includes(url.href);
    if ((url.protocol !== 'https:' && !local) || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/')) throw new Error();
    return url.href;
  } catch {throw new CoreError('CORE_SUITE_SOURCE_UNSUPPORTED', 400);}
}

/** npm and Git spellings of the same public repository have one comparison identity. */
export function repositoryIdentity(value: unknown): string | null {
  const raw = typeof value === 'string' ? value : value && typeof value === 'object' ? (value as {url?: unknown}).url : null;
  if (typeof raw !== 'string') return null;
  try {
    const url = new URL(raw.replace(/^git\+/, ''));
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, '').replace(/\.git$/, '')}`;
  } catch { return null; }
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)]));
  return value;
}
export const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export function frozen<T>(value: T): T {
  if (value && typeof value === 'object') {for (const child of Object.values(value)) frozen(child); Object.freeze(value);}
  return value;
}

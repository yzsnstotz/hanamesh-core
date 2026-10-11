import {CoreError} from './errors.js';


async function bounded(response: Response, maxResponseBytes: number): Promise<Response> {
  const declared = response.headers.get('content-length');
  if (declared !== null && Number(declared) > maxResponseBytes) {
    await response.body?.cancel();
    throw new CoreError('CORE_RESPONSE_LIMIT_EXCEEDED', 503);
  }
  if (!response.body) return response;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxResponseBytes) throw new CoreError('CORE_RESPONSE_LIMIT_EXCEEDED', 503);
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new Response(body, {status: response.status, statusText: response.statusText, headers: response.headers});
}

export class ServerTransport {
  readonly #origin: string | null;
  readonly #timeoutMs: number;
  readonly #fetcher: typeof fetch;
  readonly #maxResponseBytes: number;
  readonly #active = new Set<AbortController>();
  #disposed = false;
  constructor(origin: string | null, timeoutMs: number, fetcher: typeof fetch = globalThis.fetch, maxResponseBytes = 1024 * 1024) {
    this.#origin = origin;
    this.#timeoutMs = timeoutMs;
    this.#fetcher = fetcher;
    this.#maxResponseBytes = maxResponseBytes;
  }
  get configured(): boolean { return this.#origin !== null; }
  dispose(): void { this.#disposed = true; for (const controller of this.#active) controller.abort(); }
  async request(path: string, init: RequestInit = {}): Promise<Response> {
    if (this.#disposed) throw new CoreError('CORE_DISPOSED', 503);
    if (!this.#origin) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
    const url = new URL(path, this.#origin);
    if (url.origin !== this.#origin) throw new CoreError('CORE_INPUT_INVALID', 400);
    const controller = new AbortController();
    this.#active.add(controller);
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      // O1 identity requires an exact `Origin` on every POST/PATCH (docs/API.md), including non-browser callers; the device
      // plugin identifies as the Server's own origin, which O1 lists in IDENTITY_TRUSTED_ORIGINS (its e2e does the same).
      const headers = new Headers(init.headers);
      if (!headers.has('origin')) headers.set('origin', this.#origin);
      return await bounded(await this.#fetcher.call(globalThis, url, {...init, headers, redirect: 'error', credentials: 'omit', signal: controller.signal}), this.#maxResponseBytes);
    } catch (error) {
      if (error instanceof CoreError) throw error;
      throw new CoreError(this.#disposed ? 'CORE_DISPOSED' : 'CORE_UPSTREAM_UNAVAILABLE', 503);
    } finally { clearTimeout(timer); this.#active.delete(controller); }
  }
}

import {CoreError} from './errors.js';

const MAX_RESPONSE_BYTES = 1024 * 1024;

async function bounded(response: Response): Promise<Response> {
  const declared = response.headers.get('content-length');
  if (declared !== null && Number(declared) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
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
      if (total > MAX_RESPONSE_BYTES) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new Response(body, {status: response.status, statusText: response.statusText, headers: response.headers});
}

export class ServerTransport {
  readonly #origin: string | null;
  readonly #timeoutMs: number;
  readonly #fetcher: typeof fetch;
  constructor(origin: string | null, timeoutMs: number, fetcher: typeof fetch = globalThis.fetch) {
    this.#origin = origin;
    this.#timeoutMs = timeoutMs;
    this.#fetcher = fetcher;
  }
  get configured(): boolean { return this.#origin !== null; }
  async request(path: string, init: RequestInit = {}): Promise<Response> {
    if (!this.#origin) throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
    const url = new URL(path, this.#origin);
    if (url.origin !== this.#origin) throw new CoreError('CORE_INPUT_INVALID', 400);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      return await bounded(await this.#fetcher.call(globalThis, url, {...init, redirect: 'error', credentials: 'omit', signal: controller.signal}));
    } catch {
      throw new CoreError('CORE_UPSTREAM_UNAVAILABLE', 503);
    } finally { clearTimeout(timer); }
  }
}

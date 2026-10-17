import semver from 'semver';
import {randomUUID} from 'node:crypto';
import {digest, frozen} from './facts.js';

export interface ClientPeerFacts {
  readonly source: 'core-client-lease';
  readonly status: 'known' | 'unknown';
  readonly reason: string | null;
  readonly reactVersion: string | null;
  /** Opaque, process-local observation token; not a Host epoch or execution authorization. */
  readonly contextId: string;
}
type Lease = {ok: true; closed: Promise<void>; close: () => void};
type Result = {ok: false; error: {code: string; message: string; details: object}};
const failure = (code: string): Result => ({ok: false, error: {code, message: code, details: {}}});

/** Each authenticated Fetch invocation owns one live observation until its actual transport aborts. */
export class ClientPeerLeases {
  private readonly salt = randomUUID();
  private revision = 0;
  private disposed = false;
  private readonly active = new Map<symbol, {version: string; finish: () => void}>();
  constructor(private readonly capable: boolean) {}
  snapshot(): ClientPeerFacts {
    const versions = new Set([...this.active.values()].map(row => row.version));
    const reason = this.disposed ? 'CORE_SUITE_CLIENT_PEER_DISPOSED' : !this.capable ? 'CORE_SUITE_CLIENT_PEER_CAPABILITY_UNAVAILABLE' : !versions.size ? 'CORE_SUITE_CLIENT_PEER_NOT_CONNECTED' : versions.size > 1 ? 'CORE_SUITE_CLIENT_PEER_CONFLICT' : null;
    return frozen({source: 'core-client-lease', status: reason ? 'unknown' : 'known', reason, reactVersion: reason ? null : [...versions][0]!, contextId: digest([this.salt, this.revision])});
  }
  open(payload: unknown, signal: AbortSignal): Result | Lease {
    if (this.disposed || !this.capable || signal.aborted) return failure('CORE_SUITE_CLIENT_PEER_INACTIVE');
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return failure('CORE_SUITE_CLIENT_PEER_INVALID');
    const p = payload as Record<string, unknown>;
    if (Object.keys(p).length !== 5 || Object.keys(p).some(key => !['protocol', 'pageId', 'activationId', 'generation', 'reactVersion'].includes(key)) || p['protocol'] !== 1 || !Number.isSafeInteger(p['generation']) || (p['generation'] as number) < 1 || !['pageId', 'activationId'].every(key => typeof p[key] === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(p[key] as string)) || typeof p['reactVersion'] !== 'string' || p['reactVersion'].length > 64 || !semver.valid(p['reactVersion'])) return failure('CORE_SUITE_CLIENT_PEER_INVALID');
    let finish!: () => void;
    const closed = new Promise<void>(resolve => {
      const key = Symbol();
      finish = (): void => {
        if (!this.active.delete(key)) return;
        this.revision++;
        signal.removeEventListener('abort', finish);
        resolve();
      };
      signal.addEventListener('abort', finish, {once: true});
      this.active.set(key, {version: p['reactVersion'] as string, finish});
      this.revision++;
      // Also covers an AbortSignal implementation that aborts during listener registration.
      if (signal.aborted) finish();
    });
    return {ok: true, closed, close: finish};
  }
  async hold(payload: unknown, signal: AbortSignal): Promise<Result> {
    const lease = this.open(payload, signal);
    if (!lease.ok) return lease;
    await lease.closed;
    return failure('CORE_SUITE_CLIENT_PEER_INACTIVE');
  }
  close(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const row of this.active.values()) row.finish();
    this.revision++;
  }
}

import semver from 'semver';
import { randomUUID } from 'node:crypto';
import { digest, frozen } from './facts.js';
const failure = (code) => ({ ok: false, error: { code, message: code, details: {} } });
/** Each authenticated Fetch invocation owns one live observation until its actual transport aborts. */
export class ClientPeerLeases {
    capable;
    salt = randomUUID();
    revision = 0;
    disposed = false;
    active = new Map();
    constructor(capable) {
        this.capable = capable;
    }
    snapshot() {
        const versions = new Set([...this.active.values()].map(row => row.version));
        const reason = this.disposed ? 'CORE_SUITE_CLIENT_PEER_DISPOSED' : !this.capable ? 'CORE_SUITE_CLIENT_PEER_CAPABILITY_UNAVAILABLE' : !versions.size ? 'CORE_SUITE_CLIENT_PEER_NOT_CONNECTED' : versions.size > 1 ? 'CORE_SUITE_CLIENT_PEER_CONFLICT' : null;
        return frozen({ source: 'core-client-lease', status: reason ? 'unknown' : 'known', reason, reactVersion: reason ? null : [...versions][0], contextId: digest([this.salt, this.revision]) });
    }
    open(payload, signal) {
        if (this.disposed || !this.capable || signal.aborted)
            return failure('CORE_SUITE_CLIENT_PEER_INACTIVE');
        if (!payload || typeof payload !== 'object' || Array.isArray(payload))
            return failure('CORE_SUITE_CLIENT_PEER_INVALID');
        const p = payload;
        if (Object.keys(p).length !== 5 || Object.keys(p).some(key => !['protocol', 'pageId', 'activationId', 'generation', 'reactVersion'].includes(key)) || p['protocol'] !== 1 || !Number.isSafeInteger(p['generation']) || p['generation'] < 1 || !['pageId', 'activationId'].every(key => typeof p[key] === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(p[key])) || typeof p['reactVersion'] !== 'string' || p['reactVersion'].length > 64 || !semver.valid(p['reactVersion']))
            return failure('CORE_SUITE_CLIENT_PEER_INVALID');
        let finish;
        const closed = new Promise(resolve => {
            const key = Symbol();
            finish = () => {
                if (!this.active.delete(key))
                    return;
                this.revision++;
                signal.removeEventListener('abort', finish);
                resolve();
            };
            signal.addEventListener('abort', finish, { once: true });
            this.active.set(key, { version: p['reactVersion'], finish });
            this.revision++;
            // Also covers an AbortSignal implementation that aborts during listener registration.
            if (signal.aborted)
                finish();
        });
        return { ok: true, closed, close: finish };
    }
    async hold(payload, signal) {
        const lease = this.open(payload, signal);
        if (!lease.ok)
            return lease;
        await lease.closed;
        return failure('CORE_SUITE_CLIENT_PEER_INACTIVE');
    }
    close() {
        if (this.disposed)
            return;
        this.disposed = true;
        for (const row of this.active.values())
            row.finish();
        this.revision++;
    }
}

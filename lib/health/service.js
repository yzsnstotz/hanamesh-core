import { evaluate, faultSnapshot } from './evaluate.js';
export class HealthService {
    #profile;
    #source;
    #store;
    #revision = 0;
    #snapshot;
    #chain = Promise.resolve();
    #closed = false;
    constructor(profile, source, store) {
        this.#profile = structuredClone(profile);
        this.#source = source;
        this.#store = store;
        this.#snapshot = faultSnapshot(this.#profile, 0, 'CHECK_NOT_RUN');
    }
    getHealth() { return this.#snapshot; }
    recheck() {
        if (this.#closed)
            return Promise.reject(new Error('HEALTH_SERVICE_CLOSED'));
        const result = this.#chain.then(async () => {
            const revision = ++this.#revision;
            let candidate;
            try {
                const observations = await this.#source.observe(this.#profile.components);
                if (!Array.isArray(observations) || observations.length !== this.#profile.components.length)
                    throw new Error('bad inventory');
                candidate = evaluate(this.#profile, observations, revision);
            }
            catch {
                candidate = faultSnapshot(this.#profile, revision, 'INVENTORY_UNAVAILABLE');
            }
            try {
                await this.#store.publish(candidate);
                this.#snapshot = candidate;
            }
            catch {
                this.#snapshot = faultSnapshot(this.#profile, revision, 'PERSISTENCE_UNAVAILABLE');
            }
            return this.#snapshot;
        });
        this.#chain = result.catch(() => undefined);
        return result;
    }
    async close() { this.#closed = true; await this.#chain; await this.#store.close?.(); }
}

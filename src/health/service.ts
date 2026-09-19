import type {CoreHealthSnapshot, HealthStore, ObservationSource, SuiteProfile} from './types.js';
import {evaluate, faultSnapshot} from './evaluate.js';

export class HealthService {
  readonly #profile: SuiteProfile;
  readonly #source: ObservationSource;
  readonly #store: HealthStore;
  #revision = 0;
  #snapshot: CoreHealthSnapshot;
  #chain: Promise<unknown> = Promise.resolve();
  #closed = false;

  constructor(profile: SuiteProfile, source: ObservationSource, store: HealthStore) {
    this.#profile = structuredClone(profile);
    this.#source = source;
    this.#store = store;
    this.#snapshot = faultSnapshot(this.#profile, 0, 'CHECK_NOT_RUN');
  }

  getHealth(): CoreHealthSnapshot { return this.#snapshot; }

  recheck(): Promise<CoreHealthSnapshot> {
    if (this.#closed) return Promise.reject(new Error('HEALTH_SERVICE_CLOSED'));
    const result = this.#chain.then(async () => {
      const revision = ++this.#revision;
      let candidate: CoreHealthSnapshot;
      try {
        const observations = await this.#source.observe(this.#profile.components);
        if (!Array.isArray(observations) || observations.length !== this.#profile.components.length) throw new Error('bad inventory');
        candidate = evaluate(this.#profile, observations, revision);
      } catch { candidate = faultSnapshot(this.#profile, revision, 'INVENTORY_UNAVAILABLE'); }
      try {
        await this.#store.publish(candidate);
        this.#snapshot = candidate;
      } catch { this.#snapshot = faultSnapshot(this.#profile, revision, 'PERSISTENCE_UNAVAILABLE'); }
      return this.#snapshot;
    });
    this.#chain = result.catch(() => undefined);
    return result;
  }

  async close(): Promise<void> { this.#closed = true; await this.#chain; await this.#store.close?.(); }
}

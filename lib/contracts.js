export const INITIAL_CORE_SNAPSHOT = Object.freeze({
    schemaVersion: 1,
    revision: 0,
    device: null,
    registration: Object.freeze({ status: 'unregistered', principalId: null, registeredAt: null, lastError: null, attempts: 0 }),
    consent: Object.freeze({ state: 'withheld', changedAt: null }),
    serverObservation: Object.freeze({ reachable: null, checkedAt: null }),
    pointsBindPromptShownAt: null,
});

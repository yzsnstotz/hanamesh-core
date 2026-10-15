export function memoryStore(initial) {
  let value = structuredClone(initial);
  const publications = [];
  return {
    store: {
      read: () => structuredClone(value),
      publish: async next => {
        value = structuredClone(next);
        publications.push(structuredClone(next));
      },
      close: async () => undefined,
    },
    publications,
    read: () => structuredClone(value),
  };
}

/** Consent already granted (0.3.4: registration, contributions and bind wait for consent). */
export const grantedSnapshot = initial => ({...structuredClone(initial), consent: {state: 'granted', changedAt: '2026-10-15T00:00:00.000Z'}});

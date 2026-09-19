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

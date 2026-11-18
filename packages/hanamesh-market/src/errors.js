export class AppHostError extends Error {
  constructor(code, message, details = {}, status = 409) {
    super(message); this.name = 'AppHostError'; this.code = code;
    this.details = details; this.status = status;
  }
}
export function requireCondition(ok, code, message, details = {}, status = 400) {
  if (!ok) throw new AppHostError(code, message, details, status);
}
export const copy = value => structuredClone(value);
export class SerialQueue {
  #tail = Promise.resolve();
  run(fn) {
    const result = this.#tail.then(fn);
    this.#tail = result.catch(() => {});
    return result;
  }
  async drained() { await this.#tail; }
}
export function bounded(promise, ms, label = 'Operation') {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new AppHostError('TIMEOUT', `${label} timed out.`, {}, 504)), ms);
  })]).finally(() => clearTimeout(timer));
}

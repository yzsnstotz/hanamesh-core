import test from 'node:test';
import assert from 'node:assert/strict';
// The observer has no runtime dependency on DSH; exercise its public Fiber boundary.
const {LoaderObservationSource} = await import(process.env.HM_CORE_TEST_SOURCE ? '../src/health/loader.ts' : '../lib/health/loader.js');

const requirement = {id: 'usage', moduleName: '@hanamesh/usage', label: '使用记录', versionRange: '>=0.2.0-rc.26 <0.3.0-0', onFailure: 'notice', impact: 'usage'};
const secret = '/private/owner/token-DO-NOT-EXPOSE';
function source(fiber, timeout = 25) {
  return new LoaderObservationSource({entries: () => [{id: 'usage', options: {name: '@hanamesh/usage'}, fiber}]}, import.meta.url,
    async () => ({kind: 'present', version: '0.2.0-rc.27'}), timeout);
}
function failure(code = 'invalid-record', name = 'DomainError', message = `domain 'hanamesh_usage_events': stored global does not match its schema ${secret}`) {
  return Object.assign(new Error(message), {code, name, detail: {key: secret}, cause: new Error(secret)});
}

test('failed Fiber public await yields only an allowlisted code and domain', async () => {
  let calls = 0;
  const fiber = {state: 3, async await() { calls++; assert.equal(this, fiber); throw failure(); }, get _error() { throw new Error('private field accessed'); }};
  const [observed] = await source(fiber).observe([requirement]);
  assert.equal(calls, 1);
  assert.deepEqual(observed.startupFailure, {code: 'invalid-record', domain: 'hanamesh_usage_events'});
  assert.doesNotMatch(JSON.stringify(observed), /private|owner|token|stack|detail|cause/);
});

test('observer never waits for active, pending, loading, disabled or unloading Fibers', async () => {
  for (const state of [0, 1, 2, 4, 5]) {
    const [observed] = await source({state, await() { assert.fail('must not await a non-failed Fiber'); }}).observe([requirement]);
    assert.equal(observed.startupFailure, undefined);
  }
});

test('unknown errors, domains and hostile fields cannot enter observations', async () => {
  for (const error of [failure(secret, secret), failure('invalid-record', 'DomainError', `domain '${secret}': ${secret}`), secret,
    Object.defineProperty({}, 'code', {get() { throw new Error(secret); }})]) {
    const [observed] = await source({state: 3, async await() { throw error; }}).observe([requirement]);
    assert.ok(observed.startupFailure);
    assert.doesNotMatch(JSON.stringify(observed), /private|owner|token|stack|detail|cause/);
    assert.equal(observed.startupFailure.domain, undefined);
  }
});

test('known storage failures produce bounded tokens', async () => {
  for (const [error, code] of [[failure('version-mismatch', 'StorageError'), 'version-mismatch'], [failure('backend-not-found', 'StorageError'), 'backend-not-found']]) {
    const [observed] = await source({state: 3, async await() { throw error; }}).observe([requirement]);
    assert.deepEqual(observed.startupFailure, {code});
  }
});

test('config diagnostics recognize public Cordis and Usage errors without guessing from bare schema errors', async () => {
  for (const [error, code] of [[failure(secret, 'ValidationError'), 'invalid-config'], [failure('INVALID_CONFIG', 'UsageError'), 'invalid-config'],
    [failure(secret, 'ZodError'), 'startup-failed'], [failure('OTHER_ERROR', 'UsageError'), 'startup-failed'], [failure('INVALID_CONFIG', 'OtherError'), 'startup-failed']]) {
    const [observed] = await source({state: 3, async await() { throw error; }}).observe([requirement]);
    assert.deepEqual(observed.startupFailure, {code});
    assert.doesNotMatch(JSON.stringify(observed), /private|owner|token|stack|detail|cause/);
  }
});

test('unsettled failed Fiber cannot hang health checks, and late rejection is handled', async () => {
  let reject;
  const started = performance.now();
  const [observed] = await source({state: 3, await: () => new Promise((_resolve, fail) => { reject = fail; })}, 10).observe([requirement]);
  assert.equal(observed.startupFailure.code, 'diagnostic-timeout');
  assert.ok(performance.now() - started < 500);
  reject(failure());
  await new Promise(resolve => setImmediate(resolve));
});

test('recheck observes recovery without retaining the earlier startup failure', async () => {
  const fiber = {state: 3, async await() { throw failure(); }};
  const observer = source(fiber);
  assert.ok((await observer.observe([requirement]))[0].startupFailure);
  fiber.state = 2;
  const [healthy] = await observer.observe([requirement]);
  assert.equal(healthy.phase, 'active');
  assert.equal(healthy.startupFailure, undefined);
});

test('older failed Fibers without public await keep a safe fallback', async () => {
  const [observed] = await source({state: 3}).observe([requirement]);
  assert.deepEqual(observed.startupFailure, {code: 'startup-failed'});
});

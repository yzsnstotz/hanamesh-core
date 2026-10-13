// Test-only observer loaded by the normal host loader, never part of the Core tgz.
// Provides no service, HTTP route, UI, identity or business state. Calls only
// the real provider's signing primitives on explicit local FIXTURE bytes.
import assert from 'node:assert/strict';
import {readFile, realpath, writeFile, rename} from 'node:fs/promises';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {callExamples} from './call-examples.mjs';

export const name = 'hanamesh-core-native-test-observer';
export const inject = ['hanameshCore'];

export async function apply(ctx) {
  assert.ok(process.env.SEGFLOW_ENV_DIR, 'Mechanism must supply the owned environment root before activation');
  const root = await realpath(process.env.SEGFLOW_ENV_DIR);
  const file = join(root, 'core-provider-observation.json');
  const staging = file + '.tmp';
  const core = ctx.get('hanameshCore');
  assert.ok(core, 'Real hanameshCore injection is missing');
  const require = createRequire(import.meta.url);
  const packagePath = await realpath(require.resolve('hanamesh-core/package.json'));
  const manifest = JSON.parse(await readFile(packagePath, 'utf8'));
  const providerRequire = createRequire(packagePath);
  const resolvedPeers = {};
  for (const dependency of Object.keys(manifest.peerDependencies)) {
    const path = await realpath(providerRequire.resolve(dependency + '/package.json'));
    const pkg = JSON.parse(await readFile(path, 'utf8'));
    resolvedPeers[dependency] = {version: pkg.version, path};
  }
  const record = {
    evidence: 'REAL_CORDIS_INJECTION_TEST_OBSERVER',
    providerPackagePath: packagePath,
    providerVersion: manifest.version,
    resolvedPeers,
    protocolVersion: core.protocolVersion,
    callableMethods: ['getDeviceId', 'sign', 'signRequest', 'getConsent', 'onConsentChange', 'getSession', 'getServerOrigin', 'getPublicKey', 'getHealth'].filter(key => typeof core[key] === 'function'),
    deviceId: core.getDeviceId(),
    publicKey: core.getPublicKey(),
    session: core.getSession(),
    serverOrigin: core.getServerOrigin(),
    initialConsent: core.getConsent(),
    consentEvents: [],
    callExamples: await callExamples(core),
    releaseProbeEvents: [],
    releaseProbeReturns: [],
  };
  let active = true;
  let tail = Promise.resolve();
  let failure = null;
  const publish = () => {
    const text = JSON.stringify(record, null, 2) + '\n';
    const job = tail.then(async () => {
      await writeFile(staging, text, {mode: 0o600});
      await rename(staging, file);
    });
    tail = job.catch(error => {failure ??= error;});
    return job;
  };
  const unsubscribe = core.onConsentChange((state, changedAt) => {
    if (!active) return;
    record.consentEvents.push({state, changedAt, observedConsent: core.getConsent()});
    void publish().catch(error => console.error('CORE_TEST_OBSERVER_PUBLICATION_FAILED', error.message));
  });
  // A separate subscription releases itself on the grant. The main subscription
  // observes the later withdrawal, proving that release suppresses only its own callback.
  const releaseProbe = core.onConsentChange((state, changedAt) => {
    record.releaseProbeEvents.push({state, changedAt});
    record.releaseProbeReturns = [typeof releaseProbe(), typeof releaseProbe()];
    void publish().catch(error => console.error('CORE_TEST_RELEASE_OBSERVATION_FAILED', error.message));
  });
  ctx.effect(() => async () => {
    active = false;
    unsubscribe();
    releaseProbe();
    await tail;
    if (failure) throw failure;
  });
  await publish();
}

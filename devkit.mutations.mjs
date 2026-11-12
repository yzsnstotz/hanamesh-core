// Core owns the original integrity cases plus registration recovery and consent barriers.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
const production = new Map();
for (const file of ['agent.js', 'dsh.mjs', 'activation.js', 'bind-link.js', 'device.js', 'registration.js', 'controller.js', 'health/evaluate.js', 'suite/service.js', 'suite/compatibility.js', 'suite/legacy.js', 'suite/client-peers.js', 'suite/source.js', 'suite/source-package.js', 'suite/source-lifecycle.js', 'routes.js', 'client.js']) production.set(file, await readFile(join('lib', file), 'utf8'));
export const cases = [
 {id:'legacy-range-bypassed',file:'lib/suite/legacy.js',mutate:code=>code.replace('member.versionRange && !semver.satisfies(version, member.versionRange)','false'),test:'test/legacy-installation.test.mjs'},
 {id:'legacy-all-absent-called-installed',file:'lib/suite/legacy.js',mutate:code=>code.replace("absent ? 'not-installed'", "absent ? 'installed'"),test:'test/legacy-installation.test.mjs'},
 {id:'legacy-physical-runtime-mismatch-ignored',file:'lib/suite/legacy.js',mutate:code=>code.replace('runningVersion !== undefined && runningVersion !== version','false'),test:'test/legacy-installation.test.mjs'},

 {id:'peer-heartbeat-missing',file:'lib/routes.js',mutate:code=>code.replace('stream.enqueue(CLIENT_PEER_FRAME), clientPeerHeartbeatMs','void 0, clientPeerHeartbeatMs'),test:'test/suite-peer-heartbeat.test.mjs'},
 {id:'peer-stream-transformable',file:'lib/routes.js',mutate:code=>code.replace("'cache-control': 'no-store, no-transform'","'cache-control': 'no-store'"),test:'test/suite-peer-transport.test.mjs'},
 {id:'peer-legacy-protocol-admitted',file:'lib/suite/client-peers.js',mutate:code=>code.replace("p['protocol'] !== 2","p['protocol'] !== 2 && p['protocol'] !== 1"),test:'test/suite-peer-transport.test.mjs'},
 {id:'peer-heartbeat-client-rejected',file:'lib/client.js',mutate:code=>code.replace(/if \(offset === frame\.length\)\s+offset = 0;/, ''),test:'test/suite-peer-heartbeat.test.mjs'},
 {id:'settings-consent-review-bypassed',file:'lib/client.js',mutate:code=>code.replace('setConsentReview(requested);',"if (page === 'account') setConsentReview(requested); else void saveConsent(requested);"),test:'test/website-setting-ui.test.mjs'},

 {id:'bundle-stale-core-release',file:'packages/hanamesh/build.mjs',mutate:code=>code.replace("throw Error('CORE_RELEASE_PIN_MISMATCH');", "void 0;"),test:'test/dsh-bundle.test.mjs'},

 {id:'range-member-key-unbound',file:'lib/suite/service.js',mutate:code=>code.replace('this.validRecord(row, installed[i].moduleName, chosenVersions[i], installed[i].repository)','this.validRecord(row, installed[i].moduleName, row.version, installed[i].repository)'),test:'test/suite-policy.test.mjs'},
 {id:'bundle-compatible-ranges',file:'packages/hanamesh/build.mjs',mutate:code=>code.replace("dependencies[pkg.name]='^'+pkg.version;","dependencies[pkg.name]=pkg.version;"),test:'test/dsh-bundle.test.mjs'},
 {id:'distribution-theme-range',file:'lib/suite/service.js',mutate:code=>code.replace("theme && (typeof dependencies['@hanamesh/theme'] !== 'string' || !semver.validRange(dependencies['@hanamesh/theme']))","false"),test:'test/suite-policy.test.mjs'},
 {id:'bundle-theme-missing',file:'packages/hanamesh/build.mjs',mutate:code=>code.replace(",['theme','@hanamesh/theme']", ""),test:'test/dsh-bundle.test.mjs'},
 {id:'bundle-peer-widened',file:'packages/hanamesh/build.mjs',mutate:code=>code.replace("const previous=peerDependencies[name];", "const previous=undefined;"),test:'test/dsh-bundle.test.mjs'},

 {id:'agent-model-grant-rejected',file:'lib/agent.js',mutate:code=>code.replace("fail('CORE_AGENT_WEB_CONSENT_REQUIRED');","void 0;"),test:'test/agent-onboarding.test.mjs'},
 {id:'agent-local-close-dominates-website',file:'lib/agent.js',mutate:code=>code.replace(/(\/\/ Explicit local close[^\n]*\n)\s*return result;/,"$1"),test:'test/agent-onboarding.test.mjs'},
 {id:'points-prompt-stamps-before-display',file:'lib/client.js',mutate:code=>code.replace('setPending(next.pendingTotal);',"setPending(next.pendingTotal); void jsonRequest('/api/hanamesh/core/points/prompt-shown', {method: 'POST'});"),test:'test/points-prompt-display.test.mjs'},
 {id:'bind-expiry-not-forwarded',file:'lib/bind-link.js',mutate:code=>code.replace("url.searchParams.set('expiresAt', expiresAt);",'void 0;'),test:'test/bind-expiry.test.mjs'},
 {id:'bind-clock-domain-missing',file:'lib/bind-link.js',mutate:code=>code.replace("url.searchParams.set('expiryClock', 'identity-server');",'void 0;'),test:'test/bind-expiry.test.mjs'},
 {id:'activation-abort-does-not-wake',file:'lib/activation.js',mutate:code=>code.replace('await Promise.race([activation, aborted]);','await activation;'),test:'test/activation-gate.test.mjs'},
 {id:'activation-completion-not-published',file:'lib/dsh.mjs',mutate:code=>code.replace('activation.ready(handler);','activation.fail();'),test:'test/suite-source-adapter.test.mjs'},
 {id:'source-owned-service-missing',file:'lib/dsh.mjs',mutate:code=>code.replace("disposers.push(ctx.provide('hanameshSuiteSource',suiteSource.service));","void 0;"),test:'test/suite-source-adapter.test.mjs'},
 {id:'source-disposed-registry-retained',file:'lib/suite/source-lifecycle.js',mutate:code=>code.replace("this.#source = null; this.#status = 'disposed';","this.#status = 'disposed';"),test:'test/suite-source-lifecycle.test.mjs'},
 {id:'source-save-before-validated-open',file:'lib/suite/source-lifecycle.js',mutate:code=>code.replace('candidate = await this.#open(options);','await this.store.publish({schemaVersion:1,selection}); candidate = await this.#open(options);'),test:'test/suite-source-lifecycle.test.mjs'},
 {id:'source-origin-guard-removed',file:'lib/routes.js',mutate:code=>code.replace("if (!admission || request.headers.has('origin'))\n                requireSameCarrierOrigin(request);","void 0;"),test:'test/suite-source-routes.test.mjs'},

 {id: 'renderer-context-not-rechecked', file: 'lib/suite/service.js', mutate: code => code.replaceAll('clientPeerFacts.contextId !== clientAtStart?.contextId', 'false'), test: 'test/suite-policy.test.mjs'},
 {id: 'renderer-conflict-ignored', file: 'lib/suite/client-peers.js', mutate: code => code.replace('versions.size > 1', 'versions.size > 999'), test: 'test/suite-client-peers.test.mjs'},
 {id: 'archive-integrity-ignored', file: 'lib/suite/source-package.js', mutate: code => code.replace(' !== expected)', ' !== expected && false)'), test: 'test/suite-source.test.mjs'},
 {id: 'consent-prompt-ignores-refusal', file: 'lib/controller.js', mutate: code => code.replace("this.#state.consent.changedAt === null && shownAt === null", "shownAt === null"), test: 'test/first-consent.test.mjs'},
 {id: 'consent-prompt-stamps-before-display', file: 'lib/client.js', mutate: code => code.replace("setView(next);", "setView(next); void jsonRequest('/api/hanamesh/core/consent/prompt-shown', {method: 'POST'});"), test: 'test/first-consent-client.test.mjs'},
 {id:"suite-bundle-admission",file:"lib/suite/compatibility.js",mutate:code=>code.replace("const bundle = bundleFailure(record);", "const bundle = null;"),test:"test/suite-policy.test.mjs"},
 {id:"suite-bundle-version-upgrade",file:"lib/suite/service.js",mutate:code=>code.replace("const reason = await compatible([bundle, ...tuple]);", "if (tuple.every((row, i) => row.version === installed[i].actualVersion)) continue;\n                const reason = await compatible([bundle, ...tuple]);"),test:"test/suite-policy.test.mjs"},
 {id:"suite-source-binding",file:"lib/suite/service.js",mutate:code=>code.replace("if (!this.validRecord(bundle, manifest.bundle.name, version, manifest.bundle.repository))", "if (false)"),test:"test/suite-policy.test.mjs"},
    {
      id: 'domain-name', file: 'lib/dsh.mjs',
      mutate: code => code.replace("name: 'hanamesh_core'", "name: 'hanamesh-core'"),
      test: 'test/adapter.test.mjs',
    },
    {
      id: 'device-integrity', file: 'lib/device.js',
      mutate: code => code.replace('if (!derivedRaw.equals(raw) || derivedId !== device.deviceId)', 'if (false)'),
      test: 'test/mutations/device-integrity.test.mjs',
    },
    {
      id: 'registration-device-id', file: 'lib/registration.js',
      mutate: code => code.replace('if (result.deviceId !== device.deviceId)', 'if (false)'),
      test: 'test/mutations/registration-device-id.test.mjs',
    },
    {
      id: 'registration-reverse-order', file: 'lib/controller.js',
      mutate: code => code.replace(
        'const result = await registerDevice(transport, this.#device(), undefined, same);',
        "await this.#publish(state => ({ ...state, revision: state.revision + 1, registration: { status: 'registered', principalId: 'premature', registeredAt: checkedAt, lastError: null, attempts } }));\n            const result = await registerDevice(transport, this.#device(), undefined, same);",
      ),
      test: 'test/mutations/registration-reverse-order.test.mjs',
    },
    {
      id: 'health-repair-priority', file: 'lib/health/evaluate.js',
      mutate: code => code.replace("['damaged', 'unreadable', 'failed', 'ambiguous']", "['unreadable', 'failed', 'ambiguous']"),
      test: 'test/mutations/health-repair-priority.test.mjs',
    },
    {
      id: 'points-prompt-once', file: 'lib/controller.js',
      mutate: code => code.replace("const show = points.pendingTotal > 0 && this.#bound !== true && shownAt === null;", 'const show = true;'),
      test: 'test/mutations/points-prompt-once.test.mjs',
    },
    {
      id: 'recovery-no-auth-repair', file: 'lib/controller.js',
      mutate: code => code.replace('if (!response.ok && await this.#recoverRegistration(response, generation))', 'if (false)'),
      test: 'test/registration-recovery.test.mjs',
    },
    {
      id: 'recovery-ignores-withdrawal', file: 'lib/registration.js',
      mutate: code => code.replaceAll('if (!active())', 'if (false)'),
      test: 'test/registration-recovery.test.mjs',
    },
    {
      id: 'recovery-unbounded-registration', file: 'lib/controller.js',
      mutate: code => code.replace('if (this.#recoveryAttemptAt !== null && Date.now() - this.#recoveryAttemptAt < this.#config.contributionIntervalMs)', 'if (false)'),
      test: 'test/registration-recovery.test.mjs',
    },
  ];
export const mutationConfig = {
  root: process.cwd(), cases, baselineTests: ['test/device.test.mjs', 'test/adapter.test.mjs', ...cases.filter(c => c.id !== 'domain-name').map(c => c.test)],
  nodeArgs: ['--test-timeout=20000'],
  evidenceDir: resolve(process.env.HM_CORE_RUN ?? 'artifacts', 'mutations'),
  temporaryRoot: resolve(process.env.HM_CORE_RUN ?? 'artifacts'),
};
export async function validateMutationEvidence() {
  for (const [file, bytes] of production) assert.equal(await readFile(join('lib', file), 'utf8'), bytes, `${file} production copy untouched`);
  for (const item of cases) assert.doesNotMatch(await readFile(join(mutationConfig.evidenceDir, item.id + '.tap'), 'utf8'), /ERR_MODULE_NOT_FOUND|SyntaxError/);
}

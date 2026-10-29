// Core owns the original integrity cases plus registration recovery and consent barriers.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
const production = new Map();
for (const file of ['agent.js', 'agent-origins.js', 'dsh.mjs', 'activation.js', 'bind-link.js', 'device.js', 'registration.js', 'controller.js', 'health/evaluate.js', 'suite/service.js', 'suite/client-peers.js', 'suite/source.js', 'suite/source-lifecycle.js', 'routes.js', 'client.js']) production.set(file, await readFile(join('lib', file), 'utf8'));
export const cases = [
 {id:'origin-bind-nonce-oracle-restored',file:'lib/agent.js',mutate:code=>code.replace("if (typeof nonce === 'string' && nonce.trimStart().startsWith('{'))",'if (false)'),test:'test/agent-origins.test.mjs'},
 {id:'origin-denial-not-enforced',file:'lib/agent-origins.js',mutate:code=>code.replace('if (origin.admitted === 0)','if (false)'),test:'test/agent-origins.test.mjs'},
 {id:'origin-ledger-back-in-agent-home',file:'lib/agent-origins.js',mutate:code=>code.replace("join(sharedHome, 'identity')","join(sharedHome, 'agent/usage')"),test:'test/agent-origins.test.mjs'},
 {id:'origin-generic-sign-restored',file:'lib/agent.js',mutate:code=>code.replace("if (input.operation === 'sign')\n        fail('CORE_INPUT_INVALID');", "if(input.operation==='sign'){const d=await fileSharedDeviceStore(config.sharedHome).read();if(!d)throw Error('CORE_DEVICE_REQUIRED');return {signature:Buffer.from(signWithDevice(d,Buffer.from(String(input.bytes),'base64'))).toString('base64url')};}"),test:'test/agent-origins.test.mjs'},
 {id:'origin-first-decision-updatable',file:'lib/agent-origins.js',mutate:code=>code.replace('return { admitted: row.admitted === 1, first: false };',"this.db.prepare('UPDATE origins SET admitted=? WHERE key=?').run(admitted?1:0,key);return {admitted,first:false};"),test:'test/agent-origins.test.mjs'},
 {id:'agent-model-grant-rejected',file:'lib/agent.js',mutate:code=>code.replace("if (consent.state !== 'granted')\n            fail('CORE_AGENT_WEB_CONSENT_REQUIRED');","if (false) fail('CORE_AGENT_WEB_CONSENT_REQUIRED');"),test:'test/agent-onboarding.test.mjs'},
 {id:'agent-local-close-dominates-website',file:'lib/agent.js',mutate:code=>code.replace("if (value.state === 'withheld')\n                return result;","if (false) return result;"),test:'test/agent-onboarding.test.mjs'},
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
 {id: 'archive-integrity-ignored', file: 'lib/suite/source.js', mutate: code => code.replace(' !== expected)', ' !== expected && false)'), test: 'test/suite-source.test.mjs'},
 {id: 'consent-prompt-ignores-refusal', file: 'lib/controller.js', mutate: code => code.replace("this.#state.consent.changedAt === null && shownAt === null", "shownAt === null"), test: 'test/first-consent.test.mjs'},
 {id: 'consent-prompt-stamps-before-display', file: 'lib/client.js', mutate: code => code.replace("setView(next);", "setView(next); void jsonRequest('/api/hanamesh/core/consent/prompt-shown', {method: 'POST'});"), test: 'test/first-consent-client.test.mjs'},
 {id:"suite-bundle-admission",file:"lib/suite/service.js",mutate:code=>code.replace("const bundle = tuple.map(bundleFailure).find(Boolean);", "const bundle = null;"),test:"test/suite-policy.test.mjs"},
 {id:"suite-same-core-upgrade",file:"lib/suite/service.js",mutate:code=>code.replace("const candidate = record.hanameshSuite;", "if (coreVersion === core.version) continue;\n                    const candidate = record.hanameshSuite;"),test:"test/suite-policy.test.mjs"},
 {id:"suite-source-binding",file:"lib/suite/service.js",mutate:code=>code.replace("if (!this.validRecord(record, core.name, coreVersion, manifest.core.repository))", "if (false)"),test:"test/suite-policy.test.mjs"},
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

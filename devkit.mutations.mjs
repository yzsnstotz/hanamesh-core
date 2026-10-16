// Core owns the original integrity cases plus registration recovery and consent barriers.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
const production = new Map();
for (const file of ['dsh.mjs', 'device.js', 'registration.js', 'controller.js', 'health/evaluate.js', 'suite/service.js']) production.set(file, await readFile(join('lib', file), 'utf8'));
export const cases = [
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

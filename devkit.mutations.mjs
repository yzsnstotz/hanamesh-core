// Core owns the original six mutation cases and loading-error policy.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
const production = new Map();
for (const file of ['dsh.mjs', 'device.js', 'registration.js', 'controller.js', 'health/evaluate.js']) production.set(file, await readFile(join('lib', file), 'utf8'));
export const cases = [
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
        'const result = await registerDevice(this.#transport, this.#device());',
        "await this.#publish({ ...this.#state, revision: this.#state.revision + 1, registration: { status: 'registered', principalId: 'premature', registeredAt: checkedAt, lastError: null, attempts } });\n            const result = await registerDevice(this.#transport, this.#device());",
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

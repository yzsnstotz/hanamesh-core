import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
const source = JSON.parse(await readFile('package.json', 'utf8'));
const tarball = resolve(process.argv[2] ?? `artifacts/hanamesh-core-${source.version}.tgz`);
export const packConfig = {
  root: process.cwd(), tarball,
  temporaryRoot: resolve(process.env.HM_CORE_RUN ?? tmpdir()),
  required: ['lib/agent-cli.js', 'lib/agent.js', 'docs/AGENT.md', 'profile/cordis.patch.yml', 'profile/suite.profile.json', 'profile.schema.json', 'lib/client.js', 'contract/hanamesh-core.v1.schema.json', 'lib/contract-suite.js', 'lib/contract-fixtures.js', 'lib/contract-cli.js'],
  forbidden: /(?:node_modules|test|artifacts|vendor)\/|devkit/u,
  validate: async ({read}) => {
    assert.equal(read('lib/dsh.mjs').toString(), await readFile('src/dsh.mjs', 'utf8'));
    const packed = JSON.parse(read('package.json'));
    assert.equal(packed.version, source.version);
    assert.deepEqual(packed.dependencies, {semver: '7.7.2'});
    assert.equal(packed.peerDependencies['@hanamesh/devkit'], undefined);
    assert.equal(packed.peerDependenciesMeta?.['@hanamesh/devkit'], undefined);
  },
  consumer: {
    // The consumer stands in for the DSH host: it supplies the published peers and the host packages' own peers.
    packageJson: {private: true, type: 'module', dependencies: {'hanamesh-core': 'file:' + tarball, ...Object.fromEntries(Object.keys(source.peerDependencies).map(name=>[name,source.devDependencies[name]])), '@types/node': '24.13.4'}},
    javascript: (await readFile(new URL('./devkit.consumer.mjs', import.meta.url), 'utf8')).replace("'__CORE_VERSION__'", JSON.stringify(source.version)),
    typescript: "import {name, apply} from 'hanamesh-core';\nconst pluginName: 'hanamesh-core' = name;\nvoid [pluginName, apply];\nimport type {HanaMeshCoreContract} from 'hanamesh-core/contract';\ndeclare const core: HanaMeshCoreContract;\nconst deviceId: string = core.getDeviceId();\nconst consent: 'granted' | 'withheld' = core.getConsent();\nconst signature: Uint8Array = core.sign(new Uint8Array());\nvoid [deviceId, consent, signature];\nimport {checkCoreService, type CoreHandshake} from 'hanamesh-core/contract';\nimport {runCoreProviderSuite, type CoreSuiteResult} from 'hanamesh-core/contract/suite';\nimport {createCoreProviderFixture} from 'hanamesh-core/contract/fixtures';\nconst handshake: CoreHandshake = checkCoreService(core);\nconst pending: Promise<CoreSuiteResult> = runCoreProviderSuite(createCoreProviderFixture());\nvoid [handshake, pending];\n",
  },
};

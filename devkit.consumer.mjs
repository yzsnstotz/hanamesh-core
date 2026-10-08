import assert from 'node:assert/strict';
import {readFile, access} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const packageRoot = resolve('node_modules/hanamesh-core');
const source = {version: '__CORE_VERSION__'};
const packed = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
assert.equal(packed.name, 'hanamesh-core');
assert.equal(packed.version, source.version);
assert.deepEqual(packed.dependencies ?? {}, {});
assert.equal(packed.dsh.bundle.patch, './profile/cordis.patch.yml');
assert.ok(packed.exports['./contract']);
assert.ok(packed.exports['./client']);
assert.deepEqual(packed.dsh.client.inject, ['@deepseek-ai/dsh-client-ui-settings', '@deepseek-ai/dsh-client-ui-sidebar']);
await access(join(packageRoot, 'profile/cordis.patch.yml'));
await access(join(packageRoot, 'profile/suite.profile.json'));
await access(join(packageRoot, 'profile.schema.json'));
await access(join(packageRoot, 'lib/client.js'));
await access(join(packageRoot, 'vendor/semver/index.js'));
await assert.rejects(access(resolve('node_modules/@hanamesh/devkit')));
const adapter = await import('hanamesh-core');
assert.equal(adapter.name, (await import(pathToFileURL(join(packageRoot, 'lib/dsh.mjs')).href)).name);
const contract = await import('hanamesh-core/contract');
assert.ok(contract);
assert.equal(adapter.name, 'hanamesh-core');
assert.deepEqual(adapter.inject, ['connection', 'storageDomain', 'loader']);
assert.equal(packed.exports['./transport'], undefined);
const {SessionController} = await import(pathToFileURL(join(packageRoot, 'lib/controller.js')).href);
const {INITIAL_CORE_SNAPSHOT} = await import(pathToFileURL(join(packageRoot, 'lib/contracts.js')).href);
let value = structuredClone(INITIAL_CORE_SNAPSHOT);
const controller = await SessionController.create({serverOrigin: null, websiteOrigin: null}, {read: () => value, publish: async next => { value = next; }, close: async () => undefined});
assert.deepEqual(Object.keys(controller.service).sort(), ['protocolVersion', 'getDeviceId', 'getPublicKey', 'sign', 'signRequest', 'getConsent', 'onConsentChange', 'getSession', 'getServerOrigin', 'getHealth'].sort());
assert.deepEqual(contract.checkCoreService(controller.service), {status: 'present', protocolVersion: '1', optional: ['getPublicKey', 'getHealth']});
const {runCoreProviderSuite, runCoreConsumerSuite} = await import('hanamesh-core/contract/suite');
const {createCoreProviderFixture, createCoreConsumerFixture} = await import('hanamesh-core/contract/fixtures');
const {default: schema} = await import('hanamesh-core/contract/schema.json', {with: {type: 'json'}});
assert.equal(schema['x-hanamesh'].protocolVersion, '1');
for (const result of [
  await runCoreProviderSuite({label: 'packed SessionController.service', service: controller.service, setConsent: state => controller.setConsent(state)}),
  await runCoreProviderSuite(createCoreProviderFixture()),
  await runCoreConsumerSuite(createCoreConsumerFixture()),
]) assert.equal(result.ok, true, JSON.stringify(result.results.filter(row => !row.ok)));
await access(join(packageRoot, 'lib/contract-cli.js'));
await controller.dispose();
const packedLib = await readFile(join(packageRoot, 'lib/dsh.mjs'), 'utf8');
assert.doesNotMatch(packedLib, /from ['"]hanamesh-usage|from ['"]@hanamesh\/dsh-app-host|import\(['"]hanamesh-usage/);

console.log(JSON.stringify({event:'check_package_ok',version:packed.version,dependencies:Object.keys(packed.dependencies ?? {}).length}));

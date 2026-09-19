/** Source-free package smoke test. It does not install into a real DSH profile. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

const root = await mkdtemp(join(tmpdir(), 'hm-core-package-'));
const source = JSON.parse(await readFile('package.json', 'utf8'));
const artifact = resolve(process.argv[2] ?? `artifacts/hanamesh-core-${source.version}.tgz`);
try {
  const unpack = spawnSync('tar', ['-xzf', artifact, '-C', root], {encoding: 'utf8'});
  assert.equal(unpack.status, 0, unpack.stderr);
  const packageRoot = join(root, 'package');
  const packed = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  assert.equal(packed.name, 'hanamesh-core');
  assert.equal(packed.version, source.version);
  assert.deepEqual(packed.dependencies, {'hanamesh-usage': '0.2.0-rc.1', '@hanamesh/dsh-app-host': '0.1.0-rc.8'});
  assert.equal(packed.dsh.bundle.patch, './profile/cordis.patch.yml');
  assert.ok(packed.exports['./contract']);
  assert.ok(packed.exports['./client']);
  assert.deepEqual(packed.dsh.client.inject, ['@deepseek-ai/dsh-client-ui-settings', '@deepseek-ai/dsh-client-ui-sidebar']);
  await access(join(packageRoot, 'profile/cordis.patch.yml'));
  await access(join(packageRoot, 'profile/suite.profile.json'));
  await access(join(packageRoot, 'profile.schema.json'));
  await access(join(packageRoot, 'lib/client.js'));
  await access(join(packageRoot, 'vendor/semver/index.js'));
  const adapter = await import(pathToFileURL(join(packageRoot, 'lib/dsh.mjs')).href);
  assert.equal(adapter.name, 'hanamesh-core');
  assert.deepEqual(adapter.inject, ['connection', 'storageDomain', 'loader']);
  assert.equal(packed.exports['./transport'], undefined);
  const {SessionController} = await import(pathToFileURL(join(packageRoot, 'lib/controller.js')).href);
  const {INITIAL_CORE_SNAPSHOT} = await import(pathToFileURL(join(packageRoot, 'lib/contracts.js')).href);
  let value = structuredClone(INITIAL_CORE_SNAPSHOT);
  const controller = await SessionController.create({serverOrigin: null, websiteOrigin: null}, {read: () => value, publish: async next => { value = next; }, close: async () => undefined});
  assert.deepEqual(Object.keys(controller.service).sort(), ['protocolVersion', 'getDeviceId', 'getPublicKey', 'sign', 'signRequest', 'getConsent', 'onConsentChange', 'getSession', 'getServerOrigin', 'getHealth'].sort());
  await controller.dispose();
  const packedLib = await readFile(join(packageRoot, 'lib/dsh.mjs'), 'utf8');
  assert.doesNotMatch(packedLib, /from ['"]hanamesh-usage|from ['"]@hanamesh\/dsh-app-host|import\(['"]hanamesh-usage/);
  assert.equal(await readFile('src/dsh.mjs', 'utf8'), await readFile(join(packageRoot, 'lib/dsh.mjs'), 'utf8'));
  console.log(JSON.stringify({
    event: 'check_package_ok',
    name: packed.name,
    version: packed.version,
    inject: adapter.inject,
    bundlePatch: true,
    dependencies: Object.keys(packed.dependencies).length,
    sha256: createHash('sha256').update(await readFile(artifact)).digest('hex'),
  }));
} finally {
  await rm(root, {recursive: true, force: true});
}

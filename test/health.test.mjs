import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {HealthService} from '../lib/health/service.js';
import {inspectPackage, LoaderObservationSource} from '../lib/health/loader.js';

const profile = JSON.parse(await readFile('profile/suite.profile.json', 'utf8'));
const active = profile.components.map(() => ({kind: 'present', version: '0.2.0-rc.6', phase: 'active'}));
active[1].version = '0.1.0-rc.18';

test('notice components distinguish present, missing and disabled without restricting healthy core', async () => {
  for (const [name, observations, expected] of [
    ['both-present', active, ['normal', 'satisfied']],
    ['usage-missing', [{kind: 'missing'}, active[1]], ['normal', 'missing']],
    ['usage-disabled', [{...active[0], phase: 'disabled'}, active[1]], ['normal', 'inactive']],
  ]) {
    const writes = [];
    const service = new HealthService(profile, {observe: async () => observations}, {publish: async value => writes.push(value)});
    const state = await service.recheck();
    assert.deepEqual([state.mode, state.components[0].status], expected, name);
    assert.equal(writes.length, 1);
  }
});

test('damaged inventory, loader failure and persistence failure are repair snapshots', async () => {
  const damaged = new HealthService(profile, {observe: async () => [{kind: 'damaged'}, active[1]]}, {publish: async () => undefined});
  assert.equal((await damaged.recheck()).mode, 'repair');
  const loaderFailure = new HealthService(profile, {observe: async () => { throw new Error('/secret'); }}, {publish: async () => undefined});
  assert.equal((await loaderFailure.recheck()).fault, 'INVENTORY_UNAVAILABLE');
  const persistenceFailure = new HealthService(profile, {observe: async () => active}, {publish: async () => { throw new Error('disk'); }});
  const failed = await persistenceFailure.recheck();
  assert.equal(failed.fault, 'PERSISTENCE_UNAVAILABLE');
  assert.equal(failed.mode, 'repair');
});

test('suite component versions are locked to package dependencies', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(profile.version, pkg.version);
  for (const component of profile.components) assert.equal(component.versionRange, pkg.dependencies[component.moduleName]);
});

test('real DSH include-prefixed ids and package root or subpath names match suite components', async () => {
  for (const appHostName of ['@hanamesh/dsh-app-host', '@hanamesh/dsh-app-host/dsh']) {
    const entries = [
      {id: 'include:hanamesh-usage', options: {name: 'hanamesh-usage'}, fiber: {state: 2}},
      {id: 'include:hanamesh-app-host', options: {name: appHostName}, fiber: {state: 2}},
    ];
    const source = new LoaderObservationSource({entries: () => entries}, import.meta.url, async moduleName => ({kind: 'present', version: moduleName === 'hanamesh-usage' ? '0.2.0-rc.6' : '0.1.0-rc.18'}));
    const observations = await source.observe(profile.components);
    assert.deepEqual(observations.map(row => [row.kind, row.phase]), [['present', 'active'], ['present', 'active']], appHostName);
  }
});

test('package integrity accepts the loader subpath when the package root is not exported', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hm-health-subpath-'));
  const packageRoot = join(root, 'node_modules', '@hanamesh', 'dsh-app-host');
  await mkdir(join(packageRoot, 'lib'), {recursive: true});
  await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
    name: '@hanamesh/dsh-app-host', version: '0.1.0-rc.8', type: 'module',
    exports: {'./dsh': './lib/dsh.mjs'},
  }));
  await writeFile(join(packageRoot, 'lib', 'dsh.mjs'), 'export default {}\n');
  const baseUrl = pathToFileURL(join(root, 'probe.mjs')).href;
  assert.deepEqual(await inspectPackage('@hanamesh/dsh-app-host', baseUrl, '@hanamesh/dsh-app-host/dsh'), {
    kind: 'present', version: '0.1.0-rc.8',
  });
});

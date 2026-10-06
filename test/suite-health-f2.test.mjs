import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {HealthService} from '../lib/health/service.js';
import {LoaderObservationSource} from '../lib/health/loader.js';
import {SessionController} from '../lib/controller.js';
import {createRouteHandler, ROUTES} from '../lib/routes.js';
import {INITIAL_CORE_SNAPSHOT} from '../lib/contracts.js';
import {memoryStore} from './fixtures/core-store.mjs';

const profile = JSON.parse(await readFile('profile/suite.profile.json', 'utf8'));
// Fixed current product seed parameters; package/loader fixtures, not a product install.
const seeds = [
  ['hanamesh-core', profile.version, 'hanamesh-core'],
  ['hanamesh-usage', '0.2.0-rc.10', 'hanamesh-usage'],
  ['@hanamesh/dsh-app-host', '0.2.0-rc.2', 'hanamesh-app-host'],
  ['@hanamesh/app-vibe-trading', '0.2.0-rc.1', 'hanamesh-vibe'],
  ['dsh-codex-subscription', '2.5.2', 'dsh-codex-subscription'],
];

for (const [name, version, omittedEntry, expected] of [
  ['current five seeds', '0.2.0-rc.2', false, 'satisfied'],
  ['wrong current version', '0.2.0-rc.3', false, 'incompatible'],
  ['legacy pin is rejected', '0.1.0-rc.41', false, 'incompatible'],
  ['missing version', undefined, false, 'unreadable'],
  ['invalid version', 'unknown', false, 'unreadable'],
  ['missing loader entry', '0.2.0-rc.2', true, 'missing'],
]) {
  test(`fixed suite health through package inspection and HTTP: ${name}`, async t => {
    const root = await mkdtemp(join(tmpdir(), 'hm-suite-health-f2-'));
    t.after(() => rm(root, {recursive: true, force: true}));
    const entries = [];
    for (const [moduleName, seedVersion, id] of seeds) {
      const packageRoot = join(root, 'node_modules', moduleName);
      await mkdir(join(packageRoot, 'lib'), {recursive: true});
      await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
        name: moduleName, version: id === 'hanamesh-app-host' ? version : seedVersion,
        type: 'module', exports: {'./dsh': './lib/dsh.mjs'},
      }));
      await writeFile(join(packageRoot, 'lib/dsh.mjs'), 'export default {}\n');
      if (id !== 'hanamesh-app-host' || !omittedEntry) {
        entries.push({id: `include:${id}`, options: {name: `${moduleName}/dsh`}, fiber: {state: 2}});
      }
    }
    const service = new HealthService(profile,
      new LoaderObservationSource({entries: () => entries}, pathToFileURL(join(root, 'probe.mjs')).href),
      {publish: async () => undefined});
    t.after(() => service.close());
    const controller = await SessionController.create({serverOrigin: null, websiteOrigin: null}, memoryStore(INITIAL_CORE_SNAPSHOT).store);
    controller.attachHealth(service);
    const handle = createRouteHandler(controller);
    const origin = 'http://127.0.0.1:41001';
    const response = await handle(new Request(`${origin}${ROUTES.healthRecheck}`, {
      method: 'POST', headers: {origin, 'sec-fetch-site': 'same-origin'},
    }));
    assert.equal(response.status, 200);
    const health = await response.json();
    assert.deepEqual(health.components.map(row => row.id), ['usage', 'app-host']);
    assert.equal(health.components[0].status, 'satisfied');
    const appHost = health.components[1];
    assert.equal(appHost.requiredRange, '0.2.0-rc.2');
    assert.equal(appHost.status, expected);
    assert.equal(appHost.nextStep, expected === 'satisfied' ? null : 'restore-pinned-component');
    const state = await (await handle(new Request(`${origin}${ROUTES.state}`))).json();
    assert.equal(state.components[1].status, expected);
    assert.equal(state.components[1].requiredRange, '0.2.0-rc.2');
  });
}

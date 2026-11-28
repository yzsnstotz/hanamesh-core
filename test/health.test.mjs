import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {HealthService} from '../lib/health/service.js';
import {inspectPackage, LoaderObservationSource} from '../lib/health/loader.js';
import {evaluate} from '../lib/health/evaluate.js';

const profile = JSON.parse(await readFile('profile/suite.profile.json', 'utf8'));
const active = ['0.2.0-rc.26','0.1.2','0.1.0'].map(version=>({kind:'present',version,phase:'active'}));

test('the shipped profile verifies the supported component release lines',()=>{
  const at=(index,version)=>evaluate(profile,active.map((row,i)=>i===index?{...row,version}:row),1).components[index].status;
  for(const version of ['0.2.0-rc.26','0.2.0-rc.27','0.2.0','0.2.5','0.3.0-rc.1','0.3.0'])assert.equal(at(0,version),'satisfied',version);
  for(const version of ['0.2.0-rc.25','0.2.0-rc.10','0.3.1-rc.1','0.4.0'])assert.equal(at(0,version),'incompatible',version);
  for(const version of ['0.1.2','0.1.3','0.2.0'])assert.equal(at(1,version),'satisfied',version);
  for(const version of ['0.1.1','0.2.0-rc.1','0.2.1','0.3.0'])assert.equal(at(1,version),'incompatible',version);
  assert.equal(at(2,'0.1.0'),'satisfied');
  assert.equal(at(2,'0.2.0'),'incompatible');
});

test('notice components distinguish present, missing and disabled without restricting healthy core', async () => {
  for (const [name, observations, expected] of [
    ['all-present', active, ['normal', 'satisfied']],
    ['usage-missing', [{kind: 'missing'}, ...active.slice(1)], ['normal', 'missing']],
    ['usage-disabled', [{...active[0], phase: 'disabled'}, ...active.slice(1)], ['normal', 'inactive']],
  ]) {
    const writes = [];
    const service = new HealthService(profile, {observe: async () => observations}, {publish: async value => writes.push(value)});
    const state = await service.recheck();
    assert.deepEqual([state.mode, state.components[0].status], expected, name);
    assert.equal(writes.length, 1);
  }
});

test('damaged inventory, loader failure and persistence failure are repair snapshots', async () => {
  const damaged = new HealthService(profile, {observe: async () => [{kind: 'damaged'}, ...active.slice(1)]}, {publish: async () => undefined});
  assert.equal((await damaged.recheck()).mode, 'repair');
  const loaderFailure = new HealthService(profile, {observe: async () => { throw new Error('/secret'); }}, {publish: async () => undefined});
  assert.equal((await loaderFailure.recheck()).fault, 'INVENTORY_UNAVAILABLE');
  const persistenceFailure = new HealthService(profile, {observe: async () => active}, {publish: async () => { throw new Error('disk'); }});
  const failed = await persistenceFailure.recheck();
  assert.equal(failed.fault, 'PERSISTENCE_UNAVAILABLE');
  assert.equal(failed.mode, 'repair');
});

test('suite health expectations do not require installing optional components', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(profile.version, pkg.version);
  for (const component of profile.components) { assert.ok(component.versionRange); assert.equal(pkg.dependencies?.[component.moduleName], undefined); }
});

test('real DSH include-prefixed ids and package root or subpath names match suite components',async()=>{
  for(const suffix of ['','/dsh']){
    const entries=profile.components.map(row=>({id:'include:'+row.loaderEntryId,options:{name:row.moduleName+suffix},fiber:{state:2}}));
    const source=new LoaderObservationSource({entries:()=>entries},import.meta.url,async name=>active[profile.components.findIndex(row=>row.moduleName===name)]);
    assert.deepEqual((await source.observe(profile.components)).map(row=>[row.kind,row.phase]),active.map(()=>['present','active']));
  }
});

test('package integrity accepts the loader subpath when the package root is not exported', async t => {
  const root = await mkdtemp(join(tmpdir(), 'hm-health-subpath-'));
  t.after(() => rm(root, {recursive: true, force: true}));
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

test('failed startup diagnostic persists safe reason and action in the existing health shape, then recovers', async () => {
  const secret = '/private/owner/token-DO-NOT-EXPOSE';
  const fiber = {state: 3, async await() { throw Object.assign(new Error(`domain 'hanamesh_usage_events': stored global does not match its schema ${secret}`), {name: 'DomainError', code: 'invalid-record', stack: secret, detail: {key: secret}, cause: new Error(secret)}); }};
  const source = new LoaderObservationSource({entries: () => profile.components.map((row,i)=>({
    id:row.loaderEntryId,options:{name:row.moduleName},fiber:i===0?fiber:{state:2},
  }))}, import.meta.url, async name=>active[profile.components.findIndex(row=>row.moduleName===name)]);
  const writes = [];
  const service = new HealthService(profile, source, {publish: async value => writes.push(value)});
  const failed = await service.recheck();
  assert.equal(failed.mode, 'repair');
  assert.equal(failed.newProtectedOperations, 'reject');
  assert.equal(failed.components[0].status, 'failed');
  assert.match(failed.components[0].reason, /invalid-record（hanamesh_usage_events）.*本地存储记录不符合/);
  assert.match(failed.components[0].nextStep, /先备份本地数据/);
  assert.match(failed.components[0].nextStep, /完全退出并重开 DSH/);
  assert.match(failed.nextStep, /各组件提示/);
  assert.doesNotMatch(JSON.stringify(writes), /private|owner|token|stack|detail|cause|startupFailure/);
  assert.deepEqual(Object.keys(failed.components[0]).sort(), Object.keys(evaluate(profile, active, 1).components[0]).sort());
  fiber.state = 2;
  const healthy = await service.recheck();
  assert.equal(healthy.mode, 'normal');
  assert.equal(healthy.components[0].status, 'satisfied');
  assert.equal(healthy.components[0].nextStep, null);
  assert.doesNotMatch(healthy.components[0].reason, /invalid-record/);
});

test('startup diagnostics never override version policy or echo unrecognized error tokens', () => {
  const bad = '/private/owner/token-DO-NOT-EXPOSE';
  const diagnostic = {code: bad, domain: bad, message: bad, stack: bad};
  const failed = evaluate(profile, [{...active[0], phase: 'failed', startupFailure: diagnostic}, ...active.slice(1)], 1);
  assert.equal(failed.components[0].status, 'failed');
  assert.match(failed.components[0].reason, /startup-failed/);
  assert.match(failed.components[0].nextStep, /组件日志/);
  assert.doesNotMatch(JSON.stringify(failed), /private|owner|token/);
  const incompatible = evaluate(profile, [{...active[0], version: '0.4.0', phase: 'failed', startupFailure: {code: 'invalid-record', domain: 'hanamesh_usage_events'}}, ...active.slice(1)], 1);
  assert.equal(incompatible.components[0].status, 'incompatible');
  assert.equal(incompatible.components[0].nextStep, 'restore-pinned-component');
});

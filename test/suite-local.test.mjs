import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {LoaderObservationSource} from '../lib/health/loader.js';
import {suiteInspector, packageMetadata} from '../lib/suite/local.js';
import {SuiteDeclarationService} from '../lib/suite/service.js';
import {SessionController} from '../lib/controller.js';
import {INITIAL_CORE_SNAPSHOT} from '../lib/contracts.js';
import {configOf} from '../lib/validation.js';

test('local registry test configuration is explicit, loopback-only and defaults empty',()=>{
 const base={serverOrigin:null,websiteOrigin:null};
 assert.deepEqual(configOf(base).suiteLocalTestRegistries,[]);
 assert.deepEqual(configOf({...base,suiteLocalTestRegistries:['http://127.0.0.1:25123/registry/']}).suiteLocalTestRegistries,['http://127.0.0.1:25123/registry/']);
 for(const value of ['http://remote.invalid/','https://registry.invalid/','http://user:pass@localhost:25123/','http://localhost:25123/?query=secret']) assert.throws(()=>configOf({...base,suiteLocalTestRegistries:[value]}),{code:'CORE_INPUT_INVALID'});
});

test('physical Core and external peer facts come from public installed metadata without executing plugins', async t => {
  const root = await mkdtemp(join(tmpdir(), 'core-suite-local-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const repository = 'https://github.com/fixture/core';
  const core = {name: 'core', version: '1.0.0', repository, engines: {node: '>=24 <25'}, dsh: {bundle: {patch: './profile/cordis.patch.yml'}}};
  async function put(metadata) {
    const dir = join(root, 'node_modules', metadata.name);
    await mkdir(dir, {recursive: true});
    await writeFile(join(dir, 'package.json'), JSON.stringify({...metadata, exports: {'.': './index.mjs', './package.json': './package.json'}}));
    await writeFile(join(dir, 'index.mjs'), 'throw Error("PLUGIN_MUST_NOT_EXECUTE");');
  }
  await put(core);
  await put({name: 'external-peer', version: '2.7.1'});
  const baseUrl = pathToFileURL(join(root, 'fixture.mjs')).href;
  assert.equal((await packageMetadata('external-peer', baseUrl)).version, '2.7.1');
  assert.equal(await packageMetadata('../private', baseUrl), null);
  const source = new LoaderObservationSource({entries: () => [{id: 'core', options: {name: 'core'}, fiber: {state: 2}}]}, baseUrl, suiteInspector());
  const requirement = {id: 'core', moduleName: 'core', label: 'Core', versionRange: '1.0.0', onFailure: 'notice', impact: ''};
  let observed = (await source.observe([requirement]))[0];
  assert.equal(observed.metadata.version, '1.0.0');
  assert.equal(observed.repository, repository);
  await put({...core, version: '1.1.0'});
  observed = (await source.observe([requirement]))[0];
  assert.equal(observed.version, '1.1.0', 'physical metadata is reread, not require-cached');
  const profile = {schemaVersion: 1, id: 'fixture', version: '1.0.0', label: 'fixture', runningTaskPolicy: 'preserve-and-pause', components: []};
  const service = new SuiteDeclarationService({core, profile, manifest: {schemaVersion: 1, id: 'fixture', core, components: []}, inventory: {observe: async () => []}, coreInventory: async () => (await source.observe([requirement]))[0], nodeVersion: process.versions.node, peerVersion: async () => null, registry: {read: async () => {throw Error('NO_NETWORK');}}});
  const declaration = await service.read();
  assert.equal(declaration.installed[0].runningVersion, '1.0.0');
  assert.equal(declaration.installed[0].actualVersion, '1.1.0');
  assert.notEqual(declaration.completeness, 'complete');
  assert.deepEqual(declaration.upgrades, []);
});

test('public getter without a registry performs zero network or persistence writes and returns stable facts', async t => {
  let state = structuredClone(INITIAL_CORE_SNAPSHOT), writes = 0;
  const controller = await SessionController.create({serverOrigin: null, websiteOrigin: null}, {read: () => state, publish: async next => {state = next; writes++;}, close: async () => {}});
  t.after(() => controller.dispose());
  const before = writes;
  const fetch = globalThis.fetch;
  globalThis.fetch = async () => {throw Error('NO_NETWORK');};
  try {
    const first = await controller.service.getSuiteDeclaration();
    const second = await controller.service.getSuiteDeclaration();
    assert.equal(first.declarationId, second.declarationId);
    assert.ok(first.blocked.some(row => row.code === 'CORE_SUITE_SOURCE_MISSING'));
    assert.equal(writes, before);
    assert.equal(first.nodeVersion, process.versions.node);
    assert.ok(!Number.isNaN(Date.parse(first.checkedAt)));
    assert.ok(Object.isFrozen(first.manifest));
  } finally {globalThis.fetch = fetch;}
});

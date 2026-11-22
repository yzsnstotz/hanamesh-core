import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SUITE_MANIFEST} from '../lib/suite/index.js';
import {evaluate} from '../lib/health/evaluate.js';
import {LoaderObservationSource} from '../lib/health/loader.js';
import {SuiteDeclarationService} from '../lib/suite/service.js';

const json=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const core=await json('../package.json');
const profile=await json('../profile/suite.profile.json');
const coreRepository='https://github.com/yzsnstotz/hanamesh-core';
const members=[
  [core.name,core.version,'hanamesh-core',coreRepository],
  ['@hanamesh/usage','0.3.0-rc.20','hanamesh-usage','https://github.com/yzsnstotz/hanamesh-usage'],
  ['@hanamesh/market','0.1.2','hanamesh-market',coreRepository],
  ['@hanamesh/theme','0.1.0','hanamesh-theme',coreRepository],
];

function fixture(omitted,bundleInventory=async()=>null){
  const observed=new Map(members.map(([name,version,_id,repository])=>[name,{
    kind:'present',phase:'active',version,repository,
    metadata:{name,version,repository,dsh:{bundle:{patch:'./cordis.patch.yml'}}},
  }]));
  const entries=members.filter(([name])=>name!==omitted)
    .map(([name,_version,id])=>({id,options:{name},fiber:{state:2}}));
  const inventory=new LoaderObservationSource({entries:()=>entries},import.meta.url,async name=>observed.get(name));
  const service=new SuiteDeclarationService({
    profile,core,manifest:SUITE_MANIFEST,inventory,coreInventory:async()=>observed.get(core.name),
    bundleInventory,nodeVersion:'24.13.1',peerVersion:async()=>null,
    registry:{read:()=>assert.fail('passive suite reads must stay offline')},
  });
  return{inventory,service};
}

test('the direct desktop suite is complete and healthy with Core, Usage, Market and Theme',async()=>{
  const {inventory,service}=fixture();
  assert.deepEqual(SUITE_MANIFEST.components.map(row=>row.moduleName),members.slice(1).map(([name])=>name));
  assert.equal(Object.hasOwn(core,'hanameshSuiteInstall'),false);
  const health=evaluate(profile,await inventory.observe(profile.components),1);
  assert.equal(health.mode,'normal');
  assert.deepEqual(health.components.map(row=>[row.moduleName,row.status]),members.slice(1).map(([name])=>[name,'satisfied']));
  const suite=await service.read();
  assert.equal(suite.completeness,'complete');
  assert.equal(suite.bundleVersion,null);
  assert.equal(suite.installCommand,null);
  assert.deepEqual(suite.upgrades,[]);
  assert.deepEqual(suite.installed.map(row=>[row.moduleName,row.actualVersion,row.status]),members.map(([name,version])=>[name,version,'satisfied']));
  assert.equal(suite.legacy?.status,'installed');
});

test('direct suite health and completeness still name each missing required component',async()=>{
  for(const [name] of members.slice(1)){
    const {inventory,service}=fixture(name);
    const health=evaluate(profile,await inventory.observe(profile.components),1);
    assert.deepEqual(health.components.filter(row=>row.status==='missing').map(row=>row.moduleName),[name]);
    const suite=await service.read();
    assert.equal(suite.completeness,'incomplete');
    assert.ok(suite.legacy?.issues.some(row=>row.moduleName===name&&row.code==='CORE_LEGACY_COMPONENT_MISSING'));
  }
});

test('the installed aggregate must contain exactly the current suite members',async()=>{
  const dependencies=Object.fromEntries(members.map(([name,version])=>[name,version]));
  const installed={...SUITE_MANIFEST.bundle,version:'1.0.0',dependencies,dsh:{bundle:{patch:'./cordis.patch.yml'}}};
  const physical=await fixture(undefined,async()=>installed).service.read();
  assert.equal(physical.completeness,'complete');
  assert.equal(physical.bundleVersion,installed.version);
  assert.equal(physical.legacy,undefined);

  const missingMember={...dependencies};
  delete missingMember['@hanamesh/theme'];
  const extraMember={...dependencies,'@hanamesh/dsh-app-host':'0.6.30'};
  const replaceMember={...missingMember,'@hanamesh/dsh-app-host':'0.6.30'};
  for(const readBundle of [
    async()=>{throw Error('unreadable');},
    ...[missingMember,extraMember,replaceMember].map(dependencies=>async()=>({...installed,dependencies})),
  ]){
    const invalid=await fixture(undefined,readBundle).service.read();
    assert.notEqual(invalid.completeness,'complete');
    assert.equal(invalid.legacy,undefined);
    assert.ok(invalid.blocked.some(row=>row.code==='CORE_SUITE_INSTALLED_METADATA_MISMATCH'));
  }
});

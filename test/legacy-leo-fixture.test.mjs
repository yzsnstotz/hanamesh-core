import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessLegacyInstallation} from '../lib/suite/index.js';

const readFixture=file=>JSON.parse(readFileSync(new URL('./fixtures/'+file,import.meta.url),'utf8'));
const current=readFixture('direct-desktop-public-metadata.json');
const assess=components=>assessLegacyInstallation({scope:'profile',nodeVersion:'24.13.1',components});

test('DT7 the four direct Desktop members are installed in disk scope',async()=>{
 const result=await assess(current.components);
 assert.equal(result.status,'installed');
 assert.equal(result.reason.code,'CORE_LEGACY_COMPONENTS_INSTALLED');
 assert.deepEqual(result.issues,[]);
 assert.deepEqual(result.components.map(row=>[row.name,row.version]),
  current.components.map(row=>[row.moduleName,row.observation.version]));
});

test('DT7 rejects the historical three-member receipt against the current declaration',async()=>{
 const historical=readFixture('leo-legacy-public-metadata.json');
 await assert.rejects(assess(historical.components),{code:'CORE_LEGACY_FACTS_INVALID'});
});

const invalidFacts=[
 ['source','CORE_LEGACY_COMPONENT_SOURCE',row=>{row.observation.metadata.repository='https://github.com/fixture/other';}],
 ['version','CORE_LEGACY_COMPONENT_VERSION',row=>{row.observation.version=row.observation.metadata.version='0.1.1';}],
 ['peer','CORE_SUITE_PEER_INCOMPATIBLE',row=>{row.peers.react='19.0.0';}],
];
for(const [fact,code,change] of invalidFacts)test('DT7 public Desktop metadata rejects an incompatible '+fact,async()=>{
 const components=structuredClone(current.components);
 const market=components.find(row=>row.moduleName==='@hanamesh/market');
 change(market);
 const result=await assess(components);
 assert.equal(result.status,'incomplete');
 assert.ok(result.issues.some(issue=>issue.code===code&&issue.moduleName===market.moduleName));
});

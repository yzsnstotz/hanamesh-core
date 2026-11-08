import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {formatSuiteInstallCommand} from '../lib/suite/index.js';
import {SuiteDeclarationService} from '../lib/suite/service.js';
import {loadCoreSchema, validateCoreValue} from '../lib/contract-suite.js';
const registry='https://registry.invalid/';
const repo=name=>`https://github.com/fixture/${name}`;
const record=(name,version,peers={})=>({name,version,repository:repo(name),engines:{node:'>=24 <25'},dsh:{bundle:{patch:'./profile/cordis.patch.yml'}},peerDependencies:peers});
const profile={schemaVersion:1,id:'hanamesh-suite',version:'1.0.0',label:'fixture',runningTaskPolicy:'preserve-and-pause',components:['usage','apps'].map((moduleName,i)=>({id:['usage','app-host'][i],moduleName,repository:repo(moduleName),label:moduleName,versionRange:'^1.0.0',onFailure:'notice',impact:''}))};
const manifest=version=>({schemaVersion:1,id:profile.id,bundle:{name:'bundle',repository:repo('bundle')},core:{name:'core',version,repository:repo('core')},components:profile.components.map(({id,moduleName,versionRange,repository})=>({id,moduleName,versionRange,repository}))});
const bundle=(version,dependencies)=>({...record('bundle',version),dependencies});
const installedBundle=bundle('1.0.0',{core:'1.0.0',usage:'1.0.0',apps:'1.0.0'});
const catalog={bundle:{'1.0.0':installedBundle,'1.1.0':bundle('1.1.0',{core:'1.1.0',usage:'1.1.0',apps:'1.1.0'})},core:{'1.0.0':{...record('core','1.0.0'),hanameshSuite:manifest('1.0.0')},'1.1.0':{...record('core','1.1.0'),hanameshSuite:manifest('1.1.0')}},usage:{'1.0.0':record('usage','1.0.0'),'1.1.0':record('usage','1.1.0')},apps:{'1.0.0':record('apps','1.0.0'),'1.1.0':record('apps','1.1.0')}};
const observed=name=>({kind:'present',phase:'active',version:'1.0.0',repository:repo(name),metadata:catalog[name]['1.0.0']});
function service({data=structuredClone(catalog),observations,physical=observed('core'),currentBundle=installedBundle,peerVersion=async()=>null,repairRelease={name:'bundle',version:'1.0.0',command:formatSuiteInstallCommand('1.0.0')}}={}){
 return new SuiteDeclarationService({profile,core:{...catalog.core['1.0.0'],...(repairRelease?{hanameshSuiteInstall:repairRelease}:{})},manifest:manifest('1.0.0'),bundleInventory:async()=>currentBundle,coreInventory:async()=>physical,inventory:{observe:async()=>observations??['usage','apps'].map(observed)},nodeVersion:'24.13.1',peerVersion,registry:{read:async(registry,name)=>({registry,name,versions:data[name]??{},...(name==='bundle'?{...(data.bundle['1.1.0']?{latestVersion:'1.1.0'}:{})}:{})})}});
}
test('current facts require the installed bundle and all active physical members, without network',async()=>{
 const s=service();s.options.registry.read=()=>assert.fail('no source means no network');const d=await s.read();assert.equal(d.completeness,'complete');assert.equal(d.bundleVersion,'1.0.0');assert.deepEqual(d.upgrades,[]);assert.equal(d.blocked[0].code,'CORE_SUITE_SOURCE_MISSING');assert.equal(d.installCommand,null);
 for(const currentBundle of [null,{...installedBundle,dependencies:{...installedBundle.dependencies,usage:'1.1.0'}}])assert.notEqual((await service({currentBundle}).read()).completeness,'complete');
 for(const phase of ['disabled','failed','pending'])assert.equal((await service({observations:[{...observed('usage'),phase},observed('apps')]}).read()).completeness,'incomplete');
});
test('upgrade selects one bundle version and its exact three locked versions',async()=>{
 const d=await service().read({registry});assert.equal(d.upgrades.length,1);assert.equal(d.upgrades[0].bundle.version,'1.1.0');assert.deepEqual(d.upgrades[0].targets.map(r=>r.version),['1.1.0','1.1.0','1.1.0']);assert.ok(Object.isFrozen(d));
 const data=structuredClone(catalog);data.usage['1.9.0']=record('usage','1.9.0');assert.deepEqual((await service({data}).read({registry})).upgrades[0].targets.map(r=>r.version),['1.1.0','1.1.0','1.1.0']);
 assert.deepEqual((await service().read({registry,bundleVersion:'9.0.0'})).upgrades,[]);
});
test('bundle dependencies reject ranges, foreign members, missing metadata and downgrades',async()=>{
 for(const mutate of [d=>d.bundle['1.1.0'].dependencies.usage='^1.0.0',d=>delete d.bundle['1.1.0'].dependencies.apps,d=>d.bundle['1.1.0'].dependencies.foreign='1.0.0',d=>delete d.usage['1.1.0'],d=>{d.usage['0.9.0']=record('usage','0.9.0');d.bundle['1.1.0'].dependencies.usage='0.9.0';}]){
  const data=structuredClone(catalog);mutate(data);const d=await service({data}).read({registry});assert.deepEqual(d.upgrades,[]);assert.ok(d.blocked.some(r=>r.bundleVersion==='1.1.0'));
 }
});
test('unpublished child releases never become an independently chosen tuple',async()=>{
 const data=structuredClone(catalog);delete data.bundle['1.1.0'];assert.deepEqual((await service({data}).read({registry})).upgrades,[]);
 data.bundle['1.0.0+repack']=bundle('1.0.0+repack',{core:'1.1.0',usage:'1.1.0',apps:'1.1.0'});assert.deepEqual((await service({data}).read({registry})).upgrades,[]);
 data.bundle['1.1.0']=bundle('1.1.0',installedBundle.dependencies);const promoted=await service({data}).read({registry});assert.equal(promoted.upgrades.length,1,'a new bundle remains upgradeable with retained child versions');assert.equal(promoted.upgrades[0].bundle.version,'1.1.0');
});
test('every locked record and the bundle must satisfy source, manifest, Node and peers',async()=>{
 for(const mutate of [d=>delete d.core['1.1.0'].hanameshSuite,d=>d.core['1.1.0'].hanameshSuite.core.version='9.0.0',d=>d.bundle['1.1.0'].repository=repo('foreign'),d=>d.core['1.1.0'].engines={node:'>=25'},d=>d.apps['1.1.0'].peerDependencies={usage:'9.0.0'},d=>d.bundle['1.1.0'].peerDependencies={external:'^1.0.0'},d=>d.usage['1.1.0'].dsh=undefined]){
  const data=structuredClone(catalog);mutate(data);assert.deepEqual((await service({data}).read({registry})).upgrades,[]);
 }
 const data=structuredClone(catalog);data.bundle['1.1.0'].peerDependencies={external:'^2.0.0'};data.bundle['1.1.0'].peerDependenciesMeta={external:{optional:true}};
 for(const [actual,allowed] of [[null,true],['1.0.0',false],[{status:'unknown'},false],['2.0.0',true]])assert.equal((await service({data,peerVersion:async()=>actual}).read({registry})).upgrades.length>0,allowed);
});
test('physical mismatch, unknown metadata and live renderer changes revoke upgrades',async()=>{
 for(const physical of [{kind:'ambiguous'},{kind:'unreadable'},{...observed('core'),version:'1.1.0'}]){const d=await service({physical}).read({registry});assert.notEqual(d.completeness,'complete');assert.deepEqual(d.upgrades,[]);}
 const s=service();let context='a'.repeat(64);s.options.clientPeerFacts=()=>({source:'core-client-lease',status:'known',reason:null,reactVersion:'18.3.1',contextId:context});const read=s.options.registry.read;s.options.registry.read=async(...args)=>{context='b'.repeat(64);return read(...args)};const d=await s.read({registry});assert.equal(d.completeness,'unknown');assert.deepEqual(d.upgrades,[]);assert.ok(d.blocked.some(r=>r.code==='CORE_SUITE_CLIENT_PEER_CHANGED'));
});
test('declaration schema and digest bind bundle version and metadata without leaking unsafe registries',async()=>{
 await loadCoreSchema();const a=await service().read({registry}),b=await service().read({registry});assert.equal(a.declarationId,b.declarationId);assert.deepEqual(validateCoreValue('SuiteDeclaration',a),[]);
 const data=structuredClone(catalog);data.bundle['1.1.0'].dependencies.usage='1.0.0';assert.notEqual((await service({data}).read({registry})).declarationId,a.declarationId);
 for(const registry of ['https://fixture:password@registry.invalid/','https://registry.invalid/?token=hidden','file:///private/']){const d=await service().read({registry});assert.equal(d.registry,null);assert.doesNotMatch(JSON.stringify(d),/password|token=hidden|file:\/\/\/private/);}
});

test('malformed future manifests and engine declarations never produce ready bundle upgrades',async()=>{
 for(const mutate of [m=>m.core.repository={url:repo('core')},m=>m.components[0].repository={url:repo('usage')},m=>m.components[0].versionRange='',m=>m.components.push({...m.components[0],id:'foreign',moduleName:'foreign'}),m=>m.components[0]=null,m=>m.bundle.name='foreign']){const data=structuredClone(catalog);mutate(data.core['1.1.0'].hanameshSuite);assert.deepEqual((await service({data}).read({registry})).upgrades,[]);}
 for(const engines of [null,[],'node>=24',{node:24},{node:''},{node:'not-a-range'}]){const data=structuredClone(catalog);data.core['1.1.0'].engines=engines;assert.deepEqual((await service({data}).read({registry})).upgrades,[]);}
});

test('A2 repair uses the Core release pin even when registry tags and compatible candidates move',async()=>{
 const s=service();
 assert.equal((await s.read({registry})).installCommand,formatSuiteInstallCommand('1.0.0'));
 for(const repairRelease of [null,{name:'foreign',version:'1.0.0',command:formatSuiteInstallCommand('1.0.0')},{name:'bundle',version:'^1.0.0',command:'unreviewed'},{name:'bundle',version:'1.0.0',command:'unreviewed'},{name:'bundle',version:'9.0.0',command:formatSuiteInstallCommand('9.0.0')}]){
  const d=await service({repairRelease}).read({registry});assert.equal(d.installCommand,null,'missing or unavailable exact Core pin never uses a registry tag');
 }
});

test('candidate source remains checked independently of the exact Core repair pin',async()=>{
 const data=structuredClone(catalog);data.bundle['1.1.0'].repository=repo('foreign');
 const d=await service({data}).read({registry});assert.deepEqual(d.upgrades,[]);assert.ok(d.blocked.some(row=>row.bundleVersion==='1.1.0'&&row.code==='CORE_SUITE_SOURCE_MISMATCH'));
 assert.equal(d.installCommand,formatSuiteInstallCommand('1.0.0'));
});

test('DSH prerelease runtime remains complete without opting other peers into prereleases',async()=>{
 const range=JSON.parse(readFileSync(new URL('../packages/hanamesh/package.json',import.meta.url),'utf8')).peerDependencies['@deepseek-ai/dsh-client-ui-primitives'];
 const peers={'@deepseek-ai/dsh':range,'@deepseek-ai/dsh-client-ui-primitives':range};
 const runtime='0.2.2-rc.1';
 const declaration=await service({currentBundle:{...installedBundle,peerDependencies:peers},peerVersion:async()=>runtime}).read();
 assert.equal(declaration.completeness,'complete','official DSH accepts this prerelease runtime');
 assert.deepEqual(declaration.peerFacts,Object.fromEntries(Object.keys(peers).map(name=>[name,runtime])));
 const workspace=await service({currentBundle:{...installedBundle,peerDependencies:{'@deepseek-ai/dsh':'workspace:^'}},peerVersion:async()=>runtime}).read();
 assert.equal(workspace.completeness,'complete','DSH range syntax is interpreted by the public SDK, not Core SemVer checks');
 const other=await service({currentBundle:{...installedBundle,peerDependencies:{external:'>=0.2.0 <0.3.0-0'}},peerVersion:async()=>runtime}).read();
 assert.equal(other.completeness,'incomplete','other peer ranges keep standard SemVer prerelease behavior');
});

test('Core emits the selected exact upgrade definition for the actual profile and verified registry',async()=>{
 const d=await service().read({registry,profile:'work'});
 assert.equal(d.upgrades.length,1);
 const {createSuiteInstallRelease}=await import('../lib/suite/index.js');
 assert.deepEqual(d.upgrades[0].installation,createSuiteInstallRelease('1.1.0',{profile:'work',registry}));
 const declared=await service().read({profile:'desktop'});
 assert.equal(declared.registry,'https://registry.npmjs.org/');
 assert.equal((await service().read()).registry,null,'passive facts stay offline');
 const bad=await service().read({registry,profile:'../owner'});assert.deepEqual(bad.upgrades,[]);
});

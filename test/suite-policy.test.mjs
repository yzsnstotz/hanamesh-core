import test from 'node:test';import assert from 'node:assert/strict';
import {SuiteDeclarationService} from '../lib/suite/service.js';
import {loadCoreSchema, validateCoreValue} from '../lib/contract-suite.js';
const repo=name=>`https://github.com/fixture/${name}`;
const profile={schemaVersion:1,id:'hanamesh-suite',version:'1.0.0',label:'fixture',runningTaskPolicy:'preserve-and-pause',components:[{id:'usage',moduleName:'usage',repository:repo('usage'),label:'usage',versionRange:'^1.0.0',onFailure:'notice',impact:''},{id:'app-host',moduleName:'apps',repository:repo('apps'),label:'apps',versionRange:'^1.0.0',onFailure:'notice',impact:''}]};
const core={name:'core',version:'1.0.0',repository:repo('core'),engines:{node:'>=24 <25'},dsh:{bundle:{patch:'./profile/cordis.patch.yml'}}};
const manifest=version=>({schemaVersion:1,id:profile.id,core:{name:'core',version,repository:repo('core')},components:profile.components.map(({id,moduleName,versionRange,repository})=>({id,moduleName,versionRange,repository}))});
const record=(name,version,peers={})=>({name,version,repository:{url:'git+'+repo(name)+'.git'},engines:{node:'>=24 <25'},dsh:{bundle:{patch:'./profile/cordis.patch.yml'}},peerDependencies:peers});
const catalog={core:{'1.0.0':{...core,hanameshSuite:manifest('1.0.0')},'1.1.0':{...record('core','1.1.0'),hanameshSuite:manifest('1.1.0')}},usage:{'1.0.0':record('usage','1.0.0'), '1.1.0':record('usage','1.1.0',{apps:'1.0.0'})},apps:{'1.0.0':record('apps','1.0.0'), '1.2.0':record('apps','1.2.0',{usage:'9.0.0'})}};
function service({data=catalog,observations, nodeVersion='24.13.1',peerVersion=async()=>null,coreObservation}={}){return new SuiteDeclarationService({profile,core,manifest:manifest('1.0.0'),coreInventory:async()=>coreObservation??({kind:'present',phase:'active',version:core.version,repository:core.repository,metadata:core}),inventory:{observe:async()=>observations??profile.components.map((_,i)=>({kind:'present',version:'1.0.0',phase:'active',repository:repo(profile.components[i].moduleName),metadata:record(profile.components[i].moduleName,'1.0.0')}))},nodeVersion,peerVersion,registry:{read:async(registry,name)=>({registry,name,versions:data[name]??{}})}});}
test('no source reports current requirements and completeness without treating normal health as complete',async()=>{
 let d=await service().read();assert.equal(d.completeness,'complete');assert.equal(d.blocked[0].code,'CORE_SUITE_SOURCE_MISSING');assert.deepEqual(d.upgrades,[]);
 d=await service({observations:[{kind:'missing'},{kind:'present',version:'1.0.0',phase:'active'}]}).read({registry:'https://registry.invalid/'});assert.equal(d.completeness,'incomplete');assert.deepEqual(d.upgrades,[]);
});
test('whole tuple search avoids individually highest incompatible versions and forbids downgrade/no-op',async()=>{
 const d=await service().read({registry:'https://registry.invalid/'});const target=d.upgrades.find(x=>x.coreVersion==='1.1.0');assert.ok(target);assert.deepEqual(target.targets.map(x=>x.version),['1.1.0','1.0.0','1.0.0']);assert.ok(d.upgrades.every(x=>x.targets.some((t,i)=>t.version!=='1.0.0')));assert.ok(Object.isFrozen(d));
});
test('future Core without own manifest, wrong version, source mismatch, Node and required peers cannot upgrade',async()=>{
 for(const mutation of [d=>delete d.core['1.1.0'].hanameshSuite,d=>d.core['1.1.0'].hanameshSuite.core.version='9.0.0',d=>d.core['1.1.0'].repository=repo('other'),d=>d.core['1.1.0'].engines.node='>=25',d=>d.core['1.1.0'].peerDependencies={unknown:'^1.0.0'}]){
  const data=structuredClone(catalog);mutation(data);const d=await service({data}).read({registry:'https://registry.invalid/'});assert.ok(!d.upgrades.some(x=>x.coreVersion==='1.1.0'));assert.ok(d.blocked.some(x=>x.coreVersion==='1.1.0'));
 }
});
test('stable declaration digest binds source/current versions/target facts and missing inventory fails closed',async()=>{
 const a=await service().read({registry:'https://registry.invalid/'}),b=await service().read({registry:'https://registry.invalid/'});assert.equal(a.declarationId,b.declarationId);
 assert.notEqual(a.declarationId,(await service().read({registry:'https://different.invalid/'})).declarationId);
 assert.equal((await service({observations:[]}).read({registry:'https://registry.invalid/'})).completeness,'unknown');
});

test("same Core version must search past the unchanged tuple for a compatible dependency upgrade",async()=>{const d=await service().read({registry:"https://registry.invalid/",coreVersion:"1.0.0"});assert.ok(d.upgrades.some(x=>x.coreVersion==="1.0.0"&&x.targets.some(t=>t.version==="1.1.0")),"SAME_CORE_DEPENDENCY_UPGRADE_MISSING");});

test("running/physical Core mismatch and ambiguous inventory cannot be complete",async()=>{for(const physical of [{kind:"present",phase:"active",version:"1.1.0",repository:repo("core"),metadata:record("core","1.1.0")},{kind:"ambiguous"},{kind:"unreadable"}]){const d=await service({coreObservation:physical}).read({registry:"https://registry.invalid/"});assert.notEqual(d.completeness,"complete");assert.deepEqual(d.upgrades,[]);assert.ok(d.blocked.some(x=>x.code==="CORE_SUITE_RUNNING_PHYSICAL_MISMATCH"));}});
test("optional peers distinguish absent from installed incompatible and unknown; invalid peer paths never reach local inspection",async()=>{const data=structuredClone(catalog);data.core["1.1.0"].peerDependencies={external:"^2.0.0"};data.core["1.1.0"].peerDependenciesMeta={external:{optional:true}};for(const [actual,allowed]of [[null,true],["1.0.0",false],[{status:"unknown"},false],["2.0.0",true]]){const d=await service({data,peerVersion:async()=>actual}).read({registry:"https://registry.invalid/"});assert.equal(d.upgrades.some(x=>x.coreVersion==="1.1.0"),allowed);}for(const name of ["../private","/tmp/private","file:secret","@scope/name/private"]){data.core["1.1.0"].peerDependencies={[name]:"*"};let calls=0;const d=await service({data,peerVersion:async()=>{calls++;return"1.0.0";}}).read({registry:"https://registry.invalid/"});assert.equal(calls,0);assert.ok(!d.upgrades.some(x=>x.coreVersion==="1.1.0"));}});

test("notice health does not make missing, inactive, failed or ambiguous components complete",async()=>{for(const observation of [{kind:"missing"},{kind:"present",version:"1.0.0",phase:"disabled",repository:repo("usage"),metadata:record("usage","1.0.0")},{kind:"present",version:"1.0.0",phase:"failed",repository:repo("usage"),metadata:record("usage","1.0.0")},{kind:"ambiguous"}]){const d=await service({observations:[observation,{kind:"present",version:"1.0.0",phase:"active",repository:repo("apps"),metadata:record("apps","1.0.0")}]}).read({registry:"https://registry.invalid/"});assert.notEqual(d.completeness,"complete");assert.deepEqual(d.upgrades,[]);}});
test('unsupported registry inputs never echo userinfo, query or fragments into public declarations',async()=>{
 for(const registry of ['https://fixture-user:fixture-pass@registry.invalid/','https://registry.invalid/?fixture-token=hidden','https://registry.invalid/#private','file:///tmp/private/']) {
  const declaration=await service().read({registry});assert.equal(declaration.registry,null);assert.ok(declaration.blocked.some(row=>row.code==='CORE_SUITE_SOURCE_UNSUPPORTED'));assert.doesNotMatch(JSON.stringify(declaration),/fixture-pass|fixture-token|#private|file:\/\/\/tmp/);
 }
});

test("build metadata changes alone are not a semantic version upgrade",async()=>{const data=structuredClone(catalog);data.core={"1.0.0+repack":{...record("core","1.0.0+repack"),hanameshSuite:manifest("1.0.0+repack")}};data.usage={"1.0.0":record("usage","1.0.0")};data.apps={"1.0.0":record("apps","1.0.0")};assert.deepEqual((await service({data}).read({registry:"https://registry.invalid/"})).upgrades,[]);});
test('future manifests with object repositories, empty ranges or unknown required roles never produce ready tuples',async()=>{
 await loadCoreSchema();
 for(const mutate of [m=>m.core.repository={url:repo('core')},m=>m.components[0].repository={url:repo('usage')},m=>m.components[0].versionRange='',m=>m.components.push({...m.components[0],id:'unknown',moduleName:'unknown'}),m=>m.components[0]=null]){
  const data=structuredClone(catalog);mutate(data.core['1.1.0'].hanameshSuite);const declaration=await service({data}).read({registry:'https://registry.invalid/'});assert.ok(!declaration.upgrades.some(row=>row.coreVersion==='1.1.0'));assert.ok(declaration.blocked.some(row=>row.coreVersion==='1.1.0'&&row.code==='CORE_SUITE_MANIFEST_MISMATCH'));assert.deepEqual(validateCoreValue('SuiteDeclaration',declaration),[]);
 }
 assert.deepEqual(validateCoreValue('SuiteDeclaration',await service().read({registry:'https://registry.invalid/'})),[]);
});

test("explicit malformed engines metadata is unknown rather than unconstrained",async()=>{for(const engines of [null,[],"node>=24",{node:24},{node:""},{node:"not-a-range"}]){const data=structuredClone(catalog);data.core["1.1.0"].engines=engines;const declaration=await service({data}).read({registry:"https://registry.invalid/"});assert.ok(!declaration.upgrades.some(row=>row.coreVersion==="1.1.0"));assert.ok(declaration.blocked.some(row=>row.coreVersion==="1.1.0"&&row.code==="CORE_SUITE_METADATA_INVALID"));}});

test("all current and candidate tuple members require a supported public DSH bundle declaration",async()=>{for(const name of ["core","usage","apps"]){for(const dsh of [undefined,null,[],{},{bundle:null},{bundle:"unknown"},{bundle:{patch:"../private.yml"}},{bundle:{patch:"https://other.invalid/bundle.yml"}},{bundle:{patch:24}}]){const data=structuredClone(catalog);for(const record of Object.values(data[name]))record.dsh=dsh;const declaration=await service({data}).read({registry:"https://registry.invalid/"});assert.deepEqual(declaration.upgrades,[],name);assert.ok(declaration.blocked.some(row=>/^CORE_SUITE_BUNDLE_(MISSING|INVALID)$/.test(row.code)),JSON.stringify(declaration.blocked));}}const observations=profile.components.map(row=>({kind:"present",phase:"active",version:"1.0.0",repository:repo(row.moduleName),metadata:{...record(row.moduleName,"1.0.0"),dsh:undefined}}));const current=await service({observations}).read();assert.equal(current.completeness,"incomplete");assert.ok(current.blocked.some(row=>row.code==="CORE_SUITE_BUNDLE_MISSING"));});

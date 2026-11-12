import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SuiteDeclarationService} from '../lib/suite/service.js';
const pkg=JSON.parse(readFileSync('package.json','utf8')), manifest=pkg.hanameshSuite;
const profile=JSON.parse(readFileSync('profile/suite.profile.json','utf8'));
const names=[manifest.core.name,...manifest.components.map(c=>c.moduleName)];
const versions=['0.3.24','0.3.0-rc.7','0.6.16'];
export const facts=()=>({nodeVersion:'24.13.1',components:names.map((moduleName,i)=>({moduleName,observation:{kind:'present',phase:'active',version:versions[i],metadata:{name:moduleName,version:versions[i],repository:i?manifest.components[i-1].repository:manifest.core.repository,dsh:{bundle:{patch:'./profile/cordis.patch.yml'}},engines:{node:'>=24 <25'}}},peers:{}}))});
async function assess(value){const api=await import('../lib/suite/index.js');assert.equal(typeof api.assessLegacyInstallation,'function','Core must publish the single assessor');return api.assessLegacyInstallation(value)}
test('DT7 leo tuple without bundle is installed legacy with an optional upgrade command',async()=>{
 const result=await assess(facts());assert.equal(result.status,'installed');assert.equal(result.reason.code,'CORE_LEGACY_COMPONENTS_INSTALLED');assert.equal(result.components.length,3);assert.match(result.reason.action,/--save-exact @hanamesh\/hanamesh@/);assert.ok(Object.isFrozen(result));
});
test('DT7 no Core numeric floor; valid much older Core still uses metadata and peers',async()=>{
 const value=facts();value.components[0].observation.version='0.1.0';value.components[0].observation.metadata.version='0.1.0';assert.equal((await assess(value)).status,'installed');
});
test('DT7 absence means every required member is absent, partial installs name the missing member',async()=>{
 const value=facts();value.components.forEach(c=>c.observation={kind:'missing'});assert.equal((await assess(value)).status,'not-installed');
 value.components[0]=facts().components[0];const result=await assess(value);assert.equal(result.status,'incomplete');assert.ok(result.issues.some(i=>i.moduleName===names[1]&&i.code==='CORE_LEGACY_COMPONENT_MISSING'));
});
test('DT7 existing ranges, metadata format, sources, disabled state and unknown facts remain enforced',async()=>{
 for(const [mutate,code] of [
  [f=>{f.components[2].observation.version='0.5.8';f.components[2].observation.metadata.version='0.5.8'},'CORE_LEGACY_COMPONENT_VERSION'],
  [f=>f.components[1].observation.metadata.version='bad','CORE_LEGACY_COMPONENT_METADATA'],
  [f=>f.components[0].observation.metadata.dsh.bundle.patch='../escape','CORE_SUITE_BUNDLE_INVALID'],
  [f=>f.components[0].observation.metadata.repository='https://github.com/foreign/core','CORE_LEGACY_COMPONENT_SOURCE'],
  [f=>f.components[1].observation.phase='disabled','CORE_LEGACY_COMPONENT_INACTIVE'],
  [f=>f.components[0].observation.metadata.engines.node='>=25','CORE_SUITE_NODE_INCOMPATIBLE'],
  [f=>f.components[0].observation.metadata.peerDependencies={[names[2]]:'>=0.6.20'},'CORE_SUITE_PEER_INCOMPATIBLE'],
  [f=>f.components[0].observation.metadata.peerDependencies={external:'not-a-range'},'CORE_SUITE_METADATA_INVALID'],
 ]){const value=facts();mutate(value);const result=await assess(value);assert.equal(result.status,'incomplete',code);assert.ok(result.issues.some(i=>i.code===code&&i.moduleName),code)}
 const value=facts();value.components[1].observation={kind:'unreadable'};assert.equal((await assess(value)).status,'unknown');
});
test('DT7 external peers use collected facts, optional absent is allowed and unknown stays unknown',async()=>{
 const value=facts();value.components[0].observation.metadata.peerDependencies={external:'^1.0.0'};
 assert.equal((await assess(value)).status,'unknown');value.components[0].peers.external='1.2.0';assert.equal((await assess(value)).status,'installed');
 value.components[0].peers.external=null;value.components[0].observation.metadata.peerDependenciesMeta={external:{optional:true}};assert.equal((await assess(value)).status,'installed');
});
test('DT7 current runtime declaration uses the same legacy verdict without enabling unvalidated upgrades',async()=>{
 const f=facts();f.components[0].observation.version=pkg.version;f.components[0].observation.metadata.version=pkg.version;
 const service=new SuiteDeclarationService({profile,manifest,core:pkg,inventory:{observe:async()=>f.components.slice(1).map(c=>({...c.observation,repository:c.observation.metadata.repository}))},coreInventory:async()=>({...f.components[0].observation,repository:manifest.core.repository}),bundleInventory:async()=>null,nodeVersion:f.nodeVersion,peerVersion:async()=>null,registry:{read:()=>assert.fail('no network')}});
 const result=await service.read();assert.equal(result.legacy?.status,'installed');assert.equal(result.bundleVersion,null);assert.deepEqual(result.upgrades,[]);
});
test('DT7 a running/physical mismatch is a concrete component failure, never an upgrade floor',async()=>{const f=facts();f.components[0].runningVersion='0.3.38';const r=await assess(f);assert.equal(r.status,'incomplete');assert.ok(r.issues.some(i=>i.code==='CORE_LEGACY_RUNNING_PHYSICAL_MISMATCH'))});
test('DT7 public Cordis assessor is optional, read-only, schema-valid and disposed with Core',async()=>{
 const {SessionController}=await import('../lib/controller.js');const {INITIAL_CORE_SNAPSHOT}=await import('../lib/contracts.js');const {loadCoreSchema,validateCoreValue}=await import('../lib/contract-suite.js');
 let writes=0,state=structuredClone(INITIAL_CORE_SNAPSHOT);const controller=await SessionController.create({serverOrigin:null,websiteOrigin:null},{read:()=>state,publish:async value=>{writes++;state=value},close:async()=>{}});const before=writes;
 try{const result=await controller.service.assessLegacyInstallation(facts());assert.equal(result.status,'installed');assert.equal(writes,before);await loadCoreSchema();assert.deepEqual(validateCoreValue('LegacyInstallationAssessment',result),[]);await assert.rejects(controller.service.assessLegacyInstallation({nodeVersion:'24.13.1',components:[]}),{code:'CORE_LEGACY_FACTS_INVALID'})}finally{await controller.dispose()}
 await assert.rejects(controller.service.assessLegacyInstallation(facts()),{code:'CORE_DISPOSED'});
});
test('DT7 disk scope validates member contracts without claiming another runtime Node/host peers',async()=>{
 const f={...facts(),scope:'profile',nodeVersion:'25.0.0'};f.components[0].observation.metadata.peerDependencies={external:'^1.0.0'};
 assert.equal((await assess(f)).status,'installed','unobserved injected host peers and runtime Node are outside the disk scope');
 f.components[0].peers.external='0.9.0';assert.equal((await assess(f)).status,'incomplete','observed incompatible peer is still a concrete failure');
 f.components[0].observation.metadata.peerDependencies={external:'not-a-range'};assert.equal((await assess(f)).status,'incomplete','format is checked even without host observations');
});
test('DT7 unreadable bundle never becomes authoritative legacy absence',async()=>{
 const f=facts(),s=new SuiteDeclarationService({profile,manifest,core:pkg,inventory:{observe:async()=>f.components.slice(1).map(c=>c.observation)},coreInventory:async()=>f.components[0].observation,bundleInventory:async()=>{throw Error('unreadable')},nodeVersion:f.nodeVersion,peerVersion:async()=>null,registry:{read:()=>assert.fail('no network')}});
 assert.equal((await s.read()).legacy,undefined);
});
test('DT7 legacy assessment rechecks renderer context after its last asynchronous peer read',async()=>{
 const f=facts();f.components[0].observation.metadata.peerDependencies={external:'^1.0.0'};let context='start';
 const s=new SuiteDeclarationService({profile,manifest,core:pkg,inventory:{observe:async()=>[{kind:'missing'},f.components[2].observation]},coreInventory:async()=>f.components[0].observation,bundleInventory:async()=>null,nodeVersion:f.nodeVersion,peerVersion:async()=>{context='changed';return'1.0.0'},clientPeerFacts:()=>({source:'core-client-lease',status:'known',reason:null,reactVersion:'18.3.1',contextId:context}),registry:{read:()=>assert.fail('no network')}});
 const result=await s.read();assert.equal(result.legacy.status,'unknown');assert.ok(result.blocked.some(r=>r.code==='CORE_SUITE_CLIENT_PEER_CHANGED'));
});
// R204-C01: declaration validity does not depend on observing a host version.
for(const [field,value] of [['peer','not-a-range'],['engine','workspace:*'],['engine',''],['peer','workspace:bad']])test(`DT8 C01 rejects invalid DSH ${field} ${JSON.stringify(value)} without host facts`,async()=>{
 const f={...facts(),scope:'profile'};
 if(field==='peer')f.components[0].observation.metadata.peerDependencies={'@deepseek-ai/dsh':value};
 else f.components[0].observation.metadata.engines.dsh=value;
 const result=await assess(f);assert.equal(result.status,'incomplete');assert.ok(result.issues.some(i=>i.moduleName===names[0]&&i.code==='CORE_SUITE_METADATA_INVALID'));
});
test('DT8 C01 SDK workspace peers and engines.dsh precedence remain valid',async()=>{
 for(const range of ['workspace:^','workspace:~','workspace:*','>=0.2.2-0 <0.3.0-0']){
  const f={...facts(),scope:'profile'};f.components[0].observation.metadata.peerDependencies={'@deepseek-ai/dsh':range};assert.equal((await assess(f)).status,'installed',range);
 }
 const f={...facts(),scope:'profile'};f.components[0].observation.metadata.engines.dsh='>=0.2.2-0 <0.3.0-0';f.components[0].observation.metadata.peerDependencies={'@deepseek-ai/dsh':'ignored-by-engines'};assert.equal((await assess(f)).status,'installed');
});
test('DT8 C02 explicit unreadable peer stays unknown and names the dependency',async()=>{
 const f={...facts(),scope:'profile'};f.components[0].observation.metadata.peerDependencies={external:'^1.0.0'};f.components[0].peers.external='unknown';
 const result=await assess(f);assert.equal(result.status,'unknown');assert.ok(result.issues.some(i=>i.moduleName===names[0]&&i.code==='CORE_SUITE_PEER_UNKNOWN'&&i.message.includes('external')));
 assert.match(result.reason.message,/external/);
 f.components[0].observation.metadata.peerDependenciesMeta={external:{optional:true}};assert.equal((await assess(f)).status,'unknown','optional unreadable is not authoritative absence');
 for(const value of [undefined,null]){f.components[0].peers.external=value;assert.equal((await assess(f)).status,'installed','unobserved disk host injection stays outside this scope')}
});

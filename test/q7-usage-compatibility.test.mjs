import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {evaluate} from '../lib/health/evaluate.js';import {SuiteDeclarationService} from '../lib/suite/service.js';
const pkg=JSON.parse(await readFile('package.json','utf8')),profile=JSON.parse(await readFile('profile/suite.profile.json','utf8'));
const manifest=pkg.hanameshSuite;
const record=(name,version,repository)=>({name,version,repository,engines:{node:'>=24 <25'},dsh:{bundle:{patch:'./profile/cordis.patch.yml'}}});
for(const [version,expected]of [['0.2.0-rc.33',true],['0.3.0-rc.1',true],['0.3.0',true],['0.2.0-rc.25',false],['0.3.1-rc.1',false],['0.4.0',false]])test('Q7 actual health and suite candidate search: Usage '+version,async()=>{
 const records=manifest.components.map(c=>record(c.moduleName,c.id==='usage'?version:'0.6.0',c.repository));
 const observations=records.map(r=>({kind:'present',phase:'active',version:r.version,repository:r.repository,metadata:r}));
 assert.equal(evaluate(profile,observations,0).components[0].status,expected?'satisfied':'incompatible');
 const core=record(pkg.name,pkg.version,manifest.core.repository),physical={kind:'present',phase:'active',version:core.version,repository:core.repository,metadata:core};
 const service=new SuiteDeclarationService({core,profile,manifest,inventory:{observe:async()=>observations},coreInventory:async()=>physical,nodeVersion:'24.13.1',peerVersion:async()=>null,registry:{read:async(registry,name)=>({registry,name,versions:name===core.name?{[core.version]:{...core,hanameshSuite:manifest}}:Object.fromEntries(records.filter(r=>r.name===name).map(r=>[r.version,r]))})}});
 const d=await service.read({registry:'https://registry.invalid/'});assert.equal(d.installed[1].status,expected?'satisfied':'incompatible');
 // Search with old published Usage installed; target registry offers new client.
 const old=record(records[0].name,'0.2.0-rc.33',records[0].repository);service.options.inventory.observe=async()=>[{kind:'present',phase:'active',version:old.version,repository:old.repository,metadata:old},observations[1]];
 const searched=await service.read({registry:'https://registry.invalid/'});
 assert.equal(searched.upgrades.some(u=>u.targets.some(t=>t.moduleName===old.name&&t.version===version)),expected&&version!=='0.2.0-rc.33');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createCoreSuiteAdapter,prepareSuiteUpgrade} from '../src/library/suite.js';
import {declaration,core} from './fixtures/core-suite-declaration.mjs';

const names=['@hanamesh/core','@hanamesh/usage','@hanamesh/dsh-app-host'];
const versions=['0.3.24','0.3.0-rc.7','0.6.16'];

for(const status of ['installed','unknown'])test(`DT7 current runtime forwards Core legacy verdict ${status}`,async()=>{
 const reason={code:status==='installed'?'CORE_LEGACY_COMPONENTS_INSTALLED':'CORE_LEGACY_COMPONENTS_UNKNOWN',
  message:'Core 旧套件读回',action:'查看 DSH 安装说明'};
 const components=names.map((name,index)=>({name,version:versions[index],active:true,status:'present'}));
 const blocked=[{code:'CORE_SUITE_CLIENT_PEER_NOT_CONNECTED'}];
 const provider=core({...declaration(),bundleVersion:null,completeness:'unknown',upgrades:[],
  legacy:{status,components,issues:[],reason},blocked});
 const result=await createCoreSuiteAdapter({core:()=>provider}).readFacts();
 assert.equal(result.status,status);
 assert.equal(result.version,null);
 assert.equal(result.completeness,'unknown');
 assert.deepEqual(result.components,components);
 assert.deepEqual(result.reason,reason);
 assert.deepEqual(result.blocked,blocked);
});

function directDeclaration(){
 const value=declaration();
 const repository=value.manifest.core.repository;
 value.manifest.core.version='0.3.41';
 value.manifest.components.splice(1,1,
  {id:'market',moduleName:'@hanamesh/market',versionRange:'^0.1.2',repository},
  {id:'theme',moduleName:'@hanamesh/theme',versionRange:'^0.1.0',repository});
 const currentVersions=['0.3.41','0.3.0-rc.20','0.1.3','0.1.0'];
 value.installed=[{id:'core',moduleName:value.manifest.core.name,versionRange:'0.3.41',repository},...value.manifest.components]
  .map(({id,moduleName,versionRange,repository},index)=>({id,moduleName,requiredRange:versionRange,
   repository,actualVersion:currentVersions[index],actualRepository:repository,status:'satisfied'}));
 return {...value,bundleVersion:null,installCommand:null,upgrades:[],blocked:[],
  legacy:{status:'installed',components:value.installed.map(row=>({name:row.moduleName,version:row.actualVersion,
   active:true,status:'present'})),issues:[],reason:{code:'CORE_LEGACY_COMPONENTS_INSTALLED',message:'已安装',action:'查看插件'}}};
}

for(const withTheme of [true,false])test(`the direct suite presents Core's complete verdict ${withTheme?'with Theme':'without Theme'}`,async()=>{
 const value=directDeclaration();
 if(!withTheme){
  value.manifest.components.pop();
  value.installed.pop();
  value.legacy.components.pop();
 }
 const provider=core(value);
 const adapter=createCoreSuiteAdapter({core:()=>provider});
 const result=await adapter.readFacts();
 assert.equal(result.completeness,'complete');
 assert.equal(result.version,null);
 assert.equal(result.status,'installed');
 assert.deepEqual(result.components,value.legacy.components);
 await assert.rejects(prepareSuiteUpgrade({coreSuitePlan:adapter}),{code:'CORE_SUITE_NO_COMPATIBLE_TUPLE'});
});

test('additional Core-declared members flow through exact suite plans',async()=>{
 const value=declaration();
 const extra={...value.manifest.components[0],id:'theme',moduleName:'@hanamesh/theme'};
 value.manifest.components.push(extra);
 const {id,moduleName,repository}=extra;
 value.installed.push({id,moduleName,requiredRange:extra.versionRange,repository,actualVersion:'0.1.0',
  actualRepository:repository,status:'satisfied'});
 value.upgrades[0].targets.push({id,moduleName,repository,version:'0.1.1',metadataDigest:'4'.repeat(64)});
 const provider=core(value);
 const adapter=createCoreSuiteAdapter({core:()=>provider});
 const plan=await prepareSuiteUpgrade({coreSuitePlan:adapter});
 assert.deepEqual(plan.components.map(row=>[row.name,row.from,row.to]),value.installed
  .map((row,index)=>[row.moduleName,row.actualVersion,value.upgrades[0].targets[index].version]));
});

const inconsistent=[
 ['duplicate member declaration',value=>{value.manifest.components[1].moduleName=value.manifest.components[0].moduleName;}],
 ['wrong installed membership',value=>{value.installed[2].moduleName='@hanamesh/other';}],
 ['wrong installed identity',value=>{value.installed[2].id='other';}],
 ['wrong target membership',value=>{value.upgrades[0].targets[2].moduleName='@hanamesh/other';}],
 ['disjoint target source',value=>{value.upgrades[0].targets[2].repository='https://example.test/other';}],
 ['duplicate legacy member',value=>{value.legacy.components[2].name=value.legacy.components[1].name;},directDeclaration],
];
for(const [description,mutate,make=declaration] of inconsistent)test('invalid Core suite facts reject '+description,async()=>{
 const value=make();
 mutate(value);
 const provider=core(value);
 await assert.rejects(createCoreSuiteAdapter({core:()=>provider}).readFacts(),{code:make===directDeclaration
  ?'CORE_LEGACY_ASSESSMENT_INVALID':'CORE_SUITE_DECLARATION_INVALID'});
});

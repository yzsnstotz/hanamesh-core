import test from 'node:test';
import assert from 'node:assert/strict';
const anchor=new URL('../package.json',import.meta.url).pathname;
const policy=async options=>{
 let api;try{api=await import('../src/native-market-policy.js');}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
 assert.equal(typeof api?.createNativeMarketPolicy,'function','AppHost must use the actual host compatibility evaluator');
 return api.createNativeMarketPolicy({anchor,...options});
};

test('CL6 policy reuses actual SDK engines.dsh precedence and exact runtime exemptions at every read',async()=>{
 const sdk=await import('@deepseek-ai/dsh-app-boot'),runtime=sdk.getDshRuntimeVersion();let exemptions={},calls=0;
 const manager={listVersionExemptions(){calls++;return{exemptions,warnings:[]};}},p=await policy({pluginManager:()=>manager});
 const manifest={name:'fixture-native',version:'1.0.0',engines:{dsh:'>=99'},peerDependencies:{'@deepseek-ai/dsh':runtime}};
 const before=await p.compatibility(manifest);assert.equal(before.compatible,false);assert.equal(before.exempted,false);
 assert.deepEqual(before.requirements,{'engines.dsh':'>=99'});assert.equal(before.runtimeVersion,runtime);
 exemptions={'fixture-native@1.0.0':[runtime]};assert.equal((await p.compatibility(manifest)).exempted,true);
 exemptions={'fixture-native@1.0.1':[runtime]};assert.equal((await p.compatibility(manifest)).exempted,false);assert.equal(calls,3);
});

test('CL6 policy uses actual SDK prerelease semantics rather than a client version comparison',async()=>{
 const sdk=await import('@deepseek-ai/dsh-app-boot'),runtime=sdk.getDshRuntimeVersion();
 const manager={listVersionExemptions:()=>({exemptions:{},warnings:[]})},p=await policy({pluginManager:()=>manager});
 for(const engines of ['>=0.2.0 <0.3.0','<0.2.0','workspace:*']){
  const manifest={name:'fixture-native',version:'1.0.0',engines:{dsh:engines}},issue=sdk.evaluatePluginCompatibility(manifest,{},runtime);
  assert.equal((await p.compatibility(manifest)).compatible,issue===undefined);
 }
});

test('CL6 missing manager or unreadable exemptions produce unknown capability errors, never compatible=true',async()=>{
 const p=await policy({pluginManager:()=>undefined});await assert.rejects(p.compatibility({name:'fixture',version:'1.0.0'}),/DSH_COMPATIBILITY_UNAVAILABLE/);
 const manager={listVersionExemptions(){throw Error('EXEMPTIONS_UNREADABLE');}},broken=await policy({pluginManager:()=>manager});
 await assert.rejects(broken.compatibility({name:'fixture',version:'1.0.0'}),/EXEMPTIONS_UNREADABLE/);
});

test('CL6 installed and newer statuses derive only from native listBundles and remain navigable package identities',async()=>{
 let bundles=[],reads=0;
 const manager={listBundles(){reads++;return bundles;}},p=await policy({pluginManager:()=>manager});
 assert.equal((await p.installation('fixture','1.0.0')).status,'not-installed');
 bundles=[{name:'fixture',installed:false,availability:'profile',version:'1.0.0'}];assert.equal((await p.installation('fixture','1.0.0')).status,'not-installed');
 bundles=[{name:'fixture',installed:false,availability:'installation',version:'1.0.0'}];assert.equal((await p.installation('fixture','1.0.0')).status,'provided');
 bundles=[{name:'fixture',installed:true,availability:'profile',version:'1.0.0'}];
 assert.equal((await p.installation('fixture','1.0.0')).status,'installed');assert.equal((await p.installation('fixture','1.0.1')).status,'update-available');
 assert.equal((await p.installation('fixture','0.9.0')).status,'different-version');assert.equal(reads,6);
 const unavailable=await policy({pluginManager:()=>undefined});await assert.rejects(unavailable.installation('fixture','1.0.0'),/DSH_BUNDLES_UNAVAILABLE/);
});

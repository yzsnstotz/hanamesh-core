import test from 'node:test';
import assert from 'node:assert/strict';
import {createMarketService,nativeInstallation,initialState} from '../src/service.js';
const target={source:'npm',name:'fixture-native',version:'1.0.0',allowBuild:[]};
const item={hanaId:'11111111-2222-4333-8444-555555555555',displayName:'Fixture native',publisher:{name:'Fixture author'},summary:{zh:'公开简介'},categories:[],channels:['dsh'],sourceLinks:[],githubRepo:null,oneClickInstall:{allowed:true,reason:null},installMethods:[{channel:'dsh',kind:'npm',spec:'fixture-native@1.0.0',command:'dsh plugin add fixture-native@1.0.0',target}]};
async function fixture({engines='>=0.2.0 <0.3.0',application=false,appHost}={}){let state=initialState(),version='1.0.0',bundles=[],calls=[],inspectCalls=0;const manager={listBundles:async()=>bundles,listVersionExemptions:()=>({exemptions:{},warnings:[]}),inspect:async()=>{inspectCalls++;return{status:'accepted',kind:'registry',bundle:true,registry:'https://registry.example/',name:'fixture-native',version};}};const service=createMarketService({domain:{global:{get:async()=>state,set:async next=>{state=next;}}},manager:()=>manager,appHost,anchor:new URL('../package.json',import.meta.url),fetchImpl:async(url,init)=>{calls.push({url:String(url),init});if(new URL(url).hostname==='registry.example')return Response.json({name:'fixture-native',version,dsh:{bundle:{patch:'./patch.yml'}},engines:{dsh:engines},...(application?{hanamesh:{app:'./app.json'}}:{})});return Response.json({...item,installMethods:[{...item.installMethods[0],target:{...target,version}}]});}});await service.init();return{service,calls,manager,setVersion:value=>version=value,setBundles:value=>bundles=value,inspectCalls:()=>inspectCalls};}
test('native prepare and confirm preserve exact source, identity and installed facts, with no install execution port',async t=>{const f=await fixture();t.after(()=>f.service.close());const review=await f.service.prepare({itemId:item.hanaId});assert.equal(review.install.spec,'fixture-native@1.0.0');assert.equal(review.item.publisher.name,'Fixture author');assert.equal(review.compatibility.compatible,true);assert.equal(f.service.install,undefined);const confirmed=await f.service.confirm({reviewId:review.reviewId});assert.equal(confirmed.install.spec,review.install.spec);await assert.rejects(f.service.confirm({reviewId:review.reviewId}),/CONFIRMATION_STALE/);});
test('a changed source tuple or source setting invalidates an already open native confirmation',async t=>{const f=await fixture();t.after(()=>f.service.close());const first=await f.service.prepare({itemId:item.hanaId});f.setVersion('1.0.1');await assert.rejects(f.service.confirm({reviewId:first.reviewId}),/CATALOG_CHANGED/);f.setVersion('1.0.0');const second=await f.service.prepare({itemId:item.hanaId});await f.service.saveSettings({websiteOrigin:'https://other.example'});await assert.rejects(f.service.confirm({reviewId:second.reviewId}),/CONFIRMATION_STALE/);});
test('native status distinguishes uninstalled on-demand records, provided bundles and genuine updates',()=>{assert.equal(nativeInstallation('fixture','1.0.0',null).status,'unknown');assert.equal(nativeInstallation('fixture','1.0.0',[{name:'fixture',installed:false,availability:'missing'}]).status,'not-installed');assert.equal(nativeInstallation('fixture','1.0.0',[{name:'fixture',installed:false,availability:'installation'}]).status,'provided');assert.equal(nativeInstallation('fixture','1.0.1',[{name:'fixture',installed:true,availability:'profile',version:'1.0.0'}]).status,'update-available');});

test('a directory read in flight cannot publish after a source setting change',async t=>{let state=initialState(),release;const service=createMarketService({domain:{global:{get:()=>state,set:async value=>state=value}},manager:()=>({listBundles:async()=>[]}),anchor:new URL('../package.json',import.meta.url),fetchImpl:()=>new Promise(resolve=>release=()=>resolve(Response.json({items:[],page:1,totalPages:0}))) });await service.init();t.after(()=>service.close());const pending=service.list({});await Promise.resolve();await service.saveSettings({websiteOrigin:'https://changed.example'});release();await assert.rejects(pending,/CATALOG_CHANGED/);});

test('native default registry is resolved through public registries when inspect returns null',async t=>{const f=await fixture();t.after(()=>f.service.close());f.manager.inspect=async()=>({status:'accepted',kind:'registry',bundle:true,registry:null});f.manager.registries=async()=>({registry:null,resolved:'https://registry.example/',fallbackRegistries:[]});const review=await f.service.prepare({itemId:item.hanaId});assert.equal(review.install.registry,'https://registry.example/');});



test('an unexempted engines mismatch stops native prepare before a confirmation can be issued',async t=>{const f=await fixture({engines:'>=99'});t.after(()=>f.service.close());await assert.rejects(f.service.prepare({itemId:item.hanaId}),/DSH_INCOMPATIBLE/);});

test('Market unload aborts an in-flight public directory transport',{timeout:2000},async t=>{let state=initialState();const entered=Promise.withResolvers(),manager={listBundles:async()=>[]};const service=createMarketService({domain:{global:{get:()=>state,set:async value=>state=value}},manager:()=>manager,anchor:new URL('../package.json',import.meta.url),fetchImpl:async(_url,{signal})=>{entered.resolve();return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Market disposed','AbortError')),{once:true}));}});await service.init();t.after(()=>service.close());const pending=service.list({});const cancelled=assert.rejects(pending,{name:'AbortError'});await entered.promise;await service.close();await cancelled;});

test('client targets for an installed bundle navigate to native package management without re-inspecting it as a new install',async t=>{const f=await fixture();t.after(()=>f.service.close());f.setBundles([{name:target.name,version:'0.9.0',installed:true,availability:'profile'}]);f.manager.inspect=async()=>assert.fail('an installed bundle must use native package management');f.manager.registries=async()=>({registry:'https://registry.example/',resolved:'https://registry.example/',fallbackRegistries:[]});const review=await f.service.prepare({itemId:item.hanaId});assert.equal(review.action,'openPackage');const confirmed=await f.service.confirm({reviewId:review.reviewId});assert.equal(confirmed.action,'openPackage');assert.equal(confirmed.target.name,target.name);});
test('a bundle installed in another native window invalidates an older new-install confirmation',async t=>{const f=await fixture();t.after(()=>f.service.close());const review=await f.service.prepare({itemId:item.hanaId});f.setBundles([{name:target.name,version:'0.9.0',installed:true,availability:'profile'}]);await assert.rejects(f.service.confirm({reviewId:review.reviewId}),/NATIVE_INSTALLATION_CHANGED/);});

test('a native registry change invalidates a source confirmation even when the catalog tuple is unchanged',async t=>{const f=await fixture();t.after(()=>f.service.close());const review=await f.service.prepare({itemId:item.hanaId});f.manager.inspect=async()=>({status:'accepted',kind:'registry',bundle:true,registry:'https://different-registry.example/'});await assert.rejects(f.service.confirm({reviewId:review.reviewId}),/CATALOG_CHANGED/);});
test('installed Git entries remain installed when the catalog does not declare an npm version',()=>{assert.equal(nativeInstallation('fixture-git',null,[{name:'fixture-git',installed:true,availability:'profile',version:'1.0.0'}]).status,'installed');});


test('CL7 official discovery mapping: registry updates expose native package navigation and never a reinstall intent', async t => {
 const f=await fixture();t.after(()=>f.service.close());f.setBundles([{name:target.name,version:'0.9.0',installed:true,availability:'profile',update:'registry'}]);
 f.manager.inspect=async()=>assert.fail('never inspect an installed registry bundle as a new install');
 const detail=await f.service.detail(item.hanaId);assert.equal(detail.nativeInstallation.status,'update-available');
 assert.deepEqual(detail.nativeUpdate,{action:'openPackage',packageName:target.name});
 await assert.rejects(f.service.prepare({itemId:item.hanaId,update:true}),/INVALID_INPUT/);
});

test('CL7 official Git update mapping uses the immutable catalog target and the SDK repository-origin check',async t=>{
 let state=initialState(),rows=[{name:'git-fixture',version:'1.0.0',installed:true,availability:'profile',update:'git',source:'github:fixture/repo#'+'a'.repeat(40)}];
 const git={source:'github',repo:'fixture/repo',ref:'b'.repeat(40),path:null,packageName:'git-fixture',allowBuild:[]};
 const data={...item,oneClickInstall:{allowed:true},installMethods:[{channel:'dsh',target:git}]};
 const manager={listBundles:async()=>rows,listVersionExemptions:()=>({exemptions:{}})};
 const f=createMarketService({domain:{global:{get:()=>state,set:async value=>state=value}},manager:()=>manager,anchor:new URL('../package.json',import.meta.url),fetchImpl:async url=>Response.json(String(url).includes('raw.githubusercontent.com')?{name:'git-fixture',version:'1.1.0',dsh:{bundle:{patch:'patch.yml'}},engines:{dsh:'>=0.2.2-rc.1 <0.3.0-0'}}:data)});await f.init();t.after(()=>f.close());
 const detail=await f.detail(item.hanaId);assert.equal(detail.nativeInstallation.status,'update-available');
 const sdk=await import('@deepseek-ai/dsh-plugin-manager');
 assert.deepEqual(detail.nativeUpdate,typeof sdk.pinnedGitOrigin==='function'?{action:'update',target:{packageName:'git-fixture',version:'1.1.0',spec:'github:fixture/repo#'+'b'.repeat(40)}}:{action:'openPackage',packageName:'git-fixture'},'actual host capability decides; no copied origin parser or invented update support');
 rows=[{...rows[0],source:'github:other/repo#'+'a'.repeat(40)}];
 assert.deepEqual((await f.detail(item.hanaId)).nativeUpdate,{action:'openPackage',packageName:'git-fixture'},'a different repository never becomes an update target');
});

test('the client suite reads fresh Core declarations and refuses a removed provider',async t=>{
 const {declaration}=await import('../tests/fixtures/core-suite-declaration.mjs');
 const current=declaration();
 let reads=0;
 let core={protocolVersion:'1',getSuiteDeclaration:async()=>({
  ...current,checkedAt:new Date(Date.UTC(2026,10,22,0,0,reads++)).toISOString(),
 })};
 const service=createMarketService({core:()=>core,domain:{global:{get:initialState}}});
 await service.init();
 t.after(()=>service.close());
 const before=await service.suiteStatus();
 const after=await service.suiteStatus();
 assert.equal(before.status,'installed');
 assert.equal(before.completeness,'complete');
 assert.equal(before.version,current.bundleVersion);
 assert.deepEqual(before.components.map(row=>[row.name,row.version,row.status]),current.installed.map(row=>[row.moduleName,row.actualVersion,'satisfied']));
 assert.ok(Date.parse(after.checkedAt)>Date.parse(before.checkedAt));
 assert.equal(reads,2);
 core=undefined;
 await assert.rejects(service.suiteStatus(),{code:'CORE_SUITE_DECLARATION_MISSING'});
});

test('native market settings preserve the active fields from an existing profile',async t=>{
 let state={schema:1,revision:7,settings:{websiteOrigin:'https://old.example',serverOrigin:'https://host.example',registry:null,suiteSourceMode:'core',handoff:{enabled:true}}};
 const service=createMarketService({domain:{global:{get:()=>state,set:async next=>{state=next;}}}});
 await service.init();
 t.after(()=>service.close());
 assert.deepEqual(service.settings(),{websiteOrigin:'https://old.example',serverOrigin:'https://host.example',registry:null,suiteSourceMode:'core'});
 await service.saveSettings({websiteOrigin:'https://new.example'});
 assert.deepEqual(state,{schema:1,revision:8,settings:{websiteOrigin:'https://new.example',serverOrigin:'https://host.example',registry:null,suiteSourceMode:'core'}});
});

test('R494 application confirmation uses AppHost once and waits for its terminal readback',async t=>{
 const calls=[],ready={status:'ready',restartRequired:true,appId:'fixture',packageName:target.name,version:target.version};
 const provider={async installApplication(input){calls.push(input);return ready;}};
 const {service}=await fixture({application:true,appHost:()=>provider});t.after(()=>service.close());
 const review=await service.prepare({itemId:item.hanaId});
 assert.equal(review.action,'installApplication');
 assert.deepEqual(calls,[]);
 assert.deepEqual((await service.confirm({reviewId:review.reviewId})).application,ready);
 assert.deepEqual(calls,[{target,version:target.version,registry:'https://registry.example/'}]);
 await assert.rejects(service.confirm({reviewId:review.reviewId}),{code:'CONFIRMATION_STALE'});
 assert.equal(calls.length,1);
});

test('R494 application preview and confirmation refuse a missing or replaced AppHost',async t=>{
 let provider;
 const {service}=await fixture({application:true,appHost:()=>provider});t.after(()=>service.close());
 await assert.rejects(service.prepare({itemId:item.hanaId}),{code:'APPHOST_INSTALL_UNAVAILABLE'});
 provider={installApplication:()=>assert.fail('the original provider is gone')};
 const review=await service.prepare({itemId:item.hanaId});
 provider={installApplication:()=>assert.fail('confirmation cannot run on a replacement provider')};
 await assert.rejects(service.confirm({reviewId:review.reviewId}),{code:'APPHOST_INSTALL_CHANGED'});
});

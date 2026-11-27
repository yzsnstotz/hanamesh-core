import assert from 'node:assert/strict';
import test from 'node:test';
import {createMarketService,initialState} from '../src/service.js';

const registry='https://registry.example/';
const version=(version,tags=[],overrides={})=>({version,tags,prerelease:false,bundle:true,...overrides});
async function fixture(t){
 let rows=[
  {name:'fixture-package',installed:true,availability:'profile',version:'1.0.0',update:'registry'},
  {name:'fixture-legacy',installed:true,availability:'profile',version:'1.0.0',updatable:true},
  {name:'fixture-provided',installed:false,availability:'installation',version:'1.0.0'},
  {name:'fixture-git',installed:true,availability:'profile',version:'1.0.0',update:'git'},
  {name:'fixture-missing',installed:false,availability:'missing'},
 ];
 let actual='1.0.0',offeredRegistry=registry,readback=true,active=0,peak=0;
 const listCalls=[],writes=[];
 const manager={
  listBundles:async()=>rows.map(row=>row.name==='fixture-package'?{...row,version:actual}:row),
  listVersions:async name=>{
   listCalls.push(name);active++;peak=Math.max(peak,active);await Promise.resolve();active--;
   if(name==='fixture-legacy')return {status:'refused',problem:'network',attempts:[]};
   return {status:'listed',installed:actual,registry:offeredRegistry,omitted:0,versions:[
    version('3.0.0',['latest'],{incompatible:{}}),
    version('2.0.0',[],{bundle:false}),
    version('1.2.0',['stable']),version('1.1.0'),version('1.0.0'),
   ]};
  },
  updateBundle:async(name,to,options)=>{
   writes.push({name,to,options});const from=actual;
   if(readback)actual=to;
   return {from,to,step:'install',result:{changed:true,application:'applied',stage:'enable',version:to}};
  },
 };
 const service=await createMarketService({domain:{global:{get:async()=>initialState()}},manager:()=>manager,fetchImpl:async()=>assert.fail('installed operations must use the official manager')}).init();
 t.after(()=>service.close());
 return {service,writes,listCalls,peak:()=>peak,setActual:next=>actual=next,setRegistry:next=>offeredRegistry=next,skipReadback:()=>readback=false};
}

test('installed list uses official profile facts and includes provided and uncatalogued packages',async t=>{
 const f=await fixture(t);
 const {packages}=await f.service.installed();
 assert.deepEqual(packages.map(row=>[row.name,row.updatable]),[
  ['fixture-package',true],['fixture-legacy',true],['fixture-provided',false],['fixture-git',false],
 ]);
 assert.deepEqual(f.listCalls,[]);
});

test('batch lookup is sequential and keeps per-package refusals, latest and compatible choices separate',async t=>{
 const f=await fixture(t);
 const {packages}=await f.service.checkInstalledUpdates();
 const [primary,legacy]=packages;
 assert.equal(primary.latest,'3.0.0');
 assert.deepEqual(primary.versions.map(row=>row.version),['1.2.0','1.1.0']);
 assert.equal(legacy.status,'unavailable');
 assert.deepEqual(f.listCalls,['fixture-package','fixture-legacy']);
 assert.equal(f.peak(),1);
 assert.deepEqual(f.writes,[]);
});

test('one confirmation installs exactly the selected npm upgrade and reads the installed version back',async t=>{
 const f=await fixture(t);
 const input={packageName:'fixture-package',version:'1.1.0'};
 const cancelled=await f.service.prepareInstalledUpdate(input);
 f.service.cancel({reviewId:cancelled.reviewId});
 await assert.rejects(f.service.confirm({reviewId:cancelled.reviewId}),/CONFIRMATION_STALE/);
 const review=await f.service.prepareInstalledUpdate(input);
 assert.equal(review.install.spec,'fixture-package@1.1.0');
 assert.equal(review.from,'1.0.0');
 assert.deepEqual(f.writes,[]);
 const confirmed=await f.service.confirm({reviewId:review.reviewId});
 assert.equal(confirmed.update.installedVersion,'1.1.0');
 assert.deepEqual(f.writes,[{name:'fixture-package',to:'1.1.0',options:{registry}}]);
 await assert.rejects(f.service.confirm({reviewId:review.reviewId}),/CONFIRMATION_STALE/);
});

test('refuses unknown packages, latest incompatibility, and changed registry or installed version before writing',async t=>{
 const f=await fixture(t);
 const input={packageName:'fixture-package',version:'1.1.0'};
 await assert.rejects(f.service.prepareInstalledUpdate({...input,packageName:'fixture-git'}),/DSH_UPDATE_UNAVAILABLE/);
 await assert.rejects(f.service.prepareInstalledUpdate({...input,version:'3.0.0'}),/DSH_UPDATE_VERSION_UNAVAILABLE/);
 const stale=await f.service.prepareInstalledUpdate(input);
 f.setRegistry('https://other.example/');
 await assert.rejects(f.service.confirm({reviewId:stale.reviewId}),/NATIVE_UPDATE_CHANGED/);
 const moved=await f.service.prepareInstalledUpdate(input);
 f.setActual('1.0.1');
 await assert.rejects(f.service.confirm({reviewId:moved.reviewId}),/NATIVE_UPDATE_CHANGED/);
 assert.deepEqual(f.writes,[]);
});

test('a manager success without exact installed readback does not mark the update complete',async t=>{
 const f=await fixture(t);
 const review=await f.service.prepareInstalledUpdate({packageName:'fixture-package',version:'1.1.0'});
 f.skipReadback();
 await assert.rejects(f.service.confirm({reviewId:review.reviewId}),/NATIVE_UPDATE_READBACK_INVALID/);
 assert.equal(f.writes.length,1);
});

test('the confirmation displays the exact reviewed from and to versions before the update port',async()=>{
 const {loadClient}=await import('../tests/fixtures/client-loader.mjs');
 const {NativeMarketConfirmation}=await loadClient();
 const modal=NativeMarketConfirmation({review:{
  action:'updateInstalled',from:'1.0.0',item:{displayName:'fixture-package'},
  target:{source:'npm'},install:{spec:'fixture-package@1.1.0',version:'1.1.0',registry},
 }});
 const shown=JSON.stringify(modal);
 assert.match(shown,/1\.0\.0 → 1\.1\.0/);
 assert.match(shown,/fixture-package@1\.1\.0/);
});

test('parallel confirmations cannot overwrite the version installed by an earlier review',async t=>{
 const f=await fixture(t);
 const one=await f.service.prepareInstalledUpdate({packageName:'fixture-package',version:'1.1.0'});
 const two=await f.service.prepareInstalledUpdate({packageName:'fixture-package',version:'1.2.0'});
 const first=f.service.confirm({reviewId:one.reviewId});
 const second=assert.rejects(f.service.confirm({reviewId:two.reviewId}),/NATIVE_UPDATE_CHANGED/);
 await Promise.all([first,second]);
 assert.equal(f.writes.length,1);
 assert.equal(f.writes[0].to,'1.1.0');
});

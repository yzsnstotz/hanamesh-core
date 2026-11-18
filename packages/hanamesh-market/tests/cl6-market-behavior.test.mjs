import test from 'node:test';
import assert from 'node:assert/strict';
import {loadClient,settle} from './fixtures/client-loader.mjs';
const page=items=>({items,page:1,total:items.length,totalPages:1});
const entry={hanaId:'fixture-hana',displayName:'Fixture',publisher:{name:'Author fixture'},sourceLinks:[{sourceId:'npm',sourceUrl:'https://www.npmjs.com/package/fixture'}]};
const choice={entry,install:{spec:'fixture@1.0.0',title:'Fixture',version:'1.0.0'},compatibility:{compatible:true}};
async function moduleFor(){return loadClient();}

test('CL6 native actions confirm exact owner target once, never execute a command or synthesize installed state',async t=>{
 const m=await moduleFor(t),installs=[],opened=[];
 const actions=m.createNativeMarketActions({install:value=>installs.push(value),openPackage:name=>opened.push(name)});
 const review=actions.review(choice);
 assert.deepEqual(review,{...choice,trustRequired:true});assert.equal(installs.length,0);
 actions.confirm(review);assert.deepEqual(installs,[choice.install]);
 assert.throws(()=>actions.confirm(review),/CONFIRMATION_STALE/);assert.equal(installs.length,1);
 actions.openInstalled('fixture');assert.deepEqual(opened,['fixture']);
 assert.equal(actions.capabilities.update,false);
});

test('CL6 missing native methods and unexempted engines mismatch cannot reach install',async t=>{
 const m=await moduleFor(t),installs=[];
 const missing=m.createNativeMarketActions({});assert.equal(missing.capabilities.install,false);
 assert.throws(()=>missing.review(choice),/DSH_INSTALL_UNAVAILABLE/);
 const actions=m.createNativeMarketActions({install:value=>installs.push(value)});
 assert.throws(()=>actions.review({...choice,compatibility:{compatible:false,exempted:false}}),/DSH_INCOMPATIBLE/);
 assert.throws(()=>actions.review({...choice,compatibility:null}),/DSH_COMPATIBILITY_UNKNOWN/);
 assert.equal(installs.length,0);
 actions.confirm(actions.review({...choice,compatibility:{compatible:false,exempted:true}}));assert.equal(installs.length,1);
});

test('CL6 a new review or explicit cancel invalidates the previous exact confirmation',async t=>{
 const m=await moduleFor(t),installs=[],actions=m.createNativeMarketActions({install:value=>installs.push(value)});
 const first=actions.review(choice),second=actions.review({...choice,install:{...choice.install,version:'1.0.1',spec:'fixture@1.0.1'}});
 assert.throws(()=>actions.confirm(first),/CONFIRMATION_STALE/);actions.cancel();assert.throws(()=>actions.confirm(second),/CONFIRMATION_STALE/);
 assert.equal(installs.length,0);
});

test('CL6 lists request 50, retain the last accepted list on read failure, retry the same page only on explicit request',async t=>{
 const m=await moduleFor(t),requests=[];let failed=false;
 const store=m.createNativeMarketListing({readPage:async query=>{requests.push(query);if(failed)throw Error('READ_FAILED');return{items:[entry],page:query.page,total:51,totalPages:2};},listBundles:async()=>[{name:'fixture',installed:true,availability:'profile',version:'1.0.0'}]});
 await store.load({q:'notes'});assert.equal(requests[0].limit,50);assert.equal(requests[0].page,1);
 const accepted=store.snapshot();assert.equal(accepted.items[0],entry);assert.equal(accepted.bundles[0].version,'1.0.0');
 failed=true;await store.more();assert.equal(store.snapshot().items[0],entry);assert.equal(store.snapshot().error,'READ_FAILED');assert.equal(requests.length,2);
 failed=false;await store.retry();assert.equal(requests.length,3);assert.equal(requests[2].page,2);assert.equal(store.snapshot().items.length,1,'same Hana identity does not duplicate across pages');
 store.dispose();
});

test('CL6 loading is observable before first reply and a stale reply never replaces a newer query',async t=>{
 const m=await moduleFor(t),pending=[],states=[];
 const store=m.createNativeMarketListing({readPage:query=>new Promise(resolve=>pending.push({query,resolve})),listBundles:async()=>[]});
 const stop=store.subscribe(value=>states.push(value));const first=store.load({q:'old'});
 assert.equal(store.snapshot().status,'loading');assert.equal(store.snapshot().items.length,0);
 const second=store.load({q:'new'});await settle();pending[1].resolve(page([{...entry,hanaId:'new'}]));await second;
 pending[0].resolve(page([{...entry,hanaId:'old'}]));await first;
 assert.equal(store.snapshot().items[0].hanaId,'new');assert(states.some(value=>value.status==='loading'));stop();store.dispose();
});

test('CL6 bundle read failure keeps last list but makes installed status unknown; it never falls back to AppHost inventory',async t=>{
 const m=await moduleFor(t);let failed=false;
 const store=m.createNativeMarketListing({readPage:async()=>page([entry]),listBundles:async()=>{if(failed)throw Error('BUNDLES_UNAVAILABLE');return[{name:'fixture',installed:true}];}});
 await store.load({});failed=true;await store.load({});
 assert.equal(store.snapshot().items[0],entry);assert.equal(store.snapshot().bundles,null);assert.equal(store.snapshot().error,'BUNDLES_UNAVAILABLE');store.dispose();
});

test('CL6 detail order is meta.detail then package README then repository README; errors are not treated as absence',async t=>{
 const m=await moduleFor(t),calls=[];
 const readers=Object.fromEntries(['meta','package','repository'].map(stage=>[stage,async()=>{calls.push(stage);return stage==='repository'?{status:'ready',markdown:'# Repository fixture'}:{status:'none'};}]));
 assert.equal((await m.readNativeMarketDetail(choice,readers)).markdown,'# Repository fixture');assert.deepEqual(calls,['meta','package','repository']);
 calls.length=0;readers.meta=async()=>{calls.push('meta');return{status:'ready',markdown:'# Localized detail'};};
 assert.equal((await m.readNativeMarketDetail(choice,readers)).markdown,'# Localized detail');assert.deepEqual(calls,['meta']);
 calls.length=0;readers.meta=async()=>{calls.push('meta');throw Error('DETAIL_UNAVAILABLE');};
 await assert.rejects(m.readNativeMarketDetail(choice,readers),/DETAIL_UNAVAILABLE/);assert.deepEqual(calls,['meta']);
});

const text=node=>node==null?'':Array.isArray(node)?node.map(text).join(' '):typeof node==='object'?text(node.children):String(node);
function find(node,predicate){if(!node)return;if(Array.isArray(node)){for(const child of node){const found=find(child,predicate);if(found)return found;}return;}if(typeof node==='object'){if(predicate(node))return node;return find(node.children,predicate);}}
test('CL6 confirmation uses the native Modal and displays exact version, author, sources and trust warning before native install',async t=>{
 const m=await moduleFor(t),installs=[],actions=m.createNativeMarketActions({install:value=>installs.push(value)}),Modal=()=>{};
 const review=actions.review(choice),tree=m.NativeMarketConfirmation({review,actions,Modal,onClose(){}});
 assert.equal(tree.type,Modal);assert.equal(tree.props.open,true);assert.match(text(tree),/Author fixture/);assert.match(text(tree),/1\.0\.0/);assert.match(text(tree),/fixture@1\.0\.0/);assert.match(text(tree),/第三方|third.party/);
 assert.equal(installs.length,0);
 const confirm=find(tree.props.footer,node=>node.type==='button'&&node.children.includes('确认安装'));assert(confirm);confirm.props.onClick();assert.equal(installs.length,1);
});

test('CL6 unsupported entries have only copy-command and website actions, with no local install handler',async t=>{
 const m=await moduleFor(t),copied=[],tree=m.NativeMarketExternalActions({command:'claude plugin install fixture',website:'https://catalog.example/hana/fixture',copy:value=>copied.push(value)});
 const button=find(tree,node=>node.type==='button');assert.equal(text(button),'复制命令');button.props.onClick();assert.deepEqual(copied,['claude plugin install fixture']);
 assert.equal(text(find(tree,node=>node.type==='a')),'去网站看');assert.doesNotMatch(text(tree),/确认安装|重试安装|卸载/);
});

test('CL6 loading skeleton and retained keyed results share the same container, with explicit retry and show-more actions',async t=>{
 const m=await moduleFor(t),calls=[],card=item=>({type:'article',props:{key:item.hanaId},children:[item.displayName]});
 const first=m.NativeMarketResults({snapshot:{status:'loading',items:[],hasMore:false},card,onRetry:()=>calls.push('retry'),onMore:()=>calls.push('more')});
 assert(find(first,node=>node.props['data-hanamesh-market-skeleton']));
 const failed=m.NativeMarketResults({snapshot:{status:'error',items:[entry],error:'READ_FAILED',hasMore:true},card,onRetry:()=>calls.push('retry'),onMore:()=>calls.push('more')});
 assert(find(failed,node=>node.type==='article'&&node.props.key===entry.hanaId));assert.match(text(failed),/READ_FAILED/);
 find(failed,node=>node.type==='button'&&node.children.includes('重试')).props.onClick();assert.deepEqual(calls,['retry']);
 const ready=m.NativeMarketResults({snapshot:{status:'ready',items:[entry],hasMore:true},card,onRetry:()=>{},onMore:()=>calls.push('more')});
 find(ready,node=>node.type==='button'&&node.children.includes('显示更多')).props.onClick();assert.deepEqual(calls,['retry','more']);
});

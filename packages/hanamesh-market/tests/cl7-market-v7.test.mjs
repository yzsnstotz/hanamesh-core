import test from 'node:test';
import assert from 'node:assert/strict';
import {loadClient} from './fixtures/client-loader.mjs';
import {marketMessages} from '../src/client-locale.js';
const text=node=>node==null?'':Array.isArray(node)?node.map(text).filter(Boolean).join(' '):typeof node==='object'?text(node.children):String(node);
function find(node,predicate){if(!node)return;if(Array.isArray(node)){for(const child of node){const found=find(child,predicate);if(found)return found;}return;}if(typeof node==='object'){if(predicate(node))return node;return find(node.children,predicate);}}
const item={hanaId:'fixture',displayName:'Fixture',publisher:{name:'Author'},overview:{does:{zh:'整理资料',en:'Organize sources',ja:'資料を整理する'},facts:{},evidence:[]},score:{status:'scored',displayTotal:8.4,displayScale:10,rulesVersion:'hanamesh-initial-v1',dimensions:{quality:80,popularity:null,maintenance:90},missing:[{key:'stars',reason:'没有观测'}],evidence:[]},trustBadges:[],featured:[]};
test('CL7 v7 detail actions render native status labels and separate update, open, install, and unknown operations',async()=>{
 const m=await loadClient(),calls=[];assert.equal(typeof m.NativeMarketDetailAction,'function');
 for(const [status,label,action]of[['not-installed','安装','install'],['update-available','有新版本 · 更新','update'],['installed','已安装 · 打开','open'],['provided','随 DSH 提供 · 打开','open'],['unknown','安装状态未知',null]]){
  const tree=m.NativeMarketDetailAction({item:{...item,nativeInstallation:{status,installedVersion:'0.9.0'}},external:false,onInstall:()=>calls.push('install'),onUpdate:()=>calls.push('update'),onOpen:()=>calls.push('open'),onRefresh:()=>calls.push('refresh')});
  const button=find(tree,n=>n.type==='button'&&text(n)===label);assert(button,label);assert.equal(button.props.disabled===true,status==='unknown');if(action){button.props.onClick();assert.equal(calls.at(-1),action);}
 }
 const external=m.NativeMarketDetailAction({item,external:true,externalActions:'COPY_AND_WEBSITE'});assert.match(text(external),/DSH 不能直接安装/);assert.doesNotMatch(text(external),/确认安装|有新版本/);
});
test('CL7 score presentation uses provider displayTotal directly and never turns unknown into zero or adds unsupported badges',async()=>{
 const m=await loadClient();assert.equal(typeof m.NativeMarketScore,'function');
 assert.match(text(m.NativeMarketScore({item})),/8\.4/);
 const sparse=m.NativeMarketScore({item:{...item,score:{...item.score,status:'insufficient',displayTotal:null}}});assert.match(text(sparse),/暂不评分/);assert.doesNotMatch(text(sparse),/0\.0/);
 const unknown=m.NativeMarketScore({item:{...item,score:undefined}});assert.match(text(unknown),/尚未评估/);
});
test('CL7 approved mapping calls update for Git and openPackage for registry without install or a Market confirmation',async()=>{
 const m=await loadClient(),calls=[],actions=m.createNativeMarketActions({install:v=>calls.push(['install',v]),update:v=>calls.push(['update',v]),openPackage:v=>calls.push(['openPackage',v])});
 const git={packageName:'git-fixture',version:'1.1.0',spec:'github:fixture/repo#'+'b'.repeat(40)};
 assert.equal(typeof actions.updateAvailable,'function');actions.updateAvailable({action:'update',target:git});actions.updateAvailable({action:'openPackage',packageName:'registry-fixture'});
 assert.deepEqual(calls,[['update',git],['openPackage','registry-fixture']]);
 const view=m.NativeMarketDetailAction({item:{...item,nativeInstallation:{status:'update-available',installedVersion:'1.0.0'},nativeUpdate:{action:'openPackage',packageName:'registry-fixture'}},onUpdate(){},onOpen(){}});
 assert.match(text(view),/在 DSH 中更新/);assert.match(text(view),/有新版本 · 更新/);assert.doesNotMatch(text(view),/确认更新/);
 const absent=m.createNativeMarketActions({install:()=>assert.fail('no fallback install')});assert.throws(()=>absent.updateAvailable({action:'update',target:git}),/DSH_UPDATE_UNAVAILABLE/);
});
test('CL7 v7 starter display preserves the provider eleven identities, ranks and capability facts without sorting by a score',async()=>{
 const m=await loadClient();assert.equal(typeof m.NativeMarketDiscovery,'function');
 const rows=Array.from({length:11},(_,i)=>({...item,hanaId:'pick-'+i,displayName:'Tool '+i,featured:[{domainId:'office',rank:i+1}],score:{...item.score,displayTotal:6+i/10}}));
 const tree=m.NativeMarketDiscovery({domains:[{id:'office',name:'办公写作',count:11}],domain:'office',items:rows,onInspect(){},onDetails(){},onViewAll(){},onDomain(){}});
 const seen=[];function visit(n){if(Array.isArray(n))return n.forEach(visit);if(n&&typeof n==='object'){if(n.props['data-starter-record'])seen.push([n.props['data-starter-record'],n.props['data-rank']]);visit(n.children);}}visit(tree);
 assert.deepEqual(seen,rows.map((row,i)=>[row.hanaId,i+1]));assert.match(text(tree),/入门必装/);assert.match(text(tree),/整理资料/);assert.equal(rows[0].score.displayTotal,6);
});
test('CL7 v7 domain is the first tier and only server-provided subdivisions and counts form the second tier',async()=>{
 const m=await loadClient();assert.equal(typeof m.NativeMarketDomainFilters,'function');const calls=[];
 const tree=m.NativeMarketDomainFilters({domains:[{id:'code',name:'编程开发',count:12}],subdivisions:[{id:'testing',name:'测试验证',count:7}],domain:'code',subdivision:'testing',onDomain:id=>calls.push(['domain',id]),onSubdivision:id=>calls.push(['subdivision',id])});
 const tier=find(tree,n=>n.props['aria-label']==='领域筛选');assert(tier);assert(find(tier,n=>n.props['aria-pressed']===true&&text(n)==='编程开发'));
 const subs=find(tree,n=>n.props['aria-label']==='领域内分类');assert(subs);assert.match(text(subs),/测试验证 7/);assert.doesNotMatch(text(subs),/数据库|文档处理/);
 find(subs,n=>n.type==='button'&&text(n)==='测试验证 7').props.onClick();assert.deepEqual(calls,[['subdivision','testing']]);
});
test('CL7 shared phase, domain/subdivision facets and listed total remain exact optional provider facts',async()=>{
 const m=await loadClient(),facts={phase:'growth',total:19,domains:[{id:'code',name:'编程开发',count:19}],subdivisions:[{id:'testing',name:'测试验证',count:7}]};
 const insufficient={...item,hanaId:'unscored',score:{status:'insufficient',total:null}};
 const store=m.createNativeMarketListing({readPage:async()=>({items:[item,insufficient],page:1,totalPages:1,nativeBundles:[],...facts})});await store.load({});
 assert.deepEqual(store.snapshot().items,[item,insufficient]);
 for(const [key,value]of Object.entries(facts))assert.deepEqual(store.snapshot()[key],value,key);store.dispose();
});

test('CL7 detail never renders a score promotion for pending or insufficient facts',async()=>{
 const m=await loadClient();assert.equal(typeof m.NativeMarketDetailTrust,'function');
 for(const score of [undefined,{status:'insufficient',displayTotal:null,displayScale:10}])assert.equal(m.NativeMarketDetailTrust({item:{...item,score},onInspect(){}}),null);
 const scored=m.NativeMarketDetailTrust({item,onInspect(){}});assert.match(text(scored),/了解评分与可信依据/);
});

test('CL7 missing overview exposes an unscored state and author document rather than an empty facts table',async()=>{
 const m=await loadClient({React:{createElement:(type,props,...children)=>({type,props:props??{},children}),useState:value=>[typeof value==='function'?value():value,()=>{}]}});assert.equal(typeof m.NativeMarketOverview,'function');
 for(const[score,label]of[[undefined,'尚未评估'],[{status:'insufficient',displayTotal:null},'资料不足，暂不评分']]){
  const tree=m.NativeMarketOverview({item:{...item,overview:null,score},onInspect(){}});assert.match(text(tree),new RegExp(label));
  assert(find(tree,n=>n.type==='button'&&text(n)==='查看作者原文'));
 }
});

test('Market discovery keeps the interface language and tags fallback text with the language actually displayed',async()=>{
 const React={createElement:(type,props,...children)=>({type,props:props??{},children}),useState:value=>[value,()=>{}]};
 const m=await loadClient({React});
 m.apply({effect(){},slots:{},locale:{getSnapshot:()=>({active:'ko'}),bind:()=>key=>marketMessages.ko[key]}});
 const overview=m.NativeMarketOverview({item:{
  summary:{en:null,zh:'作者原文'},
  overview:{does:{byLocale:{'pt-BR':'Organiza documentos'}},facts:{audience:{value:{byLocale:{en:'Researchers'}}}}},
 }});
 assert.match(text(overview),/플러그인 개요/);
 const capability=find(overview,n=>n.type==='dd'&&text(n).includes('作者原文'));
 assert.equal(capability.props.lang,'zh');
 assert.equal(find(overview,n=>n.type==='dd'&&text(n)==='Researchers').props.lang,'en');
 const domains=m.NativeMarketDomainFilters({
  domains:[{id:'office',name:{byLocale:{zh:'办公写作'}}}],onDomain(){},
 });
 assert.equal(find(domains,n=>n.type==='span'&&text(n)==='办公写作').props.lang,'zh');
 assert(find(domains,n=>n.props['aria-label']==='분야로 필터링'));
});

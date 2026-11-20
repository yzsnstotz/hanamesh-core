import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadClient} from './fixtures/client-loader.mjs';
const fixture=async name=>JSON.parse(await readFile(new URL('./fixtures/discovery-027/'+name+'.json',import.meta.url),'utf8'));
const text=n=>n==null?'':Array.isArray(n)?n.map(text).join(' '):typeof n==='object'?text(n.children):String(n);
function find(n,p){if(!n)return;if(Array.isArray(n)){for(const child of n){const found=find(child,p);if(found)return found;}}else if(typeof n==='object'){if(p(n))return n;return find(n.children,p);}}
const client=()=>loadClient();
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};

test('AD27-01/02: score dialog uses only three provider display dimensions and nominal weights, preserving null',async()=>{
 const m=await client(),item=await fixture('detail');
 item.score.total=1;item.score.dimensions={quality:1,popularity:2,maintenance:3};
 assert.match(text(m.NativeMarketScore({item,detail:true})),/8\.6/);
 const dialog=m.FactDialog({selection:{kind:'score',item},onClose(){}}),content=text(dialog);
 assert.match(content,/10\.0\s*\/\s*10/);assert.match(content,/6\.0\s*\/\s*10/);
 for(const weight of ['30%','35%'])assert(content.includes(weight));
 assert.doesNotMatch(content,/安全性|社区|五维/);
 item.score.displayTotal=8;assert.match(text(m.NativeMarketScore({item})),/8\.0/);
 item.score.displayDimensions.quality=null;
 assert.match(text(m.FactDialog({selection:{kind:'score',item},onClose(){}})),/质量\s*缺失/);
 item.score.displayTotal=null;item.score.status='insufficient';
 assert.doesNotMatch(text(m.NativeMarketScore({item})),/0\.0/);
});

test('AD27-03/04/06: totals and insufficient counts use their own flags, never the window flag',async()=>{
 const m=await client(),page=await fixture('search');
 assert.equal(typeof m.NativeMarketDiscoveryCounts,'function');
 assert.match(text(m.NativeMarketDiscoveryCounts({page})),/1000\+/);
 page.capped=false;page.hiddenInsufficientCount=17;page.hiddenInsufficientCountCapped=true;
 const exact=text(m.NativeMarketDiscoveryCounts({page}));assert.match(exact,/1000(?!\+)/);assert.match(exact,/17\+/);
 page.capped=true;page.hiddenInsufficientCountCapped=false;
 const independent=text(m.NativeMarketDiscoveryCounts({page}));assert.match(independent,/1000\+/);assert.match(independent,/17(?!\+)/);
});

test('AD27-05: capped zero subdivision is a lower bound and remains selectable; exact zero is disabled',async()=>{
 const m=await client(),calls=[];
 const tree=m.NativeMarketDomainFilters({domain:'code',domains:[{id:'code',name:'编程开发',count:1000,capped:true}],subdivisions:[{id:'lower',name:'下界',count:0,capped:true},{id:'empty',name:'精确空',count:0,capped:false}],onDomain(){},onSubdivision:id=>calls.push(id)});
 const lower=find(tree,n=>n.type==='button'&&text(n).includes('下界'));assert(lower);assert.match(text(lower),/0\+/);assert.equal(Boolean(lower.props.disabled),false);lower.props.onClick();assert.deepEqual(calls,['lower']);
 assert.equal(find(tree,n=>n.type==='button'&&text(n).includes('精确空')).props.disabled,true);
});

test('AD27-07/09: cursor listing keeps all provider metadata and ordering, returns opaque next and resets after on a new query',async()=>{
 const m=await client(),page=await fixture('list'),calls=[],cursor='opaque +/%?日本語=';
 page.next=cursor;page.items=[page.items[1],page.items[0]];
 const second={...page,next:null,items:[{...page.items[0],hanaId:'last'}]};
 const store=m.createNativeMarketListing({pagination:'cursor',readPage:async(query)=>{calls.push(query);return calls.length===2?second:page;},listBundles:async()=>[]});
 await store.load({domain:'office',after:'stale'});
 assert.equal(store.snapshot().status,'ready');
 for(const key of ['next','total','capped','hiddenInsufficientCount','hiddenInsufficientCountCapped','projection','window','domains','subdivisions','phase'])assert.deepEqual(store.snapshot()[key],page[key],key);
 assert.deepEqual(store.snapshot().items,page.items);assert.equal(store.snapshot().hasMore,true);
 assert.equal('after' in calls[0],false);assert.equal('page' in calls[0],false);
 await store.more();assert.equal(calls[1].after,cursor);assert.equal(store.snapshot().hasMore,false);
 assert.deepEqual(store.snapshot().items.map(row=>row.hanaId),[...page.items.map(row=>row.hanaId),'last']);
 await store.load({domain:'code',after:cursor});assert.equal('after' in calls[2],false);assert.deepEqual(store.snapshot().items,page.items);store.dispose();
});

test('AD27-08/10/11: failed next retains coherent snapshot; explicit retry and stale response never trigger refresh or local reassessment',async()=>{
 const m=await client(),page=await fixture('list'),pending=deferred(),calls=[];page.next='next';
 const store=m.createNativeMarketListing({pagination:'cursor',listBundles:async()=>[],readPage:async(query,options)=>{calls.push({query,signal:options.signal});if(calls.length===2)throw Error('UPSTREAM_UNAVAILABLE');if(calls.length===4)return pending.promise;return page;}});
 await store.load({domain:'office'});const before=store.snapshot();await store.more();
 assert.equal(store.snapshot().status,'error');for(const key of ['items','projection','next','total','capped','window','domains','answered'])assert.deepEqual(store.snapshot()[key],before[key],key);
 assert.equal(calls.length,2);await store.retry();assert.equal(calls.length,3);assert.equal(calls[2].query.after,'next');
 const old=store.load({domain:'code'});await Promise.resolve();const current=store.load({domain:'office'});await current;
 pending.resolve({...page,projection:{...page.projection,watermark:'stale'},items:[]});await old;
 assert.equal(calls[3].signal.aborted,true);assert.deepEqual(store.snapshot().projection,page.projection);assert.equal(store.snapshot().items[0].score.assessedAt,page.items[0].score.assessedAt);assert.equal(calls.length,5);store.dispose();
});

test('AD27-12: explicit stage flag alone controls platform signals; public signals always remain',async()=>{
 const m=await client(),item={signals:{stars:123,npmDownloads:456,dshInstalls:789,activeUsers:321}};
 const hidden=text(m.NativeMarketSignals({item,phase:'growth',stageConfig:{phase:'growth',showPlatformData:false}}));
 assert.match(hidden,/123/);assert.match(hidden,/456/);assert.doesNotMatch(hidden,/789|321|dshInstalls|activeUsers/);
 const shown=text(m.NativeMarketSignals({item,phase:'early',stageConfig:{phase:'early',showPlatformData:true}}));assert.match(shown,/789/);assert.match(shown,/321/);
 assert.doesNotMatch(text(m.NativeMarketSignals({item,phase:'growth'})),/789|321/);
});

test('AD27-13/14: exact formal featured sets render provider identities/ranks with no fill, reasons or executable targets',async()=>{
 const m=await client(),featured=await fixture('featured');
 for(const [domain,rows] of Object.entries(featured.byDomain)){
  const items=Array.isArray(rows)?rows:rows.items;
  const tree=m.NativeMarketDiscovery({domains:[{id:domain,name:domain,count:items.length,capped:false}],domain,items:items.slice(0,4),onInspect(){},onDetails(){},onViewAll(){},onDomain(){}});
  const ids=[];function walk(n){if(Array.isArray(n))return n.forEach(walk);if(n&&typeof n==='object'){if(n.props['data-starter-record'])ids.push([n.props['data-starter-record'],n.props['data-rank']]);walk(n.children);}}walk(tree);
  assert.deepEqual(ids,items.slice(0,4).map(row=>[row.hanaId,row.featured.find(f=>f.domainId===domain).rank]));
  for(const row of items){assert.equal('reasons' in row,false);assert.deepEqual(row.installMethods,[]);}
 }
});

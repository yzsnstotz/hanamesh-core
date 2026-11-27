import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createMarketService,initialState} from '../src/service.js';
import {createMarketHandler} from '../src/routes.js';
import * as state from '../src/client-state.js';
import {loadClient,settle} from './fixtures/client-loader.mjs';
import {discoveryFixture as fixture} from './fixtures/discovery-031.mjs';
import {catalogPage} from './fixtures/catalog-u2.mjs';
const keys=['projection','domainIds','subdivisions','taxonomyVersion','overview','score','trustBadges','featured','similarGroup'];
const pick=item=>Object.fromEntries(keys.map(k=>[k,item[k]]));
const id='00000000-0000-4000-8000-000000000001';
async function serviceFixture(t){let saved=initialState();const calls=[],detail=await fixture('detail'),page=await fixture('list');
 const legacy={...detail,displayName:'Legacy identity',score:undefined,installMethods:[],oneClickInstall:{allowed:false},nativeInstallation:{status:'not-installed'}};
 const s=createMarketService({config:{websiteOrigin:'https://legacy.example',serverOrigin:'https://host.example'},domain:{global:{get:async()=>saved,set:async v=>saved=v}},manager:()=>({listBundles:async()=>[]}),anchor:new URL('../package.json',import.meta.url),fetchImpl:async(url,init)=>{const u=new URL(url);calls.push({url:u,init});
  if(u.pathname==='/hm/v1/host/catalog/query')return Response.json(catalogPage([{...legacy,discovery:pick(detail)}],{
   pageNumber:Number(u.searchParams.get('page')??1),total:101,searchMode:u.searchParams.get('searchMode'),
   facets:{sources:[{id:'awesome',count:900}]},
  }));
  if(u.pathname.endsWith('/domains'))return Response.json(await fixture('domain-directory'));
  if(u.pathname.endsWith('/stage-config'))return Response.json((await fixture('stage-config')).early);
  if(u.pathname.endsWith('/featured'))return Response.json({...page,items:[Object.fromEntries(Object.entries(detail).filter(([key])=>key!=='reasons'))]});
  if(u.pathname.endsWith('/list-fields'))return Response.json({items:[{hanaId:detail.hanaId,...pick(detail)}]});
  if(u.pathname.includes('/hanas/'))return Response.json({...detail,displayName:'Cannot replace legacy identity'});
  assert.fail('unexpected upstream '+u.href);
 }});await s.init();t.after(()=>s.close());return{s,calls,detail,legacy};}
test('NS27-01 only five non-search discovery reads are admitted; list and search use one catalog read and preserve provider identity and selectors',async t=>{
 const {s,calls}=await serviceFixture(t);assert.equal(typeof s.discovery,'function');
 const old=await s.list({q:'notes',category:'tools',source:'awesome',channel:'dsh',page:2});assert.equal(old.page,2);assert.equal(old.totalPages,3);assert.equal(old.facets.sources[0].count,900);
 assert.equal(calls.length,1);assert.equal(calls[0].url.hostname,'legacy.example');assert.equal(calls[0].url.searchParams.get('categories'),'tools');
 const semantic=await s.search({query:'original query'});
 assert.equal(semantic.searchId,null);assert.deepEqual(semantic.items.map(i=>[i.hanaId,i.matchKind]),[[id,'meaning']]);assert.equal(calls.length,2);
 assert.equal(calls[1].url.pathname,calls[0].url.pathname);assert.equal(calls[1].init.method,'GET');assert.equal(calls[1].init.body,undefined);
 assert.equal(calls[1].url.searchParams.get('searchMode'),'hybrid');assert.equal(calls[1].url.searchParams.get('q'),'original query');
 assert.equal((await s.discovery('domains',{})).domains.length,10);assert.equal((await s.discovery('stage',{})).showPlatformData,false);
 const featured=await s.discovery('featured',{domain:'office'});assert.equal(featured.items[0].hanaId,id);assert.equal(featured.items[0].nativeInstallation.status,'not-installed');
 assert.equal((await s.discovery('detail',{hanaId:id})).hanaId,id);assert.deepEqual((await s.discovery('fields',{hanaIds:[id]})).items.map(i=>i.hanaId),[id]);
 await assert.rejects(s.discovery('fields',{hanaIds:['00000000-0000-4000-8000-000000000099']}),/DISCOVERY_RESPONSE_INVALID/);
 const count=calls.length;for(const kind of ['items','selected','search'])await assert.rejects(s.discovery(kind,{}),/DISCOVERY_READ_UNAVAILABLE/);
 await assert.rejects(s.discovery('domains',{search:'x'}),/INVALID_QUERY/);assert.equal(calls.length,count);assert(!calls.some(c=>/\/(items|selected)$/.test(c.url.pathname)));
});
test('NS27-02 every new adapter uses existing auth/iframe/CSRF/method guards and paused result paths stay absent',async t=>{
 const calls=[],server=createServer(createMarketHandler({connection:{requestRejection:req=>req.headers.authorization==='Bearer fixture'?undefined:{}},service:{discovery:async(kind,input)=>{calls.push([kind,input]);return{ok:true};}}}));await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const root='http://127.0.0.1:'+server.address().port+'/hanamesh/market/discovery/',headers={authorization:'Bearer fixture'};
 for(const [path,kind]of [['domains','domains'],['stage-config','stage'],['featured?domain=office','featured'],['detail?hanaId='+id,'detail']]){
  assert.equal((await fetch(root+path)).status,403);assert.equal((await fetch(root+path,{headers:{...headers,'sec-fetch-dest':'iframe'}})).status,403);
  assert.equal((await fetch(root+path,{headers})).status,200,path);assert.equal(calls.at(-1)[0],kind);
  assert.equal((await fetch(root+path.split('?')[0],{method:'POST',headers:{...headers,'x-hanamesh-client':'market-v1','content-type':'application/json'},body:'{}'})).status,405);
 }
 const post={method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({hanaIds:[id]})};assert.equal((await fetch(root+'list-fields',post)).status,403);
 assert.equal((await fetch(root+'list-fields',{...post,headers:{...post.headers,'x-hanamesh-client':'market-v1'}})).status,200);assert.deepEqual(calls.at(-1),['fields',{hanaIds:[id]}]);
 assert.equal((await fetch(root+'list-fields',{headers})).status,405);assert.equal((await fetch(root+'featured?domain=office&domain=code',{headers})).status,400);
 for(const path of ['items','selected','search'])assert.equal((await fetch(root+path,{headers})).status,404);
 assert.equal(calls.length,5);
});
test('NS27-03 discovery decoration is same-ID allowlist only, never replacing base identity/install/native/search facts',()=>{
 assert.equal(typeof state.withDiscoveryFields,'function');const base={hanaId:id,displayName:'Original',installMethods:['real target'],nativeInstallation:{status:'installed'},nativeUpdate:{action:'openPackage'},requestId:'original',rank:9};
 const result=state.withDiscoveryFields(base,{hanaId:id,overview:{does:'source'},score:{displayTotal:8},displayName:'Forged',nativeInstallation:{status:'not-installed'},installMethods:[],requestId:'changed',rank:1,reasons:['detail only']});
 for(const key of ['hanaId','displayName','installMethods','nativeInstallation','nativeUpdate','requestId','rank'])assert.deepEqual(result[key],base[key],key);
 assert.equal(result.score.displayTotal,8);assert.equal(result.reasons,undefined);assert.equal(state.withDiscoveryFields(base,{hanaId:'other',score:1}),base);
 assert.deepEqual(state.withDiscoveryFields(base,{hanaId:id,reasons:['detail only']},true).reasons,['detail only']);
});
test('NS27-04 independent reads retain same-context facts on failure, retry only that read, reject stale replies and reset on source change',async()=>{
 assert.equal(typeof state.createMarketDiscoveryState,'function');const calls=[],pending=[];let fail=false;
 const d=state.createMarketDiscoveryState({read:async(kind,input,{signal})=>{calls.push({kind,input,signal});if(fail)throw Error('DISCOVERY_UNAVAILABLE');if(kind==='featured')return new Promise(resolve=>pending.push({input,resolve}));return kind==='fields'?{items:input.hanaIds.map(hanaId=>({hanaId,overview:{does:'fact'}}))}:{phase:'early',showPlatformData:false};}});
 const a=d.featured('office'),b=d.featured('code');await settle();pending[1].resolve({items:[{hanaId:'code'}]});await b;pending[0].resolve({items:[{hanaId:'office'}]});await a;assert.equal(d.snapshot().featured.items[0].hanaId,'code');assert(calls[0].signal.aborted);
 await d.fields([id]);assert.equal(d.snapshot().fields[id].overview.does,'fact');fail=true;await d.fields([id]);assert.equal(d.snapshot().fields[id].overview.does,'fact');assert.match(d.snapshot().errors.fields,/DISCOVERY_UNAVAILABLE/);
 fail=false;await d.retry('fields');assert.equal(calls.at(-1).kind,'fields');assert.equal(d.snapshot().errors.fields,undefined);
 const late=d.featured('office');await settle();d.reset();pending.at(-1).resolve({items:[{hanaId:'late'}]});await late;assert.equal(d.snapshot().featured,null);assert.deepEqual(d.snapshot().fields,{});d.dispose();assert(!calls.some(c=>['items','selected','search'].includes(c.kind)));
});
test('NS27-05 ID decoration covers bounded accepted batches without scanning, selecting, ranking or losing missing-ID old cards',async()=>{
 assert.equal(typeof state.createMarketDiscoveryState,'function');const calls=[],d=state.createMarketDiscoveryState({read:async(kind,input)=>{calls.push([kind,input]);return {items:input.hanaIds.map(hanaId=>({hanaId,score:{displayTotal:7}}))};}});
 const ids=Array.from({length:205},(_,n)=>'00000000-0000-4000-8000-'+String(n+1).padStart(12,'0'));await Promise.all([d.fields(ids.slice(0,201)),d.fields(ids.slice(201))]);
 assert.equal(Object.keys(d.snapshot().fields).length,205);assert(calls.every(([kind,input])=>kind==='fields'&&input.hanaIds.length<=200));assert.deepEqual(calls.flatMap(([,input])=>input.hanaIds),ids);
 const prior=calls.length;await d.fields(['not-a-canonical-uuid']);assert.equal(calls.length,prior);assert.equal(state.withDiscoveryFields({hanaId:'not-a-canonical-uuid'},undefined).hanaId,'not-a-canonical-uuid');d.dispose();
});
const text=n=>n==null?'':Array.isArray(n)?n.map(text).join(' '):typeof n==='object'?text(n.children):String(n);
function find(n,p){if(Array.isArray(n)){for(const c of n){const v=find(c,p);if(v)return v;}}else if(n&&typeof n==='object'){if(p(n))return n;return find(n.children,p);}}
function hooks(){const v=[],effects=[],cleanups=[],setups=[];let cursor=0;return {React:{Fragment:Symbol.for('fragment'),createElement:(type,props,...children)=>({type,props:props??{},children}),useState(value){const i=cursor++;if(!(i in v))v[i]=typeof value==='function'?value():value;return [v[i],next=>v[i]=typeof next==='function'?next(v[i]):next];},useRef(value){const i=cursor++;return v[i]??(v[i]={current:value});},useEffect(fn,deps){const i=cursor++,old=v[i];if(!old||!deps||deps.some((x,n)=>!Object.is(x,old[n]))){v[i]=deps;setups[i]=fn;effects.push(()=>{cleanups[i]?.();cleanups[i]=fn();});}}},render(Component){cursor=0;const tree=Component({});while(effects.length)effects.shift()();return tree;},replay(){for(const fn of cleanups)fn?.();setups.forEach((fn,i)=>{if(fn)cleanups[i]=fn();});},close(){for(const fn of cleanups)fn?.();}};}
test('NS27-06 actual MarketPage wires home/detail/stage and keeps list fields in the unified page',async t=>{
 const ui=hooks(),calls=[],detail=await fixture('detail'),directory=await fixture('domain-directory'),featured=(await fixture('featured')).byDomain.office;let failPage=false;
 const base={...detail,displayName:'Original title',installMethods:[],oneClickInstall:{allowed:false},overview:undefined,score:undefined,trustBadges:[],nativeInstallation:{status:'not-installed'}};
 const scope={fetch:async(url,init)=>{const u=new URL(url,'http://127.0.0.1');calls.push({path:u.pathname,query:u.search,body:init.body});let value;
  if(u.pathname.endsWith('/settings'))value={settings:{websiteOrigin:'https://legacy.example',serverOrigin:'https://host.example'}};
  else if(u.pathname.endsWith('/suite'))value={status:'unknown'};
  else if(u.pathname.endsWith('/catalog')){
   if(failPage)return Response.json({error:{code:'INDEXER_CATALOG_CHANGED'}},{status:503});
   const next=u.searchParams.has('after');
   value={items:[{...base,discovery:{hanaId:base.hanaId,...pick(detail)}}],page:next?2:1,totalPages:2,nextCursor:next?null:'test_cursor',
    paginationReset:false,nativeBundles:[],facets:{sources:[{id:'awesome',count:900}]}};
  }
  else if(u.pathname.endsWith('/item'))value=base;
  else if(u.pathname.endsWith('/discovery/domains'))value=directory;
  else if(u.pathname.endsWith('/discovery/featured'))value=featured;
  else if(u.pathname.endsWith('/discovery/stage-config'))value={phase:'growth',showPlatformData:false};
  else if(u.pathname.endsWith('/discovery/detail'))value={...detail,displayName:'Not authoritative'};
  else assert.fail('unexpected adapter '+u.pathname);return Response.json(value);
 }};const m=await loadClient({React:ui.React,scope});const Frame=()=>{},Card=()=>{},Results=()=>{},Discovery=()=>{};const Page=m.createMarketPage({Frame,Card,Results,Discovery});t.after(()=>ui.close());
 let tree=ui.render(Page);for(let n=0;n<8;n++){await settle();tree=ui.render(Page);}let frame=find(tree,n=>n.type===Frame),home=find(frame.props.body,n=>n.type===Discovery);assert.equal(home.props.domains.length,10);assert.equal(home.props.items.length,featured.items.length);assert.equal(home.props.onViewAll,undefined,'DM1 hold must leave result navigation inactive');
 home.props.onDomain('code');await settle();tree=ui.render(Page);assert(calls.some(c=>c.path.endsWith('/discovery/featured')&&c.query==='?domain=code'));
 frame=find(tree,n=>n.type===Frame);frame.props.onNavigate('search');tree=ui.render(Page);frame=find(tree,n=>n.type===Frame);const form=find(frame.props.body,n=>n.type==='form');form.props.onSubmit({preventDefault(){}});
 for(let n=0;n<8;n++){await settle();tree=ui.render(Page);}frame=find(tree,n=>n.type===Frame);let results=find(frame.props.body,n=>n.type===Results);assert.equal(results.props.snapshot.page,1);assert.equal(results.props.snapshot.facets.sources[0].count,900);let card=results.props.card(results.props.snapshot.items[0]);assert.equal(card.props.item.displayName,'Original title');assert.equal(card.props.item.score.displayTotal,detail.score.displayTotal);assert.equal(card.props.item.nativeInstallation.status,'not-installed');
 const oldCalls=calls.filter(c=>c.path.endsWith('/catalog')).length;
 failPage=true;results.props.onMore();for(let n=0;n<8;n++){await settle();tree=ui.render(Page);}
 frame=find(tree,n=>n.type===Frame);results=find(frame.props.body,n=>n.type===Results);
 assert.equal(results.props.snapshot.page,1);assert.equal(results.props.snapshot.items.length,1);
 assert.equal(results.props.snapshot.error,'INDEXER_CATALOG_CHANGED');
 assert.equal(calls.filter(c=>c.path.endsWith('/catalog')).length,oldCalls+1);
 assert.equal(new URLSearchParams(calls.at(-1).query).get('after'),'test_cursor');
 const beforeRetry=calls.length;failPage=false;results.props.onRetry();for(let n=0;n<8;n++){await settle();tree=ui.render(Page);}
 assert.equal(calls.length,beforeRetry+1);assert(calls.at(-1).path.endsWith('/catalog'));
 frame=find(tree,n=>n.type===Frame);results=find(frame.props.body,n=>n.type===Results);
 assert.equal(results.props.snapshot.page,2);assert.equal(results.props.snapshot.items.length,1);
 assert(!calls.some(c=>c.path.endsWith('/discovery/list-fields')));
 frame=find(tree,n=>n.type===Frame);results=find(frame.props.body,n=>n.type===Results);card=results.props.card(results.props.snapshot.items[0]);await card.props.onDetails();for(let n=0;n<8;n++){await settle();tree=ui.render(Page);}frame=find(tree,n=>n.type===Frame);const detailCard=find(frame.props.body,n=>n.type===Card);assert.equal(detailCard.props.item.displayName,'Original title');assert.equal(detailCard.props.item.score.displayTotal,detail.score.displayTotal);assert.deepEqual(detailCard.props.item.reasons,detail.reasons);const signals=find(detailCard.children,n=>n.type===m.NativeMarketSignals);assert.equal(signals.props.stageConfig.showPlatformData,false);
 assert(!calls.some(c=>/\/(items|selected)$/.test(c.path)));assert(!calls.some(c=>c.path.endsWith('/search')));assert.equal(calls.filter(c=>c.path.endsWith('/discovery/domains')).length,1);
});

test('NS27-07 non-search reads survive effect cleanup and setup replay without reusing a permanently closed controller',async t=>{
 const ui=hooks(),calls=[],directory=await fixture('domain-directory'),featured=(await fixture('featured')).byDomain.office;
 const scope={fetch:async(url,init)=>{const path=new URL(url,'http://127.0.0.1').pathname;calls.push({path,signal:init.signal});if(path.endsWith('/discovery/domains'))return Response.json(directory);if(path.endsWith('/discovery/featured'))return Response.json(featured);if(path.endsWith('/discovery/stage-config'))return Response.json({phase:'growth',showPlatformData:false});if(path.endsWith('/settings'))return Response.json({settings:{}});if(path.endsWith('/suite'))return Response.json({status:'unknown'});assert.fail('unexpected read '+path);}};
 const m=await loadClient({React:ui.React,scope}),Frame=()=>{},Discovery=()=>{},Page=m.createMarketPage({Frame,Discovery});t.after(()=>ui.close());let tree=ui.render(Page);ui.replay();for(let n=0;n<8;n++){await settle();tree=ui.render(Page);}const frame=find(tree,n=>n.type===Frame),home=find(frame.props.body,n=>n.type===Discovery);
 assert.equal(calls.filter(c=>c.path.endsWith('/discovery/domains')).length,2,'new effect setup must restart domains');assert.equal(home.props.domains.length,10);assert.equal(home.props.items.length,featured.items.length);assert.equal(home.props.onViewAll,undefined);assert(!calls.some(c=>/\/(items|selected)$/.test(c.path)));
});

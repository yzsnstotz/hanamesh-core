import test from 'node:test';
import assert from 'node:assert/strict';
import {createMarketDiscoveryState,createNativeMarketListing} from '../src/client-state.js';
import {loadClient,settle} from './fixtures/client-loader.mjs';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const text=n=>n==null?'':Array.isArray(n)?n.map(text).join(' '):typeof n==='object'?text(n.children):String(n);
function find(n,p){if(Array.isArray(n)){for(const c of n){const v=find(c,p);if(v)return v;}}else if(n&&typeof n==='object'){if(p(n))return n;return find(n.children,p);}}
function hooks(){const values=[],effects=[],cleanups=[];let cursor=0;return {React:{Fragment:Symbol.for('fragment'),createElement:(type,props,...children)=>({type,props:props??{},children}),useState(value){const i=cursor++;if(!(i in values))values[i]=typeof value==='function'?value():value;return[values[i],next=>values[i]=typeof next==='function'?next(values[i]):next];},useRef(value){const i=cursor++;return values[i]??(values[i]={current:value});},useEffect(fn,deps){const i=cursor++,old=values[i];if(!old||!deps||deps.some((x,n)=>!Object.is(x,old[n]))){values[i]=deps;effects.push(()=>{cleanups[i]?.();cleanups[i]=fn();});}}},render(Component){cursor=0;const tree=Component({});while(effects.length)effects.shift()();return tree;},close(){for(const fn of cleanups)fn?.();}};}

test('R462-F01 all failed accepted batches recover, partial recovery retains the error and retries only remaining IDs',async t=>{
 const ids=Array.from({length:250},(_,i)=>id(i+1)),requests=[];let mode='offline',catalogReads=0;
 const listing=createNativeMarketListing({readPage:async({page})=>{catalogReads++;return{items:ids.slice((page-1)*50,page*50).map(hanaId=>({hanaId,displayName:hanaId})),page,totalPages:5,nativeBundles:[],facets:{sources:[{id:'original',count:250}]}};}});
 const d=createMarketDiscoveryState({read:async(kind,{hanaIds})=>{assert.equal(kind,'fields');requests.push([...hanaIds]);if(mode==='offline'||mode==='partial'&&hanaIds.includes(id(201)))throw Error('FIELDS_OFFLINE');return{items:hanaIds.map(hanaId=>({hanaId,score:{displayTotal:8.6}}))};}});t.after(()=>{listing.dispose();d.dispose();});
 await listing.load({q:'original'});await d.fields(listing.snapshot().acceptedBatch.map(row=>row.hanaId));for(let page=2;page<=5;page++){await listing.more();await d.fields(listing.snapshot().acceptedBatch.map(row=>row.hanaId));}
 const legacy=structuredClone(listing.snapshot());assert.match(d.snapshot().errors.fields,/FIELDS_OFFLINE/);assert.equal(Object.keys(d.snapshot().fields).length,0);
 mode='partial';await d.retry('fields');assert.equal(Object.keys(d.snapshot().fields).length,200);assert.match(d.snapshot().errors.fields,/FIELDS_OFFLINE/,'unrecovered IDs must retain explicit retry');
 const before=requests.length;mode='online';await d.retry('fields');assert.deepEqual(requests.slice(before),[ids.slice(200)]);assert.deepEqual(Object.keys(d.snapshot().fields),ids);assert.equal(d.snapshot().errors.fields,undefined);
 assert(requests.every(ids=>ids.length<=200));assert.deepEqual(requests.slice(0,2),[ids.slice(0,50),ids.slice(50,100)]);assert.equal(catalogReads,5,'discovery retry must not replay old catalog/search');assert.deepEqual(listing.snapshot(),legacy,'members/order/page/facets/native facts remain unchanged');
});

async function favoriteHarness(t,storage={}){
 const ui=hooks(),calls=[],base={hanaId:id(1),displayName:'Original identity',summary:{en:'Base summary'},installMethods:[{channel:'dsh',kind:'npm',target:{source:'npm',name:'fixture',version:'1.0.0'}}],nativeInstallation:{status:'installed',installedVersion:'1.0.0'}};let newSource=false,emptyLegacy=false;
 const extension={hanaId:id(1),score:{status:'scored',displayTotal:8.6},overview:{does:'OLD_SOURCE_FACT'},trustBadges:[{kind:'old-source'}],featured:[{domainId:'office',rank:1}],reasons:[{text:'old-source detail'}]};
 const scope={localStorage:{getItem:key=>storage[key]??null,setItem:(key,value)=>storage[key]=value},fetch:async(url,init)=>{const path=new URL(url,'http://127.0.0.1').pathname;calls.push(path);let value;
  if(path.endsWith('/settings'))value={settings:{websiteOrigin:'https://old.example',serverOrigin:'https://old-host.example'}};
  else if(path.endsWith('/suite'))value={status:'unknown'};
  else if(path.endsWith('/catalog'))value={items:emptyLegacy?[]:[base],page:1,totalPages:1,nativeBundles:[],facets:{}};
  else if(path.endsWith('/item')){if(newSource)return Response.json({error:{code:'NEW_SOURCE_OFFLINE'}},{status:503});value=base;}
  else if(path.endsWith('/discovery/domains'))value={domains:[]};
  else if(path.endsWith('/discovery/featured'))value={items:[]};
  else if(path.endsWith('/discovery/stage-config'))value={phase:'growth',showPlatformData:false};
  else if(path.endsWith('/discovery/detail'))value=extension;
  else if(path.endsWith('/discovery/list-fields')){if(newSource)return Response.json({error:{code:'NEW_SOURCE_OFFLINE'}},{status:503});value={items:JSON.parse(init.body).hanaIds.map(hanaId=>({...extension,hanaId}))};}
  else assert.fail(path);return Response.json(value);
 }};
 const m=await loadClient({React:ui.React,scope}),Frame=()=>{},Card=()=>{},Results=()=>{},Page=m.createMarketPage({Frame,Card,Results});let tree=ui.render(Page);t.after(()=>ui.close());
 const render=async()=>{for(let i=0;i<8;i++){await settle();tree=ui.render(Page);}return find(tree,n=>n.type===Frame);};
 const changeSource=async()=>{let frame=await render();frame.props.onNavigate('settings');frame=await render();newSource=true;find(frame.props.body,n=>n.type===m.MarketSettings).props.onChanged({websiteOrigin:'https://new.example',serverOrigin:'https://new-host.example'});return render();};
 return{base,extension,calls,storage,render,Card,Results,changeSource,empty:()=>{emptyLegacy=true;},offline:()=>{newSource=true;}};
}

test('R462-F02 decorated detail favorite keeps base identity and loses previous-source facts after changing source',async t=>{
 const h=await favoriteHarness(t);let frame=await h.render();frame.props.onNavigate('search');frame=await h.render();find(frame.props.body,n=>n.type==='form').props.onSubmit({preventDefault(){}});frame=await h.render();let results=find(frame.props.body,n=>n.type===h.Results);await results.props.card(results.props.snapshot.items[0]).props.onDetails();frame=await h.render();const detail=find(frame.props.body,n=>n.type===h.Card);assert.equal(detail.props.item.score.displayTotal,8.6);find(detail.children,n=>n.type==='button'&&text(n)==='收藏').props.onClick();frame=await h.render();
 const saved=JSON.parse(h.storage['hanamesh.market.favorites'])[id(1)];find(frame.props.body,n=>n.type==='button'&&text(n)==='返回市场').props.onClick();frame=await h.render();frame.props.onNavigate('search');frame=await h.render();h.empty();find(frame.props.body,n=>n.type==='form').props.onSubmit({preventDefault(){}});frame=await h.render();assert.equal(find(frame.props.body,n=>n.type===h.Results).props.snapshot.items.length,0);
 frame=await h.changeSource();frame.props.onNavigate('favorites');frame=await h.render();let card=find(frame.props.body,n=>n.type===h.Card);assert(card);assert.equal(card.props.item.score,undefined);assert.equal(card.props.item.overview,undefined);assert.equal(card.props.item.reasons,undefined);assert.equal(card.props.item.displayName,h.base.displayName);assert.deepEqual(card.props.item.installMethods,h.base.installMethods);assert.equal(card.props.item.nativeInstallation.status,'unknown','out-of-list favorites preserve the existing conservative native policy');assert(find(frame.props.messages,n=>n.props?.error?.message==='NEW_SOURCE_OFFLINE'));
 for(const key of ['score','overview','trustBadges','featured','reasons'])assert.equal(saved[key],undefined,'temporary extension persisted: '+key);assert.deepEqual(saved.nativeInstallation,h.base.nativeInstallation);
 await card.props.onDetails();frame=await h.render();card=find(frame.props.body,n=>n.type===h.Card);assert.equal(card.props.item.score,undefined,'failed current-source detail must not reinstate old decoration');assert.equal(card.props.item.displayName,h.base.displayName);assert(!h.calls.some(path=>/\/discovery\/(items|selected)$/.test(path)));
});

test('R462-F02 restart and backup import discard persisted discovery facts while retaining favorite membership and native target',async t=>{
 const stale={hanaId:id(1),displayName:'Saved identity',installMethods:[{target:{source:'npm',name:'fixture',version:'1.0.0'}}],nativeInstallation:{status:'installed'},score:{displayTotal:8.6},overview:{does:'OLD_SOURCE_FACT'},trustBadges:[{kind:'old'}],featured:[{rank:1}],reasons:['old']};
 for(const mode of ['restart','import']){
  const storage=mode==='restart'?{'hanamesh.market.favorites':JSON.stringify({[id(1)]:stale})}:{};const h=await favoriteHarness(t,storage);h.empty();h.offline();let frame=await h.render();
  if(mode==='import'){frame.props.onNavigate('settings');frame=await h.render();await find(frame.props.body,n=>n.type==='input'&&n.props.type==='file').props.onChange({target:{files:[{size:500,text:async()=>JSON.stringify({schema:1,favorites:{[id(1)]:stale}})}]}});frame=await h.render();}
  frame.props.onNavigate('favorites');frame=await h.render();const card=find(frame.props.body,n=>n.type===h.Card);assert(card,mode+' keeps member');assert.equal(card.props.item.score,undefined,mode+' must drop old score');assert.equal(card.props.item.overview,undefined);assert.equal(card.props.item.trustBadges,undefined);assert.equal(card.props.item.reasons,undefined);assert.equal(card.props.item.displayName,stale.displayName);assert.deepEqual(card.props.item.installMethods,stale.installMethods);assert(find(frame.props.messages,n=>n.props?.error?.message==='NEW_SOURCE_OFFLINE'));
 }
});

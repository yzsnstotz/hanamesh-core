import assert from 'node:assert/strict';
import test from 'node:test';
import {loadClient,settle} from '../tests/fixtures/client-loader.mjs';

function hooks(){
 const values=[],effects=[],cleanups=[];
 let cursor=0,mounted=true,writesAfterUnmount=0;
 return {
  React:{Fragment:Symbol(),createElement:(type,props,...children)=>({type,props:props??{},children}),
   useState(initial){const i=cursor++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;
    return [values[i],next=>{if(!mounted)writesAfterUnmount++;values[i]=typeof next==='function'?next(values[i]):next;}];},
   useRef(value){const i=cursor++;return values[i]??(values[i]={current:value});},
   useEffect(fn,deps){const i=cursor++;const previous=values[i];if(!previous||!deps||deps.some((d,n)=>!Object.is(d,previous[n]))){values[i]=deps;effects.push(()=>{cleanups[i]?.();cleanups[i]=fn();});}},
  },
  render(Page,owner){assert.ok(mounted);cursor=0;const tree=Page(owner);while(effects.length)effects.shift()();return tree;},
  unmount(){mounted=false;for(const stop of cleanups.splice(0))stop?.();},
  writesAfterUnmount:()=>writesAfterUnmount,
 };
}
function find(node,predicate){
 if(Array.isArray(node)){for(const child of node){const hit=find(child,predicate);if(hit)return hit;}}
 else if(node&&typeof node==='object'){if(predicate(node))return node;return find(node.children,predicate);}
}

async function fixture(t){
 const ui=hooks(),slots=new Map(),effects=[],listeners=new Set(),reads=[];
 const a={hanaId:'item-a',displayName:'A: featured',similarGroup:{members:['item-b'],sources:[]}};
 const scope={fetch(raw,init){
  const url=new URL(raw,'https://fixture.invalid'),path=url.pathname.split('/').at(-1);
  if(path==='item'){
   const {promise,resolve,reject}=Promise.withResolvers();
   // Deliberately ignore abort: exercise a transport that delivers a late
   // success or error even after the caller's signal changes to aborted.
   reads.push({id:url.searchParams.get('itemId'),signal:init?.signal,ok(item){resolve(Response.json(item));},fail(message){reject(new Error(message));}});
   return promise;
  }
  const value={settings:{settings:{}},suite:{status:'unknown'},domains:{domains:[]},featured:{items:[a]},'stage-config':{phase:'early'},detail:{hanaId:url.searchParams.get('hanaId')}}[path];
  assert.ok(value,`unexpected request ${url.pathname}`);return Promise.resolve(Response.json(value));
 }};
 const market=await loadClient({React:ui.React,scope});
 const ctx={slots:{inject(_slot,run){return run();},register(options,Page){slots.set(options.name,Page);return()=>slots.delete(options.name);}},
  layout:{selectPanel(){}},effect(run){const stop=run();if(stop)effects.push(stop);},inject(_keys,run){const stop=run(ctx);if(stop)effects.push(stop);},
  remoteAccess:{whenAccess(key,run){assert.equal(key,'pluginManager/listBundles');const stops=[...run()];return()=>{for(const stop of stops.reverse())stop();};}},
  remote:{$on(event,listener){assert.equal(event,'plugin-manager/changed');listeners.add(listener);return()=>listeners.delete(listener);}},
 };
 t.after(()=>{ui.unmount();for(const stop of effects.reverse())stop();});
 market.apply(ctx);
 const Page=slots.get('plugins.tab'),owner={install(){assert.fail('detail refresh must not install');}};
 const frame=()=>find(ui.render(Page,owner),node=>node.type===market.NativeMarketFrame);
 const title=()=>{const view=find(frame().props.body,node=>node.props?.className==='hm-m-detail');return find(view,node=>node.type==='h2')?.children[0];};
 const error=()=>{const notice=frame().props.messages.children[0];return find(notice.type(notice.props),node=>node.type==='p')?.children[0];};
 const takeRead=id=>{assert.equal(reads.length,1,`expected exactly one read for ${id}`);const read=reads.shift();assert.equal(read.id,id);return read;};
 function notify(){assert.equal(listeners.size,1);for(const listener of listeners)listener({reason:'install'});return takeRead(a.hanaId);}
 frame();await settle();
 const featured=find(frame().props.body,node=>node.type===market.NativeMarketDiscovery);
 featured.props.onDetails(featured.props.items[0]);takeRead(a.hanaId).ok({...a,displayName:'A: initial detail'});await settle();
 assert.equal(title(),'A: initial detail');
 return {a,notify,frame,title,error,takeRead,unmount:ui.unmount,writesAfterUnmount:ui.writesAfterUnmount,listeners};
}

test('ordinary detail read must not reopen after internal navigation',async t=>{
 const ui=await fixture(t);
 find(ui.frame().props.body,node=>node.type==='button'&&node.props.className==='textbtn').props.onClick();
 const featured=find(ui.frame().props.body,node=>node.props?.onDetails&&Array.isArray(node.props.items));
 featured.props.onDetails(featured.props.items[0]);const pending=ui.takeRead(ui.a.hanaId);
 ui.frame().props.onNavigate('packs');assert.equal(ui.title(),undefined);
 pending.ok({...ui.a,displayName:'A: stale navigation detail'});await settle();
 assert.equal(ui.title(),undefined,'late ordinary read must not reopen after internal navigation');
});

for(const transition of ['another item','newer install notification','back','internal tab','unmount']){
 for(const late of ['success','error']){
  test(`stale install detail ${late} after ${transition}`,async t=>{
   const ui=await fixture(t),old=ui.notify();
   assert.ok(old.signal instanceof AbortSignal);assert.equal(old.signal.aborted,false);
   let expectedTitle,expectedError;
   if(transition==='another item'){
    const member=find(ui.frame().props.body,node=>node.type==='button'&&node.children[0]==='item-b');
    assert.ok(member,'open B through the real detail link');member.props.onClick();
    ui.takeRead('item-b').ok({hanaId:'item-b',displayName:'B: latest detail'});expectedTitle='B: latest detail';
   }else if(transition==='newer install notification'){
    const current=ui.notify();
    if(late==='success'){
     current.ok({...ui.a,displayName:'A: latest install detail'});expectedTitle='A: latest install detail';
    }else{
     current.fail('current detail error');expectedError='current detail error';expectedTitle='A: initial detail';
    }
   }else if(transition==='back'){
    find(ui.frame().props.body,node=>node.type==='button'&&node.props.className==='textbtn').props.onClick();
   }else if(transition==='internal tab'){
    ui.frame().props.onNavigate('packs');assert.equal(ui.frame().props.activeTab,'packs');
   }else{
    ui.unmount();assert.equal(ui.listeners.size,0);
   }
   assert.equal(old.signal.aborted,true,'superseded notification read must receive abort');
   await settle();
   if(transition!=='unmount'){
    assert.equal(ui.title(),expectedTitle,'current detail before delayed delivery');
    assert.equal(ui.error(),expectedError,'current error before delayed delivery');
   }
   if(late==='success')old.ok({...ui.a,displayName:'A: stale install detail'});
   else old.fail('stale detail error');
   await settle();
   if(transition==='unmount')assert.equal(ui.writesAfterUnmount(),0,'late response must not write after unmount');
   else {
    assert.equal(ui.title(),expectedTitle,'late response must not overwrite or reopen detail');
    assert.equal(ui.error(),expectedError,'late response must not overwrite the current error');
   }
  });
 }
}

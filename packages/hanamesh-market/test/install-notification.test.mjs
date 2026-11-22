import test from 'node:test';
import assert from 'node:assert/strict';
import {loadClient,settle} from '../tests/fixtures/client-loader.mjs';

function hooks(){
 const state=[],effects=[],cleanup=[];let cursor=0;
 return {React:{Fragment:Symbol(),createElement:(type,props,...children)=>({type,props:props??{},children}),
  useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v;}];},
  useRef(initial){const i=cursor++;return state[i]??(state[i]={current:initial});},
  useEffect(fn,deps){const i=cursor++;if(!state[i]||!deps||deps.some((v,n)=>!Object.is(v,state[i][n]))){state[i]=deps;effects.push(()=>{cleanup[i]?.();cleanup[i]=fn();});}}},
  render(Component,owner){cursor=0;const tree=Component(owner);while(effects.length)effects.shift()();return tree;},
  close(){for(const fn of cleanup.splice(0))fn?.();}};
}
function find(n,p){if(Array.isArray(n)){for(const x of n){const hit=find(x,p);if(hit)return hit;}}
 else if(n&&typeof n==='object'){if(p(n))return n;return find(n.children,p);}}

// The real Loader registration, installed projection consumed by the real CTA,
// and the DSH-declared { reason } event. No timer is used to make a read happen.
test('native install notification refreshes the open detail from canonical facts without reopening',async t=>{
 const ui=hooks(),entries=[],cleanups=[],listeners=new Set(),reads=[];let installed=false;
 const target={source:'npm',name:'@hanamesh/usage',version:'0.3.0-rc.19'};
 const item={hanaId:'usage-fixture',displayName:'Usage',oneClickInstall:{allowed:true},installMethods:[{channel:'dsh',target}]};
 const projection=()=>({...item,nativeInstallation:installed?{status:'installed',installedVersion:target.version}:{status:'not-installed'}});
 const scope={fetch:async raw=>{const url=new URL(raw,'https://fixture.invalid'), path=url.pathname.split('/').at(-1);
  if(path==='item')reads.push(url.searchParams.get('itemId'));
  const response={handoffs:{handoffs:[],pollMs:1500},settings:{settings:{}},suite:{status:'unknown'},domains:{domains:[]},featured:{items:[projection()]},'stage-config':{phase:'early'},detail:{hanaId:item.hanaId},item:projection()};
  assert.ok(response[path],`unexpected request ${url.pathname}`);return Response.json(response[path]);}};
 const module=await loadClient({React:ui.React,scope});
 const slots={inject(_slot,fn){return fn();},register(options,Component){entries.push({options,Component});return()=>{};}};
 const ctx={slots,layout:{selectPanel(){}},effect(fn){const stop=fn();if(typeof stop==='function')cleanups.push(stop);},
  inject(_keys,fn){const stop=fn(ctx);if(typeof stop==='function')cleanups.push(stop);return()=>{};},
  remoteAccess:{whenAccess(key,fn){assert.equal(key,'pluginManager/listBundles');const yielded=[...fn()];return()=>{for(const stop of yielded)stop?.();};}},
  remote:{$on(event,listener){assert.equal(event,'plugin-manager/changed');listeners.add(listener);return()=>listeners.delete(listener);}},on(){return()=>{};}};
 t.after(()=>{ui.close();for(const stop of cleanups.reverse())stop();});
 module.apply(ctx);
 const Component=entries.find(x=>x.options.name==='plugins.tab').Component, owner={install(){assert.fail('no installation is initiated by the observer');}};
 const frame=()=>find(ui.render(Component,owner),x=>x.type===module.NativeMarketFrame), discovery=()=>find(frame().props.body,x=>x.type===module.NativeMarketDiscovery);
 const cta=()=>{const view=find(frame().props.body,x=>x.type===module.NativeMarketDetailAction);assert.ok(view,'same detail stays open');return find(module.NativeMarketDetailAction(view.props),x=>x.type==='button'&&x.props.className.startsWith('cta-main')).children[0];};
 frame();await settle();const featured=discovery();assert.ok(featured?.props.items.length);
 featured.props.onDetails(featured.props.items[0]);await settle();assert.deepEqual(reads,[item.hanaId]);assert.equal(cta(),'安装');
 const emit=async reason=>{for(const listener of listeners)listener({reason});await settle();};
 await emit('bundle');assert.deepEqual(reads,[item.hanaId]);
 // A settled installation can fail or be cancelled; the event by itself is not proof.
 await emit('install');assert.equal(cta(),'安装');
 installed=true;await settle();assert.equal(cta(),'安装','not optimistic before notification');
 await emit('install');assert.equal(cta(),'已安装 · 打开','native completion must update the already-open detail CTA');
 assert.deepEqual(reads,[item.hanaId,item.hanaId,item.hanaId]);
 const back=find(frame().props.body,x=>x.type==='button'&&x.props.className==='textbtn');back.props.onClick();frame();
 await emit('install');assert.equal(reads.length,3,'notification must not reopen a closed detail');
 ui.close();assert.equal(listeners.size,0,'unmounted tab no longer observes installs');
});

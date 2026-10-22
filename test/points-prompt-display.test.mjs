import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const nodes=t=>t&&typeof t==='object'?[t,...(t.children??[]).flatMap(nodes)]:[];
const text=t=>t==null?'':typeof t==='object'?(t.children??[]).map(text).join(''):String(t);
const settle=async()=>{for(let i=0;i<15;i++)await new Promise(r=>setImmediate(r));};
async function fixture({fail=false}={}){
 let client,current,renderPending=false,live=true,tree;const slots=new Map(),calls=[];
 const React={Fragment:Symbol(),createElement:(type,props,...children)=>({type,props:props??{},children:children.flat()}),useState(v){const o=current,i=o.i++;if(!(i in o.s))o.s[i]=v;return[o.s[i],v=>{o.s[i]=v;if(o===point&&!renderPending&&live){renderPending=true;queueMicrotask(()=>{renderPending=false;if(live)render()})}}]},useRef(v){const o=current,i=o.i++;return o.s[i]??={current:v}},useEffect(fn,deps){const o=current,i=o.i++;if(!o.s[i]||deps.some((x,j)=>x!==o.s[i].deps[j]))o.pending.push(()=>{o.s[i]?.cleanup?.();o.s[i]={deps,cleanup:fn()}})}};
 vm.runInNewContext(await readFile('lib/client.js','utf8'),{queueMicrotask,window:{setInterval:()=>1,clearInterval(){},__ModuleLoader__:{load:s=>client=s.factory(()=>React)}},document:{createElement:()=>({dataset:{},remove(){}}),head:{append(){}}},fetch:async(path,options={})=>{calls.push({path,method:options.method??'GET'});if(path.endsWith('/points/prompt-shown'))return fail?Response.json({error:{code:'CORE_STORAGE_UNAVAILABLE'}},{status:503}):Response.json({shownAt:'2026-10-23T00:00:00.000Z'});if(path.endsWith('/points'))return Response.json({pendingTotal:7,configuration:{pointsRefreshMs:60000},prompt:{show:true}});return Response.json({websiteBinding:{ready:true,reason:null,message:null}})}});
 client.apply({effect:fn=>fn(),slots:{inject:(_,fn)=>fn(),register:(s,c)=>{slots.set(s.name,c);return()=>{}}}});
 current={i:0,s:[],pending:[]};const footer=slots.get('sidebar.footer.action')({wide:true});const component=nodes(footer).find(n=>n.type?.name==='PointsBindPrompt').type;const point={i:0,s:[],pending:[]};function render(){current=point;point.i=0;tree=component();for(const f of point.pending.splice(0))f()}
 return{mount:render,tree:()=>tree,calls,display(){assert.equal(typeof tree.props.onDisplayed,'function');tree.props.onDisplayed()},close(){tree.props.onClose()},unmount(){live=false;for(const x of point.s)x?.cleanup?.()}};
}
test('points prompt waits for actual admitted display before recording the one-time marker',async()=>{const f=await fixture();try{f.mount();await settle();assert.equal(f.calls.filter(x=>x.method==='POST').length,0,'blocked host must not consume an unseen prompt');assert.match(text(f.tree()),/7 分/);f.display();await settle();assert.equal(f.calls.filter(x=>x.path.endsWith('/prompt-shown')).length,1);f.close();await settle();assert.equal(f.tree(),null)}finally{f.unmount()}});
test('unmounting a waiting points prompt does not record it as shown',async()=>{const f=await fixture();f.mount();await settle();f.unmount();assert.equal(f.calls.filter(x=>x.method==='POST').length,0)});
test('points marker write failure is visible and does not retry or bind a device',async()=>{const f=await fixture({fail:true});try{f.mount();await settle();f.display();await settle();assert.match(text(f.tree()),/提示记录未能保存/);assert.match(text(f.tree()),/设置/);assert.equal(f.calls.filter(x=>x.method==='POST').length,1)}finally{f.unmount()}});

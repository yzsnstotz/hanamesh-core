import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const nodes=t=>t&&typeof t==='object'?[t,...(t.children??[]).flatMap(nodes)]:[];
const text=t=>t==null?'':typeof t==='object'?(t.children??[]).map(text).join(''):String(t);
const settle=async()=>{for(let i=0;i<15;i++)await new Promise(r=>setImmediate(r));};
async function fixture({fail=false,shown=true}={}){
 let client,current,renderPending=false,live=true,tree,behind=true,visible=false;const calls=[],intersections=[],mutations=[];
 const point={i:0,s:[],pending:[]}, body={}, anchor={isConnected:true,ownerDocument:{body}};
 const React={Fragment:Symbol(),createElement:(type,props,...children)=>({type,props:props??{},children:children.flat()}),useState(v){const o=current,i=o.i++;if(!(i in o.s))o.s[i]=v;return[o.s[i],v=>{o.s[i]=v;if(!renderPending&&live){renderPending=true;queueMicrotask(()=>{renderPending=false;if(live)render()})}}]},useRef(v){const o=current,i=o.i++;return o.s[i]??={current:v}},useEffect(fn,deps){const o=current,i=o.i++;if(!o.s[i]||deps.some((x,j)=>x!==o.s[i].deps[j]))o.pending.push(()=>{o.s[i]?.cleanup?.();o.s[i]={deps,cleanup:fn()}})}};
 class IO{constructor(fn){this.fn=fn;intersections.push(this)}observe(node){assert.equal(node,anchor)}disconnect(){this.stopped=true}}
 class MO{constructor(fn){this.fn=fn;mutations.push(this)}observe(node){assert.equal(node,body)}disconnect(){this.stopped=true}}
 const document={visibilityState:'visible',addEventListener(){},removeEventListener(){}};
 vm.runInNewContext(await readFile('lib/client.js','utf8'),{queueMicrotask,IntersectionObserver:IO,MutationObserver:MO,document,window:{setInterval(){return 1},clearInterval(){},__ModuleLoader__:{load:s=>client=s.factory(n=>n==='react'?React:{isBehindModal:()=>behind})}},fetch:async(path,options={})=>{calls.push({path,method:options.method??'GET'});if(path.endsWith('/points/prompt-shown'))return fail?Response.json({error:{code:'CORE_STORAGE_UNAVAILABLE'}},{status:503}):Response.json({shownAt:'2026-10-23T00:00:00.000Z'});return Response.json({pendingTotal:7,prompt:{show:shown}})}});
 function render(){current=point;point.i=0;tree=client.PointsBindBanner({navigateTab:id=>calls.push({tab:id})});for(const node of nodes(tree))if(node.props.ref)node.props.ref.current=anchor;for(const f of point.pending.splice(0))f()}
 const intersect=()=>{for(const o of intersections)if(!o.stopped)o.fn([{target:anchor,isIntersecting:visible}])};
 return{mount:render,tree:()=>tree,calls,display(){visible=true;behind=false;intersect()},covered(){visible=true;intersect()},yield(){behind=false;for(const o of mutations)if(!o.stopped)o.fn()},hideDocument(){document.visibilityState='hidden'},close(){nodes(tree).find(n=>n.type==='button'&&n.children.includes('以后再说')).props.onClick()},bind(){nodes(tree).find(n=>n.type==='button'&&n.children.includes('去绑定')).props.onClick()},unmount(){live=false;for(const x of point.s)x?.cleanup?.()}};
}
test('homepage banner waits for intersection and public modal foreground before recording once',async()=>{const f=await fixture();try{f.mount();await settle();assert.equal(f.calls.filter(x=>x.method==='POST').length,0);assert.match(text(f.tree()),/7 分/);f.covered();await settle();assert.equal(f.calls.filter(x=>x.method==='POST').length,0);f.yield();await settle();assert.equal(f.calls.filter(x=>x.path.endsWith('/prompt-shown')).length,1);f.display();await settle();assert.equal(f.calls.filter(x=>x.method==='POST').length,1);f.bind();assert.equal(f.calls.at(-1).tab,'account');f.close();await settle();assert.equal(f.tree(),null)}finally{f.unmount()}});
test('unmounting an unseen banner does not consume the host marker',async()=>{const f=await fixture();f.mount();await settle();f.unmount();assert.equal(f.calls.filter(x=>x.method==='POST').length,0)});
test('hidden document cannot acknowledge the one-time banner',async()=>{const f=await fixture();try{f.hideDocument();f.mount();await settle();f.display();await settle();assert.equal(f.calls.filter(x=>x.method==='POST').length,0)}finally{f.unmount()}});
test('marker failure is visible, does not retry, and cannot bind or authorize',async()=>{const f=await fixture({fail:true});try{f.mount();await settle();f.display();await settle();assert.match(text(f.tree()),/提示记录未能保存/);assert.match(text(f.tree()),/DSH 插件页/);f.display();await settle();assert.equal(f.calls.filter(x=>x.method==='POST').length,1)}finally{f.unmount()}});
test('a host-suppressed reminder renders no banner and writes no marker',async()=>{const f=await fixture({shown:false});try{f.mount();await settle();assert.equal(f.tree(),null);assert.equal(f.calls.filter(x=>x.method==='POST').length,0)}finally{f.unmount()}});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const nodes = tree => tree && typeof tree === 'object' ? [tree, ...(tree.children ?? []).flatMap(nodes)] : [];
const text = tree => tree == null ? '' : typeof tree === 'object' ? (tree.children ?? []).map(text).join(' ') : String(tree);
const settle = async () => {for (let i = 0; i < 15; i++) await new Promise(resolve => setImmediate(resolve));};
const state = {deviceId:'fixture-device',identity:{status:'local-only',source:null,location:null,replacedDeviceIds:[]},consent:{state:'withheld'},registration:{status:'not-connected',lastError:null},session:{bound:false},account:null,serverOrigin:null,websiteOrigin:null,health:{mode:'normal',fault:null},components:[],contributions:{status:'unavailable',reason:'NOT_CONNECTED'},configuration:{clientPollIntervalMs:10000}};

// Exercise registerCorePages -> main renderSlot -> actual registered home/account,
// including nested components, effect cleanup, native Modal admission and async reads.
async function fixture({pointReads = [{show:false, refresh:1200}], blocked = false} = {}) {
  let api, current, tree, pending = false, alive = true, pointRead = 0, behind = blocked, visible = false;
  const owners = new Map(), ledger = [], timers = new Map(), calls = [], intersections = [], mutations = [], windowEvents = new Map(), documentEvents = new Map();
  let nextTimer = 0;
  const events = map => ({addEventListener(name, fn) {if (!map.has(name)) map.set(name,new Set());map.get(name).add(fn);},removeEventListener(name, fn) {map.get(name)?.delete(fn);}});
  const document = {visibilityState:'visible',body:{},...events(documentEvents)};
  const DSHModal = function DSHModal() {};
  const schedule = () => {if (alive && !pending) {pending=true;queueMicrotask(() => {pending=false;if (alive) render();});}};
  const React = {Fragment:Symbol('Fragment'),createElement:(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)}),
    useState(initial) {const o=current,i=o.cursor++;if (!(i in o.hooks)) o.hooks[i]=typeof initial==='function'?initial():initial;return [o.hooks[i],value=>{const next=typeof value==='function'?value(o.hooks[i]):value;if (!Object.is(next,o.hooks[i])) {o.hooks[i]=next;schedule();}}];},
    useRef(initial) {const o=current,i=o.cursor++;return o.hooks[i]??={current:initial};},
    useEffect(run,deps) {const o=current,i=o.cursor++,old=o.hooks[i];if (!old || !deps || deps.some((v,j)=>v!==old.deps[j])) o.effects.push(()=>{old?.cleanup?.();o.hooks[i]={deps,cleanup:run()};});},
  };
  class IO {constructor(fn) {this.fn=fn;intersections.push(this);} observe(target) {this.target=target;} disconnect() {this.stopped=true;}}
  class MO {constructor(fn) {this.fn=fn;mutations.push(this);} observe() {} disconnect() {this.stopped=true;}}
  const sandbox = {queueMicrotask,URL,URLSearchParams,IntersectionObserver:IO,MutationObserver:MO,document,window:{...events(windowEvents),setInterval(fn,ms) {const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearInterval(id) {timers.delete(id);},__ModuleLoader__:{load:spec=>{api=spec.factory(name=>name==='react'?React:{Modal:DSHModal,isBehindModal:()=>behind});}}},
    fetch:async(path,options={})=>{calls.push({path,method:options.method??'GET'});if (path.endsWith('/points/prompt-shown')) return Response.json({shownAt:'fixture-visible-marker'});if (path.endsWith('/points')) {const value=pointReads[Math.min(pointRead++,pointReads.length-1)];return Response.json({pendingTotal:7,prompt:{show:value.show},configuration:{pointsRefreshMs:value.refresh}});}if (path==='/api/hanamesh/usage/panel') return Response.json({total:7,outbox:{pending:3},events:[]});if (path==='/api/hanamesh/core/state') return Response.json(state);assert.fail('unexpected request '+path);},
  };
  vm.runInNewContext(await readFile('lib/client.js','utf8'),sandbox);
  const slots={inject:(_name,fn)=>fn(),register:(options,component)=>{const row={options,component};ledger.push(row);return()=>ledger.splice(ledger.indexOf(row),1);},entriesOfSlot:name=>ledger.filter(row=>row.options.name===name).sort((a,b)=>(a.options.order??0)-(b.options.order??0)),snapshot:name=>name==='plugins.tab'?[{}]:[],subscribe:()=>()=>{}};
  const release=api.registerCorePages({slots,layout:{selectPanel(){assert.fail('local records must stay in the Core account');}}});
  const renderSlot=(name,owner,options={})=>ledger.filter(row=>row.options.name===name&&(!options.only||row.options.id===options.only)).map(row=>React.createElement(row.component,{...owner,renderSlot}));
  const root=ledger.find(row=>row.options.name==='main').component({renderSlot});
  function render() {
    const seen=new Set(),effects=[];
    function walk(node,path) {
      if (Array.isArray(node)) return {children:node.map((child,i)=>walk(child,path+'.'+i))};
      if (!node || typeof node!=='object') return node;
      if (node.type===DSHModal) return {...node,children:node.props.open?node.children.map((child,i)=>walk(child,path+'.modal.'+i)):[]};
      if (typeof node.type==='function') {const key=path+':'+node.type.name;seen.add(key);let o=owners.get(key);if (!o) owners.set(key,o={cursor:0,hooks:[],effects:[]});current=o;o.cursor=0;const result=node.type({...node.props,children:node.children});effects.push(...o.effects.splice(0));return {...node,children:[walk(result,path+'.render')]};}
      if (node.props?.ref) node.props.ref.current??={isConnected:true,ownerDocument:document};
      return {...node,children:(node.children??[]).map((child,i)=>walk(child,path+'.'+i))};
    }
    tree=walk(root,'main');
    for (const [key,o] of owners) if (!seen.has(key)) {for (const h of o.hooks) h?.cleanup?.();owners.delete(key);}
    for (const effect of effects) effect();
  }
  const button=label=>{const result=nodes(tree).find(n=>n.type==='button'&&text(n).trim()===label);assert.ok(result,'button '+label+' exists');return result;};
  const acknowledge=()=>{for (const o of intersections) if (!o.stopped) o.fn([{target:o.target,isIntersecting:visible}]);};
  render();await settle();
  return {tree:()=>tree,calls,timers,DSHModal,button,async select(label) {const tab=nodes(tree).find(n=>n.props?.role==='tab'&&text(n).trim()===label);assert.ok(tab);tab.props.onClick();await settle();},async tick(ms) {for (const [id,t] of [...timers]) if (t.ms===ms&&timers.has(id)) t.fn();await settle();},show() {visible=true;acknowledge();},hideDocument() {document.visibilityState='hidden';},foreground() {document.visibilityState='visible';for (const fn of documentEvents.get('visibilitychange')??[]) fn();},yieldModal() {behind=false;for (const o of mutations) if (!o.stopped) o.fn();},unmount() {if (!alive) return;alive=false;for (const o of owners.values()) for (const h of o.hooks) h?.cleanup?.();owners.clear();release();},listenerCount:()=>[...windowEvents.values(),...documentEvents.values()].reduce((sum,s)=>sum+s.size,0)};
}

test('R406-F1 official account tab opens ready local records in DSH Modal and supports return and native close',async()=>{
  const f=await fixture();try {
    await f.select('账号');assert.match(text(f.tree()),/7 条记录.*3 条待上传/);
    assert.equal(f.button('查看本机记录').props.disabled,false);f.button('查看本机记录').props.onClick();await settle();
    let modal=nodes(f.tree()).find(n=>n.type===f.DSHModal&&n.props.title==='本机使用记录'&&n.props.open);assert.ok(modal,'official account must actually show its native records Modal');
    const iframe=nodes(modal).find(n=>n.type==='iframe');assert.equal(iframe.props.src,'/api/hanamesh/usage/panel/view');assert.equal(iframe.props.title,'本机使用记录详情');
    f.button('返回账号').props.onClick();await settle();assert.equal(nodes(f.tree()).some(n=>n.type===f.DSHModal&&n.props.open),false);
    f.button('查看本机记录').props.onClick();await settle();modal=nodes(f.tree()).find(n=>n.type===f.DSHModal&&n.props.open);assert.ok(modal);modal.props.onClose();await settle();assert.equal(nodes(f.tree()).some(n=>n.type===f.DSHModal&&n.props.open),false);
    assert.ok(f.calls.every(c=>c.method==='GET'),'viewing records never writes consent or uploads');
  } finally {f.unmount();assert.equal(f.timers.size,0);}
});

test('R406-F2 mounted home discovers false-to-true points using current configured cadence and acknowledges only visible foreground',async()=>{
  const f=await fixture({pointReads:[{show:false,refresh:1200},{show:false,refresh:2400},{show:true,refresh:2400}],blocked:true});try {
    assert.equal(f.calls.filter(c=>c.path.endsWith('/points')).length,1);assert.doesNotMatch(text(f.tree()),/积分提醒/);assert.ok([...f.timers.values()].some(t=>t.ms===1200),'host pointsRefreshMs must schedule the next observation');
    await f.tick(1200);assert.equal(f.calls.filter(c=>c.path.endsWith('/points')).length,2);assert.ok([...f.timers.values()].some(t=>t.ms===2400));assert.equal([...f.timers.values()].some(t=>t.ms===1200),false);
    f.hideDocument();await f.tick(2400);assert.match(text(f.tree()),/积分提醒.*7 分/);assert.equal(f.calls.filter(c=>c.method==='POST').length,0);f.show();await settle();assert.equal(f.calls.filter(c=>c.method==='POST').length,0);
    f.foreground();await settle();assert.equal(f.calls.filter(c=>c.method==='POST').length,0,'host modal still covers the banner');f.yieldModal();await settle();assert.equal(f.calls.filter(c=>c.path.endsWith('/prompt-shown')).length,1);f.show();await settle();assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
    const reads=f.calls.filter(c=>c.path.endsWith('/points')).length;await f.tick(2400);assert.equal(f.calls.filter(c=>c.path.endsWith('/points')).length,reads,'discovery stops when the host offers a reminder');
  } finally {f.unmount();assert.equal(f.timers.size,0);assert.equal(f.listenerCount(),0);}
});

test('R406-F2 leaving a suppressed home cancels discovery without consuming its marker',async()=>{
  const f=await fixture();try {assert.ok([...f.timers.values()].some(t=>t.ms===1200),'suppressed reminder must keep observing');const reads=f.calls.length;f.unmount();assert.equal(f.timers.size,0);await f.tick(1200);assert.equal(f.calls.length,reads);assert.equal(f.calls.filter(c=>c.method==='POST').length,0);assert.equal(f.listenerCount(),0);} finally {f.unmount();}
});

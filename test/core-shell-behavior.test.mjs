import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const nodes=t=>t&&typeof t==='object'?[t,...(t.children??[]).flatMap(nodes)]:[];
const text=t=>t==null?'':typeof t==='object'?(t.children??[]).map(text).join(''):String(t);
async function fixture(){
 let api,current,pluginPage=true;const ledger=[],listeners=new Map(),visits=[],rendered=[];
 const react={createElement:(type,props,...children)=>({type,props:props??{},children}),useState(v){const i=current.cursor++;if(!(i in current.hooks))current.hooks[i]=typeof v==='function'?v():v;return[current.hooks[i],v=>{current.hooks[i]=v}]},useRef(v){const i=current.cursor++;return current.hooks[i]??={current:v}},useEffect(fn,deps){const i=current.cursor++;if(!current.hooks[i]||deps.some((v,j)=>v!==current.hooks[i].deps[j])){const owner=current;owner.effects.push(()=>{owner.hooks[i]?.cleanup?.();owner.hooks[i]={deps,cleanup:fn()}})}}};
 vm.runInNewContext(await readFile('lib/client.js','utf8'),{window:{__ModuleLoader__:{load:r=>api=r.factory(()=>react)}}});
 const emit=name=>{for(const fn of listeners.get(name)??[])fn()};
 const slots={inject:(_,fn)=>fn(),register:(spec,component)=>{const row={options:spec,component};ledger.push(row);emit(spec.name);return()=>{ledger.splice(ledger.indexOf(row),1);emit(spec.name)}},entriesOfSlot:name=>ledger.filter(x=>x.options.name===name).sort((a,b)=>(a.options.order??0)-(b.options.order??0)),snapshot:name=>name==='plugins.tab'&&pluginPage?[{}]:[],subscribe:(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);return()=>listeners.get(name).delete(fn)}};
 const stop=api.registerCorePages({slots,layout:{selectPanel:id=>visits.push(id)}});
 const component=ledger.find(x=>x.options.name==='main').component({renderSlot:(name,owner,options)=>{rendered.push({name,owner,options});return {type:'div',props:{'data-child':options.only},children:[]}}});
 const shell={hooks:[],cursor:0,effects:[]};
 const render=()=>{current=shell;shell.cursor=0;const tree=component.type(component.props);for(const fn of shell.effects.splice(0))fn();return tree};
 return{api,slots,visits,rendered,render,ledger,stop(){for(const h of shell.hooks)h?.cleanup?.();stop()},removePluginPage(){pluginPage=false;emit('plugins.tab')},listenerCount:()=>[...listeners.values()].reduce((n,s)=>n+s.size,0)};
}
test('late module tab contributions compose dynamically and removal returns to home',async()=>{
 const f=await fixture();try{
  assert.deepEqual(nodes(f.render()).filter(n=>n.props.role==='tab').map(n=>text(n)),['首页','账号']);
  const release=f.slots.register({name:'hanamesh.tab',id:'fixture-module',label:'模块自己的标签',order:50},()=>null);
  let tree=f.render();assert.deepEqual(nodes(tree).filter(n=>n.props.role==='tab').map(n=>text(n)),['首页','模块自己的标签','账号']);
  const tab=nodes(tree).find(n=>n.props.role==='tab'&&text(n)==='模块自己的标签');tab.props.onClick();tree=f.render();
  assert.equal(f.rendered.at(-1).options.only,'fixture-module');assert.equal(f.rendered.at(-1).owner.version,1);assert.equal(typeof f.rendered.at(-1).owner.navigateTab,'function');
  assert.equal(nodes(tree).find(n=>n.props.id==='hm-tab-fixture-module').props['aria-selected'],true);
  release();f.render();tree=f.render();assert.equal(f.rendered.at(-1).options.only,'home');assert.match(text(tree),/当前标签已停用/);
 }finally{f.stop();assert.equal(f.listenerCount(),0)}
});
test('keyboard tab selection and openPlugins use public host navigation only',async()=>{
 const f=await fixture();try{
  let prevented=0,focused=0;const tree=f.render();const tabs=nodes(tree).filter(n=>n.props.role==='tab');
  tabs[0].props.onKeyDown({key:'End',preventDefault(){prevented++},currentTarget:{parentElement:{querySelectorAll:()=>[{focus(){}},{focus(){focused++}}]}}});
  f.render();assert.equal(f.rendered.at(-1).options.only,'account');assert.equal(prevented,1);assert.equal(focused,1);
  f.rendered.at(-1).owner.openPlugins();assert.deepEqual(f.visits,['plugins']);
  f.removePluginPage();f.render();f.rendered.at(-1).owner.openPlugins();assert.match(text(f.render()),/当前 DSH 未提供插件页接口/);assert.deepEqual(f.visits,['plugins']);
  f.rendered.at(-1).owner.navigateTab('missing-module');assert.match(text(f.render()),/该标签尚未安装或已停用/);
 }finally{f.stop()}
});
test('plugin detail backlink declines unrelated packages and supports both owning install forms',async()=>{
 const f=await fixture();try{
  f.api.registerCorePluginConfig({slots:f.slots,layout:{selectPanel:id=>f.visits.push(id)}});
  const render=f.ledger.find(x=>x.options.name==='plugins.detail.section').component;
  assert.equal(render({subject:{kind:'bundle',pkg:{name:'@other/tool'}}}),null);
  assert.equal(render({subject:{kind:'item',id:'unrelated'}}),null);
  for(const pkg of [{name:'@hanamesh/core'},{name:'@hanamesh/hanamesh',rows:[{moduleName:'@hanamesh/core'}]}])assert(render({subject:{kind:'bundle',pkg}}));
 }finally{f.stop()}
});

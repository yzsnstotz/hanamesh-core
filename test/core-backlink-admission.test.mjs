import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
async function fixture(){let api;const entries=[],visits=[];const react={createElement:(type,props,...children)=>({type,props:props??{},children}),useState:v=>[v,()=>{}]};vm.runInNewContext(await readFile('lib/client.js','utf8'),{window:{__ModuleLoader__:{load:r=>api=r.factory(()=>react)}}});const slots={inject:(_,fn)=>fn(),register:(s,c)=>{entries.push({s,c});return()=>{}}};return{api,slots,entries,visits};}
function render(t){return typeof t?.type==='function'?render(t.type(t.props)):t;}
function nodes(t){return t&&typeof t==='object'?[t,...(t.children??[]).flatMap(nodes)]:[];}
test('native configuration backlink uses the injected page navigation without reading unadmitted layout',async()=>{
 const f=await fixture();const stop=f.api.registerCorePages({slots:f.slots,layout:{selectPanel:id=>f.visits.push(id)}});
 try{f.api.registerCorePluginConfig({slots:f.slots,get layout(){throw Error('UNADMITTED_LAYOUT_ACCESS');}});const entry=f.entries.find(x=>x.s.name==='plugins.detail.section');const tree=render(entry.c({subject:{kind:'bundle',pkg:{name:'@hanamesh/core'}}}));nodes(tree).find(n=>n.type==='button').props.onClick();assert.deepEqual(f.visits,['hanamesh-home']);}finally{stop();}
});

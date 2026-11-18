import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
async function client(react={}){let value;vm.runInNewContext(await readFile('lib/client.js','utf8'),{window:{__ModuleLoader__:{load:r=>value=r.factory(()=>react)}}});return value;}
test('Core partitions account actions, package addresses and row diagnostics without losing facts',async()=>{
 const api=await client();
 assert.equal(api.corePageShowsRow('account','数据授权'),true);assert.equal(api.corePageShowsRow('account','服务端'),false);
 assert.equal(api.corePageShowsRow('configuration','网站'),true);assert.equal(api.corePageShowsRow('configuration','账号'),false);
 assert.equal(api.corePageShowsRow('diagnostics','贡献事件'),true);assert.equal(api.corePageShowsRow(undefined,'我的Hana'),false);
});
test('Core declares one keyed main, self-owned tabs and disposes only its registrations',async()=>{
 const api=await client(),entries=[],released=[];
 const stop=api.registerCorePages({layout:{selectPanel(){}},slots:{inject(_slot,run){return run();},register(options,component){entries.push([options,component]);return()=>released.push(options.key??options.id);}}});
 assert.deepEqual(entries.filter(([s])=>s.name==='main').map(([s])=>s.key),['hanamesh-home']);
 assert(entries.some(([s])=>s.name==='sidebar.panellist'&&s.id==='hanamesh-home'&&s.label==='HanaMesh'));
 assert.equal(entries.some(([s])=>['root','sidebar','conversation'].includes(s.name)),false);
 assert.equal(entries.find(([s])=>s.key==='hanamesh-home')[0].children['hanamesh.tab'].kind,'list');
 stop();assert.equal(released.length,4);
});
test('home reads only Core state and exposes a contribution region instead of inventory',async()=>{
 let api;const effects=[],requests=[],entries=[];
 const react={createElement:(type,props,...children)=>({type,props:props??{},children}),useState:value=>[typeof value==='function'?value():value,()=>{}],useRef:value=>({current:value}),useEffect:run=>effects.push(run)};
 vm.runInNewContext(await readFile('lib/client.js','utf8'),{window:{__ModuleLoader__:{load:r=>api=r.factory(()=>react)},addEventListener(){},removeEventListener(){}},fetch:async(path,init)=>{requests.push({path,init});return Response.json({consent:{state:'withheld'},session:{bound:false},components:[]});}});
 const stop=api.registerCorePages({layout:{selectPanel(){}},slots:{inject(_name,run){return run();},register(spec,component){entries.push([spec,component]);return()=>{};}}});
 const home=entries.find(([spec])=>spec.name==='hanamesh.tab'&&spec.id==='home')[1];const rendered=[];
 home({version:1,navigateTab(){},openPlugins(){},renderSlot:(key)=>{rendered.push(key);return null;}});
 const releases=effects.map(run=>run());await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(requests.map(row=>row.path),['/api/hanamesh/core/state']);assert(requests.every(row=>!row.init?.method));assert.deepEqual(rendered,['hanamesh.home.continue']);
 for(const release of releases)release?.();stop();
});

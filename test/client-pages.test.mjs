import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
async function client(){let value;vm.runInNewContext(await readFile(process.env.CL1_BASELINE_CLIENT??'lib/client.js','utf8'),{window:{__ModuleLoader__:{load:r=>value=r.factory(()=>({}))}}});return value;}
test('Core pages separate account consent from environment settings and assets remain on website',async()=>{
 const api=await client();
 assert.equal(api.corePageShowsRow('account','数据授权'),true);
 assert.equal(api.corePageShowsRow('account','服务端'),false);
 assert.equal(api.corePageShowsRow('environment','网站'),true);
 assert.equal(api.corePageShowsRow('environment','账号'),false);
 assert.equal(api.corePageShowsRow('settings','我的Hana'),false);
});
test('Core uses additive keyed main navigation and disposes its own registrations',async()=>{
 const api=await client(),entries=[],released=[];
 // apply's initial style/peer effects are checked by the existing client tests.
 // A focused public registration helper makes the additive seats reviewable.
 const stop=api.registerCorePages({layout:{selectPanel(){}},slots:{inject(_slot,run){return run();},register(options,component){entries.push([options,component]);return()=>released.push(options.key??options.id);}}});
 for(const id of ['hanamesh-home','hanamesh-account','hanamesh-environment'])assert(entries.some(([spec])=>spec.name==='main'&&spec.key===id));
 assert(entries.some(([spec])=>spec.name==='sidebar.panellist'&&spec.id==='hanamesh-home'&&spec.order===-30));
 assert.equal(entries.some(([spec])=>['root','sidebar','conversation'].includes(spec.name)),false);
 assert.equal(entries.find(([spec])=>spec.key==='hanamesh-environment')[0].children['hanamesh.environment.content'].kind,'list');
 stop();assert.equal(released.length,4);
});


test('home reads only Core state and public local inventory; it does not fetch assets or enable recording',async()=>{
 let api;const effects=[],requests=[],entries=[];
 const react={createElement:(type,props,...children)=>({type,props:props??{},children}),useState:value=>[value,()=>{}],useRef:value=>({current:value}),useEffect:run=>effects.push(run)};
 vm.runInNewContext(await readFile('lib/client.js','utf8'),{window:{__ModuleLoader__:{load:record=>api=record.factory(()=>react)},addEventListener(){},removeEventListener(){}},fetch:async(path,init)=>{requests.push({path,init});return Response.json(path.includes('installedPlugins')?{apps:[],plugins:[]}:{consent:{state:'withheld'},session:{bound:false},components:[]});}});
 const stop=api.registerCorePages({layout:{selectPanel(){}},slots:{inject(_name,run){return run();},register(spec,component){entries.push([spec,component]);return()=>{};}}});
 const frame=entries.find(([spec])=>spec.key==='hanamesh-home')[1]({});const home=frame.type(frame.props);home.type(home.props);
 const releases=effects.map(run=>run());await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(requests.map(row=>row.path).sort(),['/api/hanamesh/core/state','/hanamesh/library/installedPlugins']);assert(requests.every(row=>!row.init?.method));
 for(const release of releases)release?.();stop();
});

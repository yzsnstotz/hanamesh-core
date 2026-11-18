import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
async function fixture(){
 let api;const entries=[],disposed=[];
 vm.runInNewContext(await readFile('lib/client.js','utf8'),{window:{__ModuleLoader__:{load:r=>api=r.factory(()=>({}))}}});
 const slots={inject:(_,run)=>run(),register:(spec,component)=>{entries.push({spec,component});return()=>disposed.push(spec.key??spec.id)}};
 return {api,entries,disposed,slots};
}
test('B shell owns exactly one main and sidebar seat, with a root list tab declaration',async()=>{
 const f=await fixture();const stop=f.api.registerCorePages({slots:f.slots,layout:{selectPanel(){}}});
 assert.deepEqual(f.entries.filter(x=>x.spec.name==='main').map(x=>x.spec.key),['hanamesh-home']);
 const main=f.entries.find(x=>x.spec.name==='main');assert.equal(main.spec.children['hanamesh.tab'].kind,'list');assert.equal(main.spec.children['hanamesh.tab'].scope,'root');
 const side=f.entries.filter(x=>x.spec.name==='sidebar.panellist');assert.equal(side.length,1);assert.equal(side[0].spec.label,'HanaMesh');
 assert.deepEqual(f.entries.filter(x=>x.spec.name==='hanamesh.tab').map(x=>x.spec.id),['home','account']);
 stop();assert.equal(f.disposed.length,f.entries.length);
});
test('technical configuration moves to the DSH bundle/core row with an owning-package backlink',async()=>{
 const f=await fixture();f.api.registerCorePluginConfig({slots:f.slots,layout:{selectPanel(){}}});
 assert(f.entries.some(x=>x.spec.name==='plugins.bundle.config'&&x.spec.key==='@hanamesh/hanamesh'));
 assert(f.entries.some(x=>x.spec.name==='plugins.row.config'&&x.spec.key==='@hanamesh/hanamesh#hanamesh-core'));
 assert(f.entries.some(x=>x.spec.name==='plugins.row.config'&&x.spec.key==='@hanamesh/core#hanamesh-core'));
 assert(f.entries.some(x=>x.spec.name==='plugins.detail.section'));
});
test('plugin API capability probe recognizes rc1/rc3/rc4 and missing update without invoking it',async()=>{
 let called=0;const f=await fixture();
 for(const update of [undefined,()=>called++]){const caps=f.api.corePluginCapabilities({install(){},openPackage(){},update});assert.equal(caps.install,true);assert.equal(caps.update,!!update)}
 assert.equal(f.api.corePluginCapabilities(undefined).install,false);assert.equal(called,0);
});
test('B view partition preserves account actions and moves all diagnostics and contribution facts',async()=>{
 const {api}=await fixture();for(const label of ['账号','设备身份','数据授权','本机使用记录','市场与资产'])assert.equal(api.corePageShowsRow('account',label),true,label);
 for(const label of ['服务端','网站','运行配置','组件与版本','关于','贡献事件','本设备贡献累计'])assert.equal(api.corePageShowsRow('diagnostics',label),true,label);
 assert.equal(api.corePageShowsRow('account','服务端'),false);assert.equal(api.corePageShowsRow('diagnostics','账号'),false);
});
test('no retired footer/settings/main inventory registrations remain in shipped code',async()=>{
 const source=await readFile('lib/client.js','utf8');
 assert.doesNotMatch(source,/name: ['"]settings.section['"]|name: ['"]sidebar.footer.action['"]/);
 assert.doesNotMatch(source,/\/hanamesh\/library\/installedPlugins/);
 assert.match(source,/shell.overlay/);assert.match(source,/plugins.tab/);assert.match(source,/当前 DSH/);
});

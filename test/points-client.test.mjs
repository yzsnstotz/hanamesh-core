import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const bundle=await readFile(process.env.HM_CORE_CLIENT_BUNDLE??'lib/client.js','utf8');
function renderSettings(bound){
 const core={serverOrigin:'https://server.example',websiteOrigin:'https://web.example',deviceId:'device',identity:{status:'local-only',replacedDeviceIds:[]},registration:{status:'registered'},consent:{state:'granted'},session:{bound},account:null,configuration:{timeoutMs:10000,checkIntervalMs:3000,profileTimeoutMs:1500,maxHanaRows:200,maxResponseBytes:1048576},contributions:{status:'unavailable',reason:'NOT_CONNECTED'},health:{},components:[]};
 let first=true,client,section;const calls=[];
 const react={Fragment:Symbol('Fragment'),createElement:(type,props,...children)=>typeof type==='function'?type({...props,children}):{type,props:props??{},children},useState:initial=>{const value=first?core:initial;first=false;return[value,()=>{}];},useRef:value=>({current:value}),useEffect:()=>{}};
 vm.runInNewContext(bundle,{URL,fetch:async(path,init)=>{calls.push({path,init});return Response.json({opened:true});},window:{__ModuleLoader__:{load:spec=>client=spec.factory(()=>react)}},document:{createElement:()=>({dataset:{},remove(){}}),head:{append(){}}}});
 client.apply({effect:run=>run(),slots:{inject:(_name,run)=>run(),register:(spec,component)=>{if(spec.name==='settings.section')section=component;return()=>{};}}});
 const tree=section();
 const text=node=>node==null||typeof node==='boolean'?'':Array.isArray(node)?node.map(text).join(''):typeof node==='object'?(node.children??[]).map(text).join(''):String(node);
 const nodes=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(nodes):[node,...node.children.flatMap(nodes)];
 return {text:text(tree),nodes:nodes(tree),calls};
}
for(const bound of [true,false,null])test(`assets remain a website action without client balances (bound=${bound})`,async()=>{
 const ui=renderSettings(bound);assert.match(ui.text,/交易、发行、LP 与资产在网站管理/);assert.doesNotMatch(ui.text,/总计 .* 分|其中待绑定 .* 分|积分来源（按类型汇总）/);
 const button=ui.nodes.find(node=>node.type==='button'&&node.children.includes('在网站查看'));assert(button);button.props.onClick();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(ui.calls.length,1);assert.equal(ui.calls[0].path,'/api/hanamesh/core/open-external');assert.equal(JSON.parse(ui.calls[0].init.body).url,'https://web.example/me');
});
test('environment settings retain their named runtime budgets',()=>{
 const ui=renderSettings(true);assert.match(ui.text,/健康检查 3000ms/);assert.match(ui.text,/Hana 行预算 200/);assert.match(ui.text,/响应字节预算 1048576/);
});

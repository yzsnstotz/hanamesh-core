import {SUITE_INSTALL_COMMAND} from '../lib/suite/index.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const elements = tree => tree && typeof tree === 'object' ? [tree, ...tree.children.flatMap(elements)] : [];
const textIn = tree => typeof tree === 'string' ? tree : tree && typeof tree === 'object' ? tree.children.map(textIn).join(' ') : '';
const settle = () => new Promise(resolve => setImmediate(resolve));
let state = {
  deviceId: 'fixture-device', identity: {status: 'local-only', source: null, location: null, replacedDeviceIds: []},
  consent: {state: 'granted'}, registration: {status: 'registered', lastError: null}, session: {bound: false}, account: null,
  serverOrigin: null, websiteOrigin: null, health: {mode: 'normal', fault: null}, components: [],
  contributions: {status: 'ready', windowDays: 90, availability: 'available', actions: {install: 900, open: 800, use: 700, uninstall: 600}},
};

async function fixture(panelResponse = () => Response.json({total: 7, outbox: {pending: 3}, events: []}), stateResponse = () => Response.json(state)) {
  let current;
  const slots = new Map(); const timers = []; const requests = []; const opened = [];
  const React = {
    Fragment: Symbol('Fragment'), createElement: (type, props, ...children) => ({type, props: props ?? {}, children}),
    useState(initial) { const owner = current, index = owner.cursor++; if (!(index in owner.state)) owner.state[index] = initial; return [owner.state[index], value => { owner.state[index] = value; }]; },
    useRef(value) { const owner = current, index = owner.cursor++; if (!(index in owner.state)) owner.state[index] = {current: value}; return owner.state[index]; },
    useEffect(run) { current.effects.push(run); },
  };
  const mount = (component, props = {}) => { const owner = {state: [], cursor: 0, effects: []}; return {render() { current = owner; owner.cursor = 0; owner.effects = []; return component(props); }, effects: () => owner.effects}; };
  const sandbox = {
    exports: {}, require: name => { if (name === '../suite/install-command.js') return {SUITE_INSTALL_COMMAND}; assert.equal(name, 'react'); return React; }, URLSearchParams,
    document: {visibilityState: 'visible', addEventListener() {}, removeEventListener() {}, createElement: () => ({dataset: {}, remove() {}}), head: {append() {}},
      querySelector() { assert.fail('must not inspect host navigation'); }, querySelectorAll() { assert.fail('must not inspect host navigation'); }},
    window: {addEventListener() {}, removeEventListener() {}, setInterval: run => { timers.push(run); return timers.length; }, clearInterval() {}, open(url) { opened.push(url); }},
    fetch: async (path, init) => {
      requests.push({path, method: init?.method ?? 'GET', body: init?.body});
      if(path === '/api/hanamesh/core/website') {const {websiteOrigin}=JSON.parse(init.body);state={...state,websiteOrigin:websiteOrigin??'https://market.fixture.invalid',websiteOriginSource:websiteOrigin?'setting':'config',websiteBinding:{ready:!!websiteOrigin,reason:websiteOrigin?null:'CORE_WEBSITE_CONFIGURATION_REQUIRED',message:websiteOrigin?'':'服务端已更换，请设置对应的网站地址；设置前不能打开网站或绑定。'}};return Response.json(state);}
      if(path === '/api/hanamesh/core/open-external') return Response.json({opened:false,reason:'DISABLED'});
      if (path === '/api/hanamesh/core/state') return stateResponse();
      if (path === '/api/hanamesh/core/points') return Response.json({status: 'unavailable', reason: 'NOT_CONNECTED', totalPoints: 0, pendingTotal: 0, hanas: [], prompt: {show: false, shownAt: null}});
      if (path === '/api/hanamesh/core/activity') return Response.json({status: 'ready', reason: null, items: [{hanaRef: 'server-only-event', action: 'use', occurredAt: '2026-10-16T00:00:00.000Z'}], nextAfter: null, window: null});
      if (path === '/api/hanamesh/usage/panel') return panelResponse();
      assert.fail(`unexpected path ${path}`);
    },
  };
  // In-memory compilation exercises current UI source without changing build outputs.
  vm.runInNewContext(ts.transpileModule(await readFile('src/client/index.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, sandbox);
  sandbox.exports.apply({effect: run => run(), slots: {inject: (_name, run) => run(), register: (spec, component) => { slots.set(spec.name, component); return () => {}; }}});
  const section = mount(slots.get('settings.section'));
  section.render(); section.effects().forEach(run => run()); await settle();
  return {section, mount, requests, timers, opened};
}


test('website is visible beside server, blocked on legacy public default and editable without JSON',async()=>{
  state={...state,serverOrigin:'http://127.0.0.1:40001',websiteOrigin:'https://market.fixture.invalid',websiteOriginSource:'config',configuredWebsiteOrigin:'https://market.fixture.invalid',websiteBinding:{ready:false,reason:'CORE_WEBSITE_CONFIGURATION_REQUIRED',message:'服务端已更换，请设置对应的网站地址；设置前不能打开网站或绑定。'}};
  const f=await fixture();
  let tree=f.section.render();
  let row=elements(tree).find(e=>e.props['data-hanamesh-core-website']);
  assert.ok(row,'website address must have its own settings row');
  assert.match(textIn(row),/market.fixture.invalid.*出厂默认/);
  for(const label of ['去网站绑定','邮箱绑定','去网站'])assert.equal(elements(tree).find(e=>e.type==='button'&&e.children.includes(label)).props.disabled,true,label);
  assert.match(textIn(tree),/设置对应的网站/);
  elements(row).find(e=>e.type==='input').props.onChange({currentTarget:{value:'http://127.0.0.1:40002'}});
  row=elements(f.section.render()).find(e=>e.props['data-hanamesh-core-website']);
  await elements(row).find(e=>e.children.includes('保存')).props.onClick();await settle();
  tree=f.section.render();row=elements(tree).find(e=>e.props['data-hanamesh-core-website']);
  assert.match(textIn(row),/40002.*你设置的/);
  assert.equal(elements(tree).find(e=>e.children.includes('去网站绑定')).props.disabled,false);
  assert.equal(JSON.parse(f.requests.find(r=>r.path.endsWith('/website')).body).websiteOrigin,'http://127.0.0.1:40002');
  await elements(row).find(e=>e.children.includes('恢复默认')).props.onClick();await settle();
  assert.equal(elements(f.section.render()).find(e=>e.children.includes('去网站绑定')).props.disabled,true);
  assert.deepEqual(f.opened,[]);
});

test('a state read started before website save cannot replace the newly saved address',async()=>{
 state={...state,websiteOrigin:'https://old.fixture.invalid',websiteOriginSource:'config',websiteBinding:{ready:true,reason:null,message:null}};
 let reads=0,release;const delayed=new Promise(r=>release=r),old=structuredClone(state);
 const f=await fixture(undefined,()=>++reads===2?delayed:Response.json(state));
 f.timers[0]();await settle();
 let row=elements(f.section.render()).find(e=>e.props['data-hanamesh-core-website']);
 elements(row).find(e=>e.type==='input').props.onChange({currentTarget:{value:'http://127.0.0.1:40002'}});
 row=elements(f.section.render()).find(e=>e.props['data-hanamesh-core-website']);
 await elements(row).find(e=>e.children.includes('保存')).props.onClick();
 release(Response.json(old));await settle();
 assert.match(textIn(elements(f.section.render()).find(e=>e.props['data-hanamesh-core-website'])),/40002.*你设置的/);
});

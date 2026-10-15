import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const bundle = await readFile(process.env.HM_CORE_CLIENT_BUNDLE ?? 'lib/client.js', 'utf8');
// Render the shipped settings component through its actual slot, with host-supplied React hooks.
function renderPoints(points, bound) {
  const core = {
    serverOrigin: 'https://server.example', websiteOrigin: 'https://web.example', deviceId: 'device',
    identity: {status: 'local-only', replacedDeviceIds: []}, registration: {status: 'registered'},
    consent: {state: 'granted'}, session: {bound}, account: null,
    configuration:{timeoutMs:10000,checkIntervalMs:3000,profileTimeoutMs:1500,maxHanaRows:200,maxResponseBytes:1048576},
    contributions: {status: 'unavailable', reason: 'NOT_CONNECTED'}, health: {}, components: [],
  };
  const states = [core, points, null, false, null, false, null, '', false, null];
  const react = {
    Fragment: Symbol('Fragment'),
    createElement: (type, props, ...children) => typeof type === 'function' ? type({...props, children}) : {props, children},
    useState: initial => [states.length ? states.shift() : initial, () => {}], useRef: value => ({current: value}), useEffect: () => {},
  };
  let client, section;
  vm.runInNewContext(bundle, {window: {__ModuleLoader__: {load: spec => {client = spec.factory(() => react);}}},
    document: {createElement: () => ({dataset: {}, remove() {}}), head: {append() {}}}});
  client.apply({effect: run => run(), slots: {
    inject: (_name, run) => run(),
    register: (spec, component) => {if (spec.name === 'settings.section') section = component; return () => {};},
  }});
  const tree = section();
  const text = node => node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' ? (node.children ?? []).map(text).join('') : String(node);
  return text(tree);
}

const zero = {status: 'ready', reason: null, totalPoints: 0, pendingTotal: 0, hanas: []};

test('ready zero points show 只累计、暂不可领 when Usage says the device is not bound', () => {
  const text = renderPoints(zero, false);
  assert.match(text, /只累计、暂不可领/);
  assert.match(text, /还没有分/);
});

test('ready points never show the unbound restriction when Usage says bound, whatever the custody payload carried', () => {
  const text = renderPoints({...zero, bindingStatus: 'UNBOUND'}, true);
  assert.doesNotMatch(text, /只累计、暂不可领|已可领|可以领取/);
});

test('unknown bound (null) shows no binding line for the points', () => {
  assert.doesNotMatch(renderPoints({...zero, bindingStatus: 'UNBOUND'}, null), /只累计、暂不可领/);
});

test('unbound accumulated points preserve totals and pending amounts alongside the restriction', () => {
  const text = renderPoints({status: 'ready', totalPoints: 5, pendingTotal: 5,
    hanas: [{hanaId: 'hana', displayName: 'Example Hana', points: 0, pending: 5, breakdown: {install: 0, open: 0, use: 0, claimBonus: 0, creatorMirror: 0, launchInitiator: 0}}]}, false);
  assert.match(text, /只累计、暂不可领/);
  assert.match(text, /总计 5 分/);
  assert.match(text, /其中待绑定 5 分/);
});

test('unavailable points do not assert an unbound state', () => {
  assert.doesNotMatch(renderPoints({status: 'unavailable', reason: 'CORE_UPSTREAM_UNAVAILABLE'}, false), /只累计、暂不可领/);
});

test('catalog failure is visible beside authoritative points without claiming the Hana is absent',()=>{
 const text=renderPoints({status:'ready',totalPoints:1,pendingTotal:0,hanas:[{hanaId:'hana',displayName:null,displayNameStatus:'failed',displayNameReason:'CORE_UPSTREAM_UNAVAILABLE',points:1,pending:0,breakdown:{install:1,open:0,use:0,claimBonus:0,creatorMirror:0,launchInitiator:0}}]},true);
 assert.match(text,/名称读取失败.*CORE_UPSTREAM_UNAVAILABLE/);
});

test('settings expose named runtime budgets with their legal default values',()=>{
 const text=renderPoints(zero,true);assert.match(text,/健康检查 3000ms/);assert.match(text,/Hana 行预算 200/);assert.match(text,/响应字节预算 1048576/);
});

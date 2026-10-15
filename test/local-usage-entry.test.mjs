import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const elements = tree => tree && typeof tree === 'object' ? [tree, ...tree.children.flatMap(elements)] : [];
const textIn = tree => typeof tree === 'string' ? tree : tree && typeof tree === 'object' ? tree.children.map(textIn).join(' ') : '';
const settle = () => new Promise(resolve => setImmediate(resolve));
const state = {
  deviceId: 'fixture-device', identity: {status: 'local-only', source: null, location: null, replacedDeviceIds: []},
  consent: {state: 'granted'}, registration: {status: 'registered', lastError: null}, session: {bound: false}, account: null,
  serverOrigin: null, websiteOrigin: null, health: {mode: 'normal', fault: null}, components: [],
  contributions: {status: 'ready', windowDays: 90, availability: 'available', actions: {install: 900, open: 800, use: 700, uninstall: 600}},
};

async function fixture(panelResponse = () => Response.json({total: 7, outbox: {pending: 3}, events: []})) {
  let current;
  const slots = new Map(); const timers = []; const requests = [];
  const React = {
    Fragment: Symbol('Fragment'), createElement: (type, props, ...children) => ({type, props: props ?? {}, children}),
    useState(initial) { const owner = current, index = owner.cursor++; if (!(index in owner.state)) owner.state[index] = initial; return [owner.state[index], value => { owner.state[index] = value; }]; },
    useRef(value) { const owner = current, index = owner.cursor++; if (!(index in owner.state)) owner.state[index] = {current: value}; return owner.state[index]; },
    useEffect(run) { current.effects.push(run); },
  };
  const mount = (component, props = {}) => { const owner = {state: [], cursor: 0, effects: []}; return {render() { current = owner; owner.cursor = 0; owner.effects = []; return component(props); }, effects: () => owner.effects}; };
  const sandbox = {
    exports: {}, require: name => { assert.equal(name, 'react'); return React; }, URLSearchParams,
    document: {visibilityState: 'visible', addEventListener() {}, removeEventListener() {}, createElement: () => ({dataset: {}, remove() {}}), head: {append() {}},
      querySelector() { assert.fail('must not inspect host navigation'); }, querySelectorAll() { assert.fail('must not inspect host navigation'); }},
    window: {addEventListener() {}, removeEventListener() {}, setInterval: run => { timers.push(run); return timers.length; }, clearInterval() {}, open() { assert.fail('local records stay in Core UI'); }},
    fetch: async (path, init) => {
      requests.push({path, method: init?.method ?? 'GET'});
      if (path === '/api/hanamesh/core/state') return Response.json(state);
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
  return {section, mount, requests, timers};
}

test('main HanaMesh section shows real local Usage counts and opens its own records view', async () => {
  const f = await fixture();
  const summary = elements(f.section.render()).find(e => e.props['data-hanamesh-core-local-usage']);
  assert.ok(summary, 'main section needs a local Usage row');
  assert.match(textIn(summary), /7 条记录.*3 条待上传/);
  assert.doesNotMatch(textIn(summary), /900|800|server-only-event/);
  const view = elements(summary).find(e => e.type === 'button' && e.children.includes('查看本机记录'));
  assert.ok(view); assert.equal(view.props.disabled, false);
  let restored = 0; view.props.ref.current = {focus() { restored++; }};
  view.props.onClick();
  const dialogElement = elements(f.section.render()).find(e => typeof e.type === 'function' && e.props.onClose && e.props.restoreFocus);
  assert.ok(dialogElement, 'view entry must open a Core-owned dialog');
  const dialog = f.mount(dialogElement.type, dialogElement.props);
  const tree = dialog.render(); assert.equal(tree.type, 'dialog');
  const iframe = elements(tree).find(e => e.type === 'iframe');
  assert.equal(iframe.props.src, '/api/hanamesh/usage/panel/view');
  assert.equal(iframe.props.title, '本机使用记录详情');
  let opened = 0, closed = 0;
  tree.props.ref.current = {open: true, showModal() { opened++; }, close() { closed++; }};
  const cleanups = dialog.effects().map(run => run()); assert.equal(opened, 1);
  elements(tree).find(e => e.type === 'button' && e.children.includes('返回 HanaMesh 设置')).props.onClick();
  assert.equal(elements(f.section.render()).filter(e => typeof e.type === 'function' && e.props.onClose && e.props.restoreFocus).length, 0);
  cleanups.forEach(run => run?.()); assert.equal(closed, 1); assert.equal(restored, 1);
  assert.ok(f.requests.some(r => r.path === '/api/hanamesh/usage/panel'));
  assert.ok(f.requests.every(r => r.method === 'GET'), 'viewing local records cannot write consent or upload');
});

test('missing Usage service is explicit and never presented as zero local records', async () => {
  const f = await fixture(() => Response.json({error: {code: 'NOT_FOUND'}}, {status: 404}));
  const row = elements(f.section.render()).find(e => e.props['data-hanamesh-core-local-usage']);
  assert.ok(row); assert.match(textIn(row), /Usage 服务未安装或未启动/);
  assert.doesNotMatch(textIn(row), /0 条记录|0 条待上传/);
  assert.equal(elements(row).find(e => e.children.includes('查看本机记录')).props.disabled, true);
});

test('local summary refresh reads panel counts independently of server contribution and activity', async () => {
  let total = 7, pending = 3;
  const f = await fixture(() => Response.json({total, outbox: {pending}, events: []}));
  total = 9; pending = 1;
  const refresh = elements(f.section.render()).find(e => e.type === 'button' && e.children.includes('刷新本机记录'));
  assert.ok(refresh); refresh.props.onClick(); await settle();
  const row = elements(f.section.render()).find(e => e.props['data-hanamesh-core-local-usage']);
  assert.match(textIn(row), /9 条记录.*1 条待上传/);
  assert.ok(f.requests.filter(r => r.path === '/api/hanamesh/usage/panel').length >= 2);
});

test('malformed or failed panel reads have a safe retry state rather than fabricated counts', async () => {
  for (const response of [() => Response.json({total: '/private/token', outbox: {pending: 3}}), () => { throw new Error('/private/token'); }]) {
    const f = await fixture(response);
    const row = elements(f.section.render()).find(e => e.props['data-hanamesh-core-local-usage']);
    assert.ok(row); assert.match(textIn(row), /本机使用记录暂时无法读取/);
    assert.doesNotMatch(textIn(row), /private|token|0 条记录/);
    assert.ok(elements(row).some(e => e.children.includes('刷新本机记录')));
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const command = "dsh plugin --profile desktop add --save-exact '@hanamesh/core@0.3.21' '@hanamesh/usage@0.3.0-rc.6' '@hanamesh/dsh-app-host@0.6.13'";
const elements = tree => tree && typeof tree === 'object' ? [tree, ...tree.children.flatMap(elements)] : [];
const textIn = tree => typeof tree === 'string' ? tree : tree && typeof tree === 'object' ? tree.children.map(textIn).join(' ') : '';
const settle = () => new Promise(resolve => setImmediate(resolve));
const component = (id, status, extra = {}) => ({id, label: id === 'usage' ? '使用记录（Usage）' : '应用容器（App Host）', status, version: null, requiredRange: '>=0.1.0 <1.0.0', reason: null, nextStep: null, ...extra});

async function fixture(components, clipboard) {
  const state = {
    deviceId: 'fixture-device', identity: {status: 'local-only', source: null, location: null, replacedDeviceIds: []},
    consent: {state: 'withheld'}, registration: {status: 'unregistered', lastError: null}, session: {bound: false}, account: null,
    serverOrigin: null, websiteOrigin: null, health: {mode: 'normal', fault: null}, components,
    contributions: {status: 'unavailable', reason: 'CONSENT_WITHHELD'},
  };
  let cursor = 0; const hooks = [], effects = [], slots = new Map(), requests = [];
  const React = {
    Fragment: Symbol('Fragment'), createElement: (type, props, ...children) => ({type, props: props ?? {}, children}),
    useState(initial) { const index = cursor++; if (!(index in hooks)) hooks[index] = initial; return [hooks[index], value => { hooks[index] = value; }]; },
    useRef(initial) { const index = cursor++; if (!(index in hooks)) hooks[index] = {current: initial}; return hooks[index]; },
    useEffect(run) { effects.push(run); },
  };
  const sandbox = {
    exports: {}, require: name => { assert.equal(name, 'react'); return React; }, URLSearchParams, navigator: {clipboard},
    document: {visibilityState: 'visible', addEventListener() {}, removeEventListener() {}, createElement: () => ({dataset: {}, remove() {}}), head: {append() {}}},
    window: {addEventListener() {}, removeEventListener() {}, setInterval: () => 1, clearInterval() {}, open() { assert.fail('suite hint must never open or run anything'); }},
    fetch: async (path, init) => {
      requests.push({path, method: init?.method ?? 'GET'});
      if (path === '/api/hanamesh/core/state') return Response.json(state);
      if (path === '/api/hanamesh/core/points') return Response.json({status: 'unavailable', reason: 'CONSENT_WITHHELD', totalPoints: 0, pendingTotal: 0, hanas: [], prompt: {show: false, shownAt: null}});
      if (path === '/api/hanamesh/core/activity') return Response.json({status: 'unavailable', reason: 'CONSENT_WITHHELD', items: [], nextAfter: null, window: null});
      if (path === '/api/hanamesh/usage/panel') return Response.json({total: 0, outbox: {pending: 0}});
      assert.fail(`unexpected request: ${path}`);
    },
  };
  vm.runInNewContext(ts.transpileModule(await readFile('src/client/index.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, sandbox);
  sandbox.exports.apply({effect: run => run(), slots: {inject: (_name, run) => run(), register: (spec, section) => { slots.set(spec.name, section); return () => {}; }}});
  const render = () => { cursor = 0; return slots.get('settings.section')(); };
  render(); effects.splice(0).forEach(run => run()); await settle();
  return {render, requests};
}

test('missing required suite components have an exact manual repair command and copy action', async () => {
  const copied = [];
  const f = await fixture([component('usage', 'missing'), component('app-host', 'missing')], {writeText: async value => copied.push(value)});
  const tree = f.render(), text = textIn(tree);
  assert.match(text, /套件不完整，缺 使用记录（Usage）、应用容器（App Host）/);
  assert.match(text, /未安装或未加入当前加载配置/);
  assert.match(text, /官方命令.*启用套件/);
  assert.match(text, /仅用于手动安装\/修复，不是兼容升级计划/);
  assert.doesNotMatch(text, /可分别安装|optional|品牌/);
  assert.equal(textIn(elements(tree).find(e => e.type === 'code')), command);
  assert.deepEqual(copied, [], 'rendering never copies or executes the command');
  const copy = elements(tree).find(e => e.type === 'button' && e.children.includes('复制安装/修复命令'));
  assert.ok(copy);assert.match(textIn(f.render()),/macOS \/ Linux/);assert.match(textIn(f.render()),/Windows 安全命令暂未提供/); await copy.props.onClick();
  assert.deepEqual(copied, [command]);
  assert.match(textIn(f.render()), /已复制安装\/修复命令/);
  assert.ok(f.requests.every(r => r.method === 'GET'), 'hint and copy cannot mutate settings, health, or install plugins');
});

test('only missing rows are named missing; disabled components keep installed versions and enable guidance', async () => {
  const f = await fixture([component('usage', 'missing'), component('app-host', 'inactive', {version: '0.6.0'})]);
  const text = textIn(f.render());
  assert.match(text, /套件不完整，缺 使用记录（Usage）/);
  assert.doesNotMatch(text, /套件不完整，缺 [^。]*应用容器/);
  assert.match(text, /已安装但未启用：应用容器（App Host）/);
  assert.match(text, /应用容器（App Host）：版本 0\.6\.0 · 已安装但未启用/);
  assert.match(text, /官方命令.*启用套件/);
});

test('disabled-only suite offers enable guidance without claiming a missing package', async () => {
  const f = await fixture([component('usage', 'inactive', {version: '0.2.0-rc.27'}), component('app-host', 'satisfied', {version: '0.6.0'})]);
  const text = textIn(f.render());
  assert.match(text, /已安装但未启用：使用记录（Usage）/);
  assert.doesNotMatch(text, /套件不完整，缺/);
  assert.equal(textIn(elements(f.render()).find(e => e.type === 'code')), command);
});

test('failed and incompatible rows retain reasons and versions without being relabelled missing', async () => {
  const f = await fixture([component('usage', 'failed', {version: '0.2.0-rc.27', reason: 'startup-failed', nextStep: '检查存储配置'}), component('app-host', 'incompatible', {version: '0.7.0'})]);
  const text = textIn(f.render());
  assert.doesNotMatch(text, /套件不完整，缺|已安装但未启用/);
  assert.match(text, /使用记录（Usage）：版本 0\.2\.0-rc\.27 · 需修复：startup-failed 检查存储配置/);
  assert.match(text, /应用容器（App Host）：版本 0\.7\.0 · 版本不匹配（要求 >=0\.1\.0 <1\.0\.0）/);
});

test('healthy components show their installed versions and no missing or enable warning', async () => {
  const f = await fixture([component('usage', 'satisfied', {version: '0.2.0-rc.27'}), component('app-host', 'satisfied', {version: '0.6.0'})]);
  const text = textIn(f.render());
  assert.doesNotMatch(text, /套件不完整，缺|已安装但未启用|可分别安装/);
  assert.match(text, /使用记录（Usage）：版本 0\.2\.0-rc\.27 · 已安装/);
  assert.match(text, /应用容器（App Host）：版本 0\.6\.0 · 已安装/);
});

test('clipboard denial or absence preserves the selectable command and offers manual copy', async () => {
  for (const clipboard of [undefined, {writeText: async () => { throw new Error('denied'); }}]) {
    const f = await fixture([component('usage', 'missing')], clipboard);
    const copy = elements(f.render()).find(e => e.type === 'button' && e.children.includes('复制安装/修复命令'));
    assert.ok(copy);assert.match(textIn(f.render()),/macOS \/ Linux/);assert.match(textIn(f.render()),/Windows 安全命令暂未提供/); await copy.props.onClick();
    assert.match(textIn(f.render()), /复制失败，请手动选择并复制上方命令/);
    assert.equal(textIn(elements(f.render()).find(e => e.type === 'code')), command);
  }
});

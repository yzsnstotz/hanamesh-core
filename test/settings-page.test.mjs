import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {SessionController} from '../lib/controller.js';
import {createRouteHandler, ROUTES} from '../lib/routes.js';
import {INITIAL_CORE_SNAPSHOT} from '../lib/contracts.js';
import {memoryStore} from './fixtures/core-store.mjs';

// Exercise the shipped callback and registered components. This is a hook/slot
// fixture; real focus, top-layer layout and HTTP data are checked in the host UI.
async function clientFixture(fetcher) {
  const slots = new Map();
  const timers = [];
  const clearedTimers = [];
  const windowEvents = new EventTarget();
  const documentEvents = new EventTarget();
  let current;
  let hostQueries = 0;
  const React = {
    Fragment: Symbol('Fragment'),
    createElement: (type, props, ...children) => ({type, props: props ?? {}, children}),
    useState(initial) {
      const owner = current; const index = owner.cursor++;
      if (!(index in owner.state)) owner.state[index] = initial;
      return [owner.state[index], next => { owner.state[index] = next; }];
    },
    useRef(value) {
      const owner = current; const index = owner.cursor++;
      if (!(index in owner.state)) owner.state[index] = {current: value};
      return owner.state[index];
    },
    useEffect(run) { current.effects.push(run); },
  };
  let plugin;
  const sandbox = {
    fetch: fetcher,
    URLSearchParams,
    document: {
      visibilityState: 'visible',
      addEventListener: documentEvents.addEventListener.bind(documentEvents),
      removeEventListener: documentEvents.removeEventListener.bind(documentEvents),
      createElement: () => ({dataset: {}, remove() {}}), head: {append() {}},
      querySelector() { hostQueries++; return null; },
      querySelectorAll() { hostQueries++; return []; },
    },
    window: {__ModuleLoader__: {load: spec => { plugin = spec.factory(() => React); }}, open() {},
      addEventListener: windowEvents.addEventListener.bind(windowEvents),
      removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
      setTimeout() {}, setInterval(run) { timers.push(run); return timers.length; }, clearInterval(id) { clearedTimers.push(id); }},
  };
  vm.runInNewContext(await readFile('lib/client.js', 'utf8'), sandbox);
  plugin.apply({effect: run => run(), slots: {
    inject: (_name, run) => run(),
    register: (spec, component) => { slots.set(spec.name, component); return () => {}; },
  }});
  const mount = (component, props = {}) => {
    const owner = {state: [], cursor: 0, effects: []};
    return {render() { current = owner; owner.cursor = 0; owner.effects = []; return component(props); }, effects: () => owner.effects};
  };
  return {slots, mount, timers, clearedTimers, hostQueries: () => hostQueries,
    focus: () => windowEvents.dispatchEvent(new Event('focus')),
    visibility(value) { sandbox.document.visibilityState = value; documentEvents.dispatchEvent(new Event('visibilitychange')); },
  };
}
const elements = tree => tree && typeof tree === 'object' ? [tree, ...tree.children.flatMap(elements)] : [];

test('HanaMesh footer opens complete Core-owned settings without querying host navigation', async () => {
  const f = await clientFixture();
  const footer = f.mount(f.slots.get('sidebar.footer.action'), {wide: true});
  const trigger = elements(footer.render()).find(e => e.props['aria-label'] === '打开 HanaMesh 设置');
  let focuses = 0;
  if (trigger.props.ref) trigger.props.ref.current = {focus() { focuses++; }};
  trigger.props.onClick();
  assert.equal(f.hostQueries(), 0, 'entry must not inspect/click Account or host settings DOM');
  for (const action of ['返回', '关闭']) {
    const pageElement = elements(footer.render()).find(e => typeof e.type === 'function' && e.props.onClose);
    assert.ok(pageElement, 'entry mounts its own complete settings page');
    const page = f.mount(pageElement.type, pageElement.props);
    const tree = page.render();
    assert.equal(tree.type, 'dialog');
    assert.equal(tree.props['data-hanamesh-core-page'], 'settings');
    assert.ok(elements(tree).some(e => e.type === 'h1' && e.children.includes('HanaMesh 设置')));
    assert.ok(elements(tree).some(e => e.type === f.slots.get('settings.section')), 'reuse full real business component');
    let opens = 0; let closes = 0;
    tree.props.ref.current = {open: false, showModal() { this.open = true; opens++; }, close() { closes++; }};
    const cleanups = page.effects().map(run => run());
    assert.equal(opens, 1);
    elements(tree).find(e => e.type === 'button' && e.children.includes(action)).props.onClick();
    assert.equal(focuses, action === '返回' ? 0 : 1, 'focus restoration waits for modal cleanup');
    assert.equal(elements(footer.render()).filter(e => e.props.onClose).length, 0);
    cleanups.forEach(cleanup => cleanup?.());
    assert.equal(closes, 1);
    trigger.props.onClick();
  }
  const reopened = elements(footer.render()).find(e => typeof e.type === 'function' && e.props.onClose);
  const escapePage = f.mount(reopened.type, reopened.props).render();
  let prevented = false;
  escapePage.props.onCancel({preventDefault() { prevented = true; }});
  assert.equal(prevented, true);
  assert.equal(elements(footer.render()).filter(e => e.props.onClose).length, 0);
  assert.equal(focuses, 2);
});

const settle = () => new Promise(resolve => setImmediate(resolve));
const switchIn = section => elements(section.render()).find(e => e.type === 'input' && e.props.type === 'checkbox');
const textIn = tree => typeof tree === 'string' ? tree : tree && typeof tree === 'object' ? tree.children.map(textIn).join(' ') : '';
test('main settings visibly explains registration recovery and its real retry deadline', async t => {
  let state;
  const fixture=await consentSection(path=>path==='/api/hanamesh/core/state'&&state?Response.json(state):undefined);
  t.after(async()=>{fixture.cleanup();await fixture.controller.dispose();});
  state={...fixture.controller.state(),registrationRecovery:{state:'failed',message:'设备重新注册尚未完成，请核对服务端。',nextAttemptAt:'2026-10-16T01:02:03.000Z',principalChanged:false}};
  fixture.f.timers[0]();await settle();
  assert.match(textIn(fixture.section.render()),/设备重新注册尚未完成/);
  const row=elements(fixture.section.render()).find(e=>e.props['data-hanamesh-registration-recovery']==='failed');assert.ok(row);
  assert.ok(elements(row).some(e=>e.type==='time'&&e.props.dateTime==='2026-10-16T01:02:03.000Z'));
});
async function consentSection(override = () => undefined) {
  const memory = memoryStore(INITIAL_CORE_SNAPSHOT);
  const controller = await SessionController.create({serverOrigin: null, websiteOrigin: null}, memory.store);
  const handle = createRouteHandler(controller);
  const f = await clientFixture(async (path, init = {}) => {
    const overridden = override(path, init);
    if (overridden) return overridden;
    return handle(new Request(`http://127.0.0.1:41001${path}`, {...init, headers: {...init.headers, origin: 'http://127.0.0.1:41001', 'sec-fetch-site': 'same-origin'}}));
  });
  const section = f.mount(f.slots.get('settings.section'));
  section.render();
  const cleanups = section.effects().map(run => run());
  await settle();
  return {f, section, controller, memory, cleanup: () => cleanups.forEach(run => run?.())};
}

test('suite repair text shows the safe startup reason and action, and recheck clears it after recovery', async t => {
  const fixture = await consentSection();
  t.after(async () => { fixture.cleanup(); await fixture.controller.dispose(); });
  let repaired = false;
  fixture.controller.attachHealth({getHealth: () => ({revision: 1, mode: repaired ? 'normal' : 'repair', components: [{
    id: 'usage', label: '使用记录', status: repaired ? 'satisfied' : 'failed', version: '0.2.0-rc.27', requiredRange: '>=0.2.0-rc.26 <0.3.0-0',
    reason: repaired ? '正常' : 'invalid-record（hanamesh_usage_events）：本地存储记录不符合当前组件的数据格式。',
    nextStep: repaired ? null : '先备份本地数据，再安装支持此数据格式的组件版本；保留原数据并重新检查。',
  }]}), recheck: async () => { repaired = true; return fixture.controller.service.getHealth(); }});
  fixture.f.timers[0]();
  await settle();
  const failed = textIn(fixture.section.render());
  assert.match(failed, /invalid-record（hanamesh_usage_events）/);
  assert.match(failed, /本地存储记录不符合/);
  assert.match(failed, /先备份本地数据/);
  const button = elements(fixture.section.render()).find(e => e.type === 'button' && e.children.includes('重新检查'));
  button.props.onClick();
  await settle();
  const healthy = textIn(fixture.section.render());
  assert.match(healthy, /使用记录：版本 0\.2\.0-rc\.27 · 已安装/);
  assert.doesNotMatch(healthy, /invalid-record|先备份本地数据/);
});

test('suite repair rows from older providers remain renderable without reason', async t => {
  const fixture = await consentSection();
  t.after(async () => { fixture.cleanup(); await fixture.controller.dispose(); });
  fixture.controller.attachHealth({getHealth: () => ({revision: 1, mode: 'repair', components: [{id: 'usage', label: '使用记录', status: 'failed', version: null, requiredRange: '*', nextStep: 'restore-pinned-component'}]}), recheck: async () => {}});
  fixture.f.timers[0]();
  await settle();
  assert.match(textIn(fixture.section.render()), /使用记录：版本 未知 · 需修复：restore-pinned-component/);
  assert.doesNotMatch(textIn(fixture.section.render()), /undefined/);
});

test('About displays the package release and supported DSH line', async t => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const profile = JSON.parse(await readFile('profile/suite.profile.json', 'utf8'));
  assert.equal(pkg.version, '0.3.19');
  assert.equal(profile.version, pkg.version);
  const fixture = await consentSection();
  t.after(async () => { fixture.cleanup(); await fixture.controller.dispose(); });
  assert.ok(textIn(fixture.section.render()).includes(`hanamesh-core ${pkg.version} · 支持 DSH 0.2.x`));
});

async function bindingSection() {
  const requests = [];
  let bound = false;
  let failure = false;
  let core;
  const fixture = await consentSection((path, init) => {
    requests.push({path, method: init.method ?? 'GET'});
    if (path === ROUTES.bindLink) return Response.json({url: 'https://website.fixture.invalid/me/bind'});
    if (path === ROUTES.openExternal) return Response.json({opened: false});
    if (path === ROUTES.refresh) return failure
      ? Response.json({error: {code: 'CORE_UPSTREAM_UNAVAILABLE'}}, {status: 503})
      : Response.json({...core.state(), session: {...core.service.getSession(), bound}, account: bound ? {provider: 'github', displayName: 'fixture-bound-account'} : null});
    if (path === ROUTES.points) return Response.json({status: 'ready', reason: null, totalPoints: 0, pendingTotal: 0, hanas: [], bound, prompt: {show: false, shownAt: null}});
  });
  core = fixture.controller;
  const bind = () => elements(fixture.section.render()).find(e => e.type === 'button' && e.children.includes('去网站绑定')).props.onClick();
  return {...fixture, requests, bind, setBound: value => { bound = value; }, setFailure: value => { failure = value; }};
}

for (const event of ['focus', 'visibilitychange']) {
  test(`binding return on ${event} forces fresh state and points without a polling limit`, async t => {
    const fixture = await bindingSection();
    t.after(async () => { fixture.cleanup(); await fixture.controller.dispose(); });
    fixture.bind();
    await settle();
    assert.equal(fixture.f.timers.length, 1, 'opening the website must not start a bounded bind timer');
    for (let returns = 0; returns < 13; returns++) {
      if (event === 'focus') fixture.f.focus();
      else fixture.f.visibility('visible');
      await settle();
    }
    assert.equal(fixture.requests.filter(r => r.path === ROUTES.refresh && r.method === 'POST').length, 13);
    fixture.setBound(true);
    if (event === 'focus') fixture.f.focus();
    else fixture.f.visibility('visible');
    await settle();
    const tree = fixture.section.render();
    assert.ok(elements(tree).some(e => e.props['data-hanamesh-core-bound'] === 'true'));
    assert.match(textIn(tree), /已绑定到 GitHub 账号 fixture-bound-account/);
    assert.doesNotMatch(textIn(tree), /只累计、暂不可领/);
  });
}

test('hidden visibility does not refresh and unmount removes both return listeners and the state timer', async t => {
  const fixture = await bindingSection();
  t.after(() => fixture.controller.dispose());
  fixture.f.visibility('hidden');
  await settle();
  assert.equal(fixture.requests.filter(r => r.path === ROUTES.refresh).length, 0);
  fixture.f.visibility('visible');
  await settle();
  assert.equal(fixture.requests.filter(r => r.path === ROUTES.refresh).length, 1);
  fixture.cleanup();
  fixture.f.focus();
  fixture.f.visibility('visible');
  await settle();
  assert.equal(fixture.requests.filter(r => r.path === ROUTES.refresh).length, 1);
  assert.deepEqual(fixture.f.clearedTimers, [1]);
});

test('return refresh errors stay visible and the next focus can read the bound account', async t => {
  const fixture = await bindingSection();
  t.after(async () => { fixture.cleanup(); await fixture.controller.dispose(); });
  fixture.setFailure(true);
  fixture.f.focus();
  await settle();
  assert.match(textIn(fixture.section.render()), /CORE_UPSTREAM_UNAVAILABLE/);
  fixture.setFailure(false);
  fixture.setBound(true);
  fixture.f.focus();
  await settle();
  assert.match(textIn(fixture.section.render()), /fixture-bound-account/);
  assert.doesNotMatch(textIn(fixture.section.render()), /CORE_UPSTREAM_UNAVAILABLE/);
});

for (const [bound, unboundLine, boundRow] of [[true, false, true], [false, true, false], [null, false, false]]) {
  test(`granting consent and refreshing points keeps one bound state (Usage bound=${bound})`, async () => {
    let core;
    const fixture = await consentSection(path => {
      if (core && path === ROUTES.state) return Response.json({...core.state(), session: {...core.service.getSession(), bound}, account: bound ? {provider: 'github', displayName: 'fixture-bound-account'} : null});
      // A stale custody view must not leak into the client: points carry no binding fact of their own.
      if (path === ROUTES.points) return Response.json({status: 'ready', reason: null, bindingStatus: bound ? 'UNBOUND' : 'BOUND', totalPoints: 0, pendingTotal: 0, hanas: [], bound: !bound, prompt: {show: false, shownAt: null}});
    });
    core = fixture.controller;
    switchIn(fixture.section).props.onChange({currentTarget: {checked: true}});
    await settle();
    const tree = fixture.section.render();
    assert.equal(switchIn(fixture.section).props.checked, true);
    assert.equal(elements(tree).find(e => 'data-hanamesh-core-bound' in e.props).props['data-hanamesh-core-bound'], String(bound));
    assert.equal(/已绑定到 GitHub 账号/.test(textIn(tree)), boundRow);
    assert.equal(/只累计、暂不可领/.test(textIn(tree)), unboundLine);
    fixture.cleanup();
    await core.dispose();
  });
}

test('consent UI reads the saved grant and withdrawal through Core routes', async () => {
  const {section, controller, memory} = await consentSection();
  assert.equal(switchIn(section).props.checked, false);
  switchIn(section).props.onChange({currentTarget: {checked: true}});
  await settle();
  assert.equal(switchIn(section).props.checked, true);
  assert.equal(controller.service.getConsent(), 'granted');
  switchIn(section).props.onChange({currentTarget: {checked: false}});
  await settle();
  assert.equal(switchIn(section).props.checked, false);
  const reopened = await SessionController.create({serverOrigin: null, websiteOrigin: null}, memoryStore(memory.read()).store);
  assert.equal(reopened.service.getConsent(), 'withheld');
  await controller.dispose();
  await reopened.dispose();
});

test('J2S1: HanaMesh section shows device identity and a default-off consent switch whose status and service effect follow each toggle', async () => {
  const {section, controller} = await consentSection();
  const statusText = () => textIn(elements(section.render()).find(e => e.props.role === 'status'));
  const tree = section.render();
  assert.equal(tree.type, 'section');
  assert.ok(elements(tree).some(e => e.type === 'h2' && e.children.includes('HanaMesh')));
  const identity = elements(tree).find(e => e.props['data-hanamesh-core-identity']);
  assert.ok(identity, 'device identity row is in the same section');
  assert.equal(identity.props['data-hanamesh-core-device'], controller.service.getDeviceId());
  assert.equal(switchIn(section).props.checked, false, 'fresh device starts withheld');
  assert.equal(statusText(), '当前：已关闭');
  const seen = [];
  controller.service.onConsentChange(state => seen.push(state));
  switchIn(section).props.onChange({currentTarget: {checked: true}});
  await settle();
  assert.equal(controller.service.getConsent(), 'granted', 'C-CORE getConsent sees the grant without a reload');
  assert.deepEqual(seen, ['granted']);
  assert.equal(statusText(), '当前：已开启');
  switchIn(section).props.onChange({currentTarget: {checked: false}});
  await settle();
  assert.equal(controller.service.getConsent(), 'withheld');
  assert.deepEqual(seen, ['granted', 'withheld']);
  assert.equal(statusText(), '当前：已关闭');
  await controller.dispose();
});

test('consent UI disables the switch until its write and authoritative read finish', async () => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const {section, controller} = await consentSection((path, init) => path === ROUTES.consent && init.method === 'POST' ? waiting.then(() => Response.json({state: 'granted'})) : undefined);
  switchIn(section).props.onChange({currentTarget: {checked: true}});
  assert.equal(switchIn(section).props.disabled, true);
  assert.match(textIn(section.render()), /正在保存/);
  release();
  await settle();
  assert.equal(switchIn(section).props.disabled, false);
  await controller.dispose();
});

test('consent write failure remains explicit after the regular state poll succeeds', async () => {
  const {f, section, controller} = await consentSection((path, init) => path === ROUTES.consent && init.method === 'POST' ? Response.json({error: {code: 'CORE_STORAGE_UNAVAILABLE'}}, {status: 503}) : undefined);
  switchIn(section).props.onChange({currentTarget: {checked: true}});
  await settle();
  assert.match(textIn(section.render()), /CORE_STORAGE_UNAVAILABLE/);
  f.timers[0]();
  await settle();
  assert.match(textIn(section.render()), /CORE_STORAGE_UNAVAILABLE/);
  assert.equal(switchIn(section).props.checked, false);
  assert.equal(controller.service.getConsent(), 'withheld');
  await controller.dispose();
});

test('consent UI cannot claim a confirmed save when the readback disagrees', async () => {
  const {section, controller} = await consentSection((path, init) => path === ROUTES.consent && init.method === 'POST' ? Response.json({state: 'granted'}) : undefined);
  switchIn(section).props.onChange({currentTarget: {checked: true}});
  await settle();
  assert.match(textIn(section.render()), /授权保存未确认.*CORE_CONSENT_NOT_CONFIRMED/);
  assert.equal(switchIn(section).props.checked, false);
  await controller.dispose();
});

test('settings section shows a failed shared identity with its location and repairs it in place', async t => {
  const {mkdtemp, mkdir, writeFile, rm} = await import('node:fs/promises');
  const {tmpdir} = await import('node:os');
  const {join} = await import('node:path');
  const {fileSharedDeviceStore} = await import('../lib/shared-device.js');
  const root = await mkdtemp(join(tmpdir(), 'hm-settings-identity-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const file = join(root, 'identity', 'device.json');
  await mkdir(join(root, 'identity'), {recursive: true});
  await writeFile(file, 'broken');
  const controller = await SessionController.create({serverOrigin: null, websiteOrigin: null}, memoryStore(INITIAL_CORE_SNAPSHOT).store, {sharedDevice: fileSharedDeviceStore(root)});
  const handle = createRouteHandler(controller);
  const f = await clientFixture(async (path, init = {}) => handle(new Request(`http://127.0.0.1:41001${path}`, {...init, headers: {...init.headers, origin: 'http://127.0.0.1:41001', 'sec-fetch-site': 'same-origin'}})));
  const section = f.mount(f.slots.get('settings.section'));
  section.render();
  section.effects().forEach(run => run());
  await settle();
  const tree = section.render();
  const row = elements(tree).find(e => e.props['data-hanamesh-core-identity'] === 'failed');
  assert.ok(row, 'identity failure is rendered in the settings section');
  assert.match(textIn(row), /设备身份文件已损坏/);
  assert.match(textIn(row), new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(textIn(row), /不会自动新建身份/);
  await rm(file);
  elements(tree).find(e => e.type === 'button' && textIn(e).includes('重新读取设备身份')).props.onClick();
  // The repair does real file I/O on the thread pool, which outlasts any fixed number of event-loop turns.
  let repaired;
  for (const deadline = Date.now() + 5_000; Date.now() < deadline;) {
    await new Promise(resolve => setTimeout(resolve, 10));
    repaired = elements(section.render()).find(e => e.props['data-hanamesh-core-identity']);
    if (repaired.props['data-hanamesh-core-identity'] !== 'failed') break;
  }
  assert.equal(repaired.props['data-hanamesh-core-identity'], 'shared');
  assert.match(textIn(repaired), /本机共享/);
  assert.equal(repaired.props['data-hanamesh-core-device'], controller.service.getDeviceId());
  await controller.dispose();
});

test('settings section names a replaced identity after a conflict', async t => {
  const {mkdtemp, rm} = await import('node:fs/promises');
  const {tmpdir} = await import('node:os');
  const {join} = await import('node:path');
  const {fileSharedDeviceStore} = await import('../lib/shared-device.js');
  const {createDevice} = await import('../lib/device.js');
  const root = await mkdtemp(join(tmpdir(), 'hm-settings-conflict-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  await fileSharedDeviceStore(root).claim(createDevice());
  const own = createDevice();
  const controller = await SessionController.create({serverOrigin: null, websiteOrigin: null}, memoryStore({...INITIAL_CORE_SNAPSHOT, device: own}).store, {sharedDevice: fileSharedDeviceStore(root)});
  const handle = createRouteHandler(controller);
  const f = await clientFixture(async (path, init = {}) => handle(new Request(`http://127.0.0.1:41001${path}`, init)));
  const section = f.mount(f.slots.get('settings.section'));
  section.render();
  section.effects().forEach(run => run());
  await settle();
  const row = elements(section.render()).find(e => e.props['data-hanamesh-core-identity'] === 'shared');
  assert.match(textIn(row), new RegExp(`${own.deviceId.slice(0, 8)}`));
  assert.match(textIn(row), /已保留在本客户端/);
  await controller.dispose();
});

async function coreSection(t, config, snapshot = INITIAL_CORE_SNAPSHOT, fetcher = async () => Response.json({}, {status: 404})) {
  const memory = memoryStore(snapshot);
  const controller = await SessionController.create({websiteOrigin: null, ...config}, memory.store, {fetcher});
  t.after(() => controller.dispose());
  const handle = createRouteHandler(controller);
  const requests = [];
  const f = await clientFixture(async (path, init = {}) => {
    requests.push({path, method: init.method ?? 'GET', body: init.body});
    return handle(new Request(`http://127.0.0.1:41001${path}`, {...init, headers: {...init.headers, origin: 'http://127.0.0.1:41001', 'sec-fetch-site': 'same-origin'}}));
  });
  const section = f.mount(f.slots.get('settings.section'));
  section.render();
  const cleanups = section.effects().map(run => run());
  t.after(() => cleanups.forEach(run => run?.()));
  await settle();
  return {f, section, controller, memory, requests};
}
const serverRow = section => elements(section.render()).find(e => e.props['data-hanamesh-core-server']);
const buttonIn = (tree, label) => elements(tree).find(e => e.type === 'button' && textIn(e).includes(label));

test('服务端 row shows the effective address and its source, saves a new one and restores the default', async t => {
  const {section, controller, requests} = await coreSection(t, {serverOrigin: 'https://api.fixture.invalid'});
  let row = serverRow(section);
  assert.ok(row, 'server row is rendered');
  assert.equal(row.props['data-hanamesh-core-server'], 'config');
  assert.match(textIn(row), /https:\/\/api\.fixture\.invalid/);
  assert.match(textIn(row), /出厂默认/);
  const input = () => elements(serverRow(section)).find(e => e.type === 'input');
  input().props.onChange({currentTarget: {value: 'http://127.0.0.1:49151'}});
  buttonIn(serverRow(section), '保存').props.onClick();
  await settle();
  row = serverRow(section);
  assert.equal(row.props['data-hanamesh-core-server'], 'setting');
  assert.match(textIn(row), /你设置的/);
  assert.match(textIn(row), /http:\/\/127\.0\.0\.1:49151/);
  assert.equal(controller.service.getServerOrigin(), 'http://127.0.0.1:49151');
  assert.deepEqual(JSON.parse(requests.find(r => r.path === ROUTES.server).body), {serverOrigin: 'http://127.0.0.1:49151'});

  input().props.onChange({currentTarget: {value: 'http://evil.fixture.invalid'}});
  buttonIn(serverRow(section), '保存').props.onClick();
  await settle();
  assert.match(textIn(serverRow(section)), /地址无效/);
  assert.equal(controller.service.getServerOrigin(), 'http://127.0.0.1:49151', 'an invalid address changes nothing');

  buttonIn(serverRow(section), '恢复默认').props.onClick();
  await settle();
  row = serverRow(section);
  assert.equal(row.props['data-hanamesh-core-server'], 'config');
  assert.match(textIn(row), /出厂默认/);
  assert.doesNotMatch(textIn(row), /地址无效/);
  assert.equal(controller.service.getServerOrigin(), 'https://api.fixture.invalid');
});

test('an unregistered device with consent withheld says registration waits for consent; bind explains the same', async t => {
  const {section} = await coreSection(t, {serverOrigin: 'https://api.fixture.invalid', websiteOrigin: 'https://web.fixture.invalid'});
  const tree = section.render();
  assert.match(textIn(tree), /未注册：打开数据授权后注册/);
  buttonIn(tree, '去网站绑定').props.onClick();
  await settle();
  assert.match(textIn(section.render()), /打开数据授权后才会向服务端注册设备/);
});

test('contribution labels follow contributionWindowDays and an incomplete window is marked as such', async t => {
  const snapshot = {...INITIAL_CORE_SNAPSHOT, consent: {state: 'granted', changedAt: '2026-10-15T00:00:00.000Z'}};
  const fetcher = async url => String(url).includes('/v1/usage/me/contributions')
    ? Response.json({availability: 'unavailable', byHana: [{actions: {install: 1, open: 2, use: 3, uninstall: 0}}]})
    : Response.json({}, {status: 404});
  const {f, section, controller} = await coreSection(t, {serverOrigin: 'https://api.fixture.invalid', contributionWindowDays: 30}, snapshot, fetcher);
  await controller.refreshContributions();
  f.timers[0](); // the regular state poll
  await settle();
  const tree = section.render();
  const text = textIn(tree);
  assert.match(text, /本设备近 30 天贡献事件/);
  assert.match(text, /贡献窗口 30 天/);
  assert.doesNotMatch(text, /近 90 天/);
  assert.match(text, /窗口：近 30 天/);
  assert.match(text, /服务端只保留了这个窗口的一部分记录，数字不完整/);
  assert.match(text, /install 1 · open 2 · use 3/);
});


test('main settings show the actual version for installed, inactive and failed components, and mark unread versions', async t => {
  const fixture = await consentSection();
  t.after(async () => {fixture.cleanup();await fixture.controller.dispose();});
  const components = [
    {id:'usage',label:'使用记录',status:'failed',version:'0.2.0-rc.33',requiredRange:'>=0.2.0-rc.26 <0.3.0-0',reason:'真实加载错误',nextStep:'重新安装'},
    {id:'app-host',label:'应用宿主',status:'inactive',version:'0.6.2',requiredRange:'*',nextStep:null},
    {id:'unknown',label:'未读组件',status:'failed',version:null,requiredRange:'0.9.9',nextStep:null},
  ];
  fixture.controller.attachHealth({getHealth:()=>({revision:1,mode:'repair',components}),recheck:async()=>{}});
  fixture.f.timers[0]();await settle();const text=textIn(fixture.section.render());
  assert.match(text,/使用记录：版本 0\.2\.0-rc\.33 · 需修复：真实加载错误/);
  assert.match(text,/应用宿主：版本 0\.6\.2 · 已安装但未启用/);
  assert.match(text,/未读组件：版本 未知 · 需修复/);
  assert.doesNotMatch(text,/未读组件：版本 0\.9\.9/,'a required range cannot pretend to be the installed version');
  const pkg=JSON.parse(await readFile('package.json','utf8'));assert.ok(text.includes(`HanaMesh Core：版本 ${pkg.version}`));
});

test('Core own page discovers the real source state and offers explicit preserve/disable/custom controls',async t=>{
 const state={protocolVersion:'1',status:'disabled',selection:'configured',registry:null,archiveCount:0,lastError:null,configuration:{configured:null,selection:{mode:'configured'}}};const calls=[];
 const fixture=await consentSection((path,init)=>{if(path!=='/api/hanamesh/core/suite-source')return undefined;calls.push({path,init:init??{}});return Response.json(state)});t.after(async()=>{fixture.cleanup();await fixture.controller.dispose()});
 const element=elements(fixture.section.render()).find(e=>typeof e.type==='function'&&e.props['data-suite-source-section']===true);assert.ok(element,'Core-owned settings must render its source section');
 // Mount the actual shipped component against its own declared source API.
 const page=fixture.f.mount(element.type);page.render();const cleanup=page.effects().map(run=>run());await settle();t.after(()=>cleanup.forEach(f=>f?.()));
 assert.match(textIn(page.render()),/本机套件来源/);assert.match(textIn(page.render()),/未配置/);const controls=elements(page.render());assert(controls.some(e=>e.type==='textarea'&&e.props['aria-label']==='本机来源配置'));assert(controls.some(e=>e.type==='button'&&e.children.includes('停用本机来源')));assert(controls.some(e=>e.type==='button'&&e.children.includes('使用插件配置')));assert.equal(calls[0].path,'/api/hanamesh/core/suite-source');assert.equal(calls.filter(c=>c.init.method==='POST').length,0,'opening page is read-only');
 const input=controls.find(e=>e.type==='textarea');input.props.onChange({currentTarget:{value:'not JSON'}});elements(page.render()).find(e=>e.type==='button'&&e.children.includes('保存本机来源')).props.onClick();await settle();assert.equal(calls.filter(c=>c.init.method==='POST').length,0);assert.match(textIn(page.render()),/CORE_SUITE_SOURCE_CONFIG_INVALID/);
 elements(page.render()).find(e=>e.type==='button'&&e.children.includes('停用本机来源')).props.onClick();await settle();assert.deepEqual(JSON.parse(calls.find(c=>c.init.method==='POST').init.body),{mode:'disabled'});
});

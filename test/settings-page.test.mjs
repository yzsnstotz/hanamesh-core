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
      createElement: () => ({dataset: {}, remove() {}}), head: {append() {}},
      querySelector() { hostQueries++; return null; },
      querySelectorAll() { hostQueries++; return []; },
    },
    window: {__ModuleLoader__: {load: spec => { plugin = spec.factory(() => React); }}, setTimeout() {}, setInterval(run) { timers.push(run); return timers.length; }, clearInterval() {}},
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
  return {slots, mount, timers, hostQueries: () => hostQueries};
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
  section.effects().forEach(run => run());
  await settle();
  return {f, section, controller, memory};
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

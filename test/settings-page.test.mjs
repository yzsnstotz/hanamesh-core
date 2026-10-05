import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// Exercise the shipped callback and registered components. This is a hook/slot
// fixture; real focus, top-layer layout and HTTP data are checked in the host UI.
async function clientFixture() {
  const slots = new Map();
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
    document: {
      createElement: () => ({dataset: {}, remove() {}}), head: {append() {}},
      querySelector() { hostQueries++; return null; },
      querySelectorAll() { hostQueries++; return []; },
    },
    window: {__ModuleLoader__: {load: spec => { plugin = spec.factory(() => React); }}, setTimeout() {}},
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
  return {slots, mount, hostQueries: () => hostQueries};
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
  assert.equal(focuses, 3);
});

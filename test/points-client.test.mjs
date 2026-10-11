import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createPointsContractExamples} from '@hanamesh/api-contracts/points';

const bundle = await readFile('lib/client.js', 'utf8');
const examples = createPointsContractExamples();
// Render the shipped settings component through its actual slot, with host-supplied React hooks.
function renderPoints(points, bound) {
  const core = {
    serverOrigin: 'https://server.example', websiteOrigin: 'https://web.example', deviceId: 'device',
    identity: {status: 'local-only', replacedDeviceIds: []}, registration: {status: 'registered'},
    consent: {state: 'granted'}, session: {bound}, account: null,
    contributions: {status: 'unavailable', reason: 'NOT_CONNECTED'}, health: {}, components: [],
  };
  const states = [core, points, null, false, null, false, null];
  const react = {
    Fragment: Symbol('Fragment'),
    createElement: (type, props, ...children) => typeof type === 'function' ? type({...props, children}) : {props, children},
    useState: () => [states.shift(), () => {}], useRef: value => ({current: value}), useEffect: () => {},
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

test('UNBOUND zero points show 只累计、暂不可领 even when the contributions session says bound', () => {
  const text = renderPoints({...examples.unboundZero, status: 'ready', pendingTotal: 0}, true);
  assert.match(text, /只累计、暂不可领/);
  assert.match(text, /还没有分/);
});

test('BOUND zero points do not show the unbound restriction or promise claimability', () => {
  const text = renderPoints({...examples.boundZero, status: 'ready', pendingTotal: 0}, false);
  assert.doesNotMatch(text, /只累计、暂不可领|已可领|可以领取/);
});

test('UNBOUND accumulated points preserve totals and pending amounts alongside the restriction', () => {
  const text = renderPoints({status: 'ready', bindingStatus: 'UNBOUND', totalPoints: 5, pendingTotal: 5,
    hanas: [{hanaId: 'hana', displayName: 'Example Hana', points: 0, pending: 5, breakdown: {install: 0, open: 0, use: 0, claimBonus: 0, creatorMirror: 0, launchInitiator: 0}}]}, false);
  assert.match(text, /只累计、暂不可领/);
  assert.match(text, /总计 5 分/);
  assert.match(text, /其中待绑定 5 分/);
});

test('unavailable points do not assert an unbound state', () => {
  assert.doesNotMatch(renderPoints({status: 'unavailable', reason: 'CORE_UPSTREAM_UNAVAILABLE'}, false), /只累计、暂不可领/);
});

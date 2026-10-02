/** Real-browser host page for the one-time bind prompt (P05-CORE-01).
 *
 *  What is real: Chrome, React 18.3.1 + ReactDOM 18.3.1 (the host-supplied pair), the built `lib/client.js` bundle exactly
 *  as packed, the `__ModuleLoader__` contract, and the host's settings concealment rule.
 *
 *  The concealment rule is copied rule-for-rule from the desktop host that reproduced the failure:
 *  `hanamesh-desktop-tauri/packages/dsh-tauri-ui/src/client/register/obstructions.ts` (dist/client.cjs SHA256
 *  b3f2c9ccc2cace9c460f3ac2a8df6b43f65d6eeff83c6bbb367da65c77829e90, the bytes in the failing P05 A install):
 *  while `.dshp-settings-sidebar` exists, the PARENT of each `[data-slot="sidebar|main|rightbar"]` plus every
 *  `[data-dsh-better-sidebar]`/`[data-dsh-panel]` gets `display:none !important; width:0 !important`, reconciled by a
 *  MutationObserver on the document root. The settings page itself lives in `shell.overlay`, outside those parents.
 *
 *  The Core host routes are an in-memory double of `GET /points` + `POST /points/prompt-shown` with the contract the real
 *  controller keeps (test/points.test.mjs): `prompt.show` is true until the marker is stamped, then false with `shownAt`. */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const REACT = resolve('node_modules/react/umd/react.development.js');
const REACT_DOM = resolve('node_modules/react-dom/umd/react-dom.development.js');

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>host</title>
<style>
html,body{margin:0;height:100%;font:14px system-ui}
#app{display:flex;height:100%}
.col{display:flex;flex-direction:column}
[data-slot=sidebar]{width:260px;height:100%;display:flex;flex-direction:column;justify-content:flex-end;padding:8px;box-sizing:border-box;border-right:1px solid #ddd}
[data-slot=main]{flex:1;padding:16px}
.dshp-settings-sidebar{position:absolute;inset:0;background:#fafafa;padding:24px}
.dshp-settings-sidebar button,.dshp-settings-sidebar label{display:block;margin:12px 0;padding:8px 14px;font:inherit}
</style></head><body>
<div id="app">
  <div class="col" id="sidebar-parent"><aside data-slot="sidebar"><div id="footer"></div></aside></div>
  <div class="col" id="main-parent" style="flex:1"><main data-slot="main"><button id="composer" type="button">composer</button></main></div>
  <div class="col" id="rightbar-parent"><div data-slot="rightbar"></div></div>
  <div id="overlay"></div>
</div>
<script>
(() => {
  // Accelerate only the Core poll cadences (60 s / 10 s) so a test sees several ticks in about a second.
  const realSetInterval = window.setInterval.bind(window);
  window.setInterval = (fn, ms, ...rest) => realSetInterval(fn, ms >= 10000 ? Math.max(20, Math.round(ms / 300)) : ms, ...rest);
  const hm = window.__hm = {opened: [], stampAudit: [], backClicks: 0, composerClicks: 0, errors: []};
  window.addEventListener('error', event => hm.errors.push(String(event.message)));
  window.open = (url) => { hm.opened.push(String(url)); return null; };
  const visiblePrompt = () => {
    const node = document.querySelector('dialog[data-hanamesh-core-prompt]');
    if (!node || !node.open) return false;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    if (typeof node.checkVisibility === 'function' && !node.checkVisibility()) return false;
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return Boolean(hit && node.contains(hit));
  };
  hm.visiblePrompt = visiblePrompt;
  // Audit: what was on screen at the moment Core asked the host to persist the one-time marker.
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const path = typeof input === 'string' ? input : input.url;
    if (path.endsWith('/points/prompt-shown')) hm.stampAudit.push({visible: visiblePrompt(), at: Date.now()});
    return realFetch(input, init);
  };
  // dsh-tauri-ui settings obstructions, rule-for-rule (see the fixture header for the pinned source).
  const previous = new Map();
  const targets = () => {
    const anchors = ['sidebar', 'main', 'rightbar'].map(key => document.querySelector('[data-slot="' + key + '"]')).map(anchor => anchor ? (anchor.parentElement || anchor) : null);
    const overlays = ['[data-dsh-better-sidebar]', '[data-dsh-panel]'].flatMap(selector => [...document.querySelectorAll(selector)]);
    return [...new Set([...anchors, ...overlays].filter(Boolean))];
  };
  const conceal = () => { for (const element of targets()) { if (!previous.has(element)) previous.set(element, {d: element.style.getPropertyValue('display'), dp: element.style.getPropertyPriority('display'), w: element.style.getPropertyValue('width'), wp: element.style.getPropertyPriority('width')}); element.style.setProperty('display', 'none', 'important'); element.style.setProperty('width', '0', 'important'); } };
  const restoreProp = (style, prop, value, priority) => { if (value !== '') style.setProperty(prop, value, priority); else style.removeProperty(prop); };
  const restore = () => { for (const [element, s] of previous) { restoreProp(element.style, 'display', s.d, s.dp); restoreProp(element.style, 'width', s.w, s.wp); } previous.clear(); };
  const reconcile = () => { if (document.querySelector('.dshp-settings-sidebar') === null) restore(); else conceal(); };
  new MutationObserver(reconcile).observe(document.documentElement, {attributeFilter: ['data-dsh-better-sidebar', 'data-slot'], attributes: true, childList: true, subtree: true});
  hm.openSettings = () => {
    if (document.querySelector('.dshp-settings-sidebar')) return;
    const panel = document.createElement('div'); panel.className = 'dshp-settings-sidebar';
    const back = document.createElement('button'); back.type = 'button'; back.id = 'back'; back.textContent = 'Back to app';
    back.addEventListener('click', () => { hm.backClicks += 1; panel.remove(); });
    const consent = document.createElement('label'); consent.innerHTML = '<input id="consent" type="checkbox"> 数据授权';
    panel.append(back, consent);
    document.getElementById('overlay').append(panel);
  };
  hm.settingsOpen = () => document.querySelector('.dshp-settings-sidebar') !== null;
  document.getElementById('composer').addEventListener('click', () => { hm.composerClicks += 1; });
})();
</script>
<script src="/react.js"></script><script src="/react-dom.js"></script>
<script>
(() => {
  const hm = window.__hm;
  window.__ModuleLoader__ = {load({factory}) { hm.module = factory(name => { if (name === 'react') return window.React; throw new Error('UNEXPECTED_REQUIRE ' + name); }); }};
})();
</script>
<script src="/client.js"></script>
<script>
(() => {
  const hm = window.__hm;
  const registered = new Map();
  const ctx = {
    slots: {inject: (_name, run) => run(), register: (spec, component) => { registered.set(spec.name, component); return () => registered.delete(spec.name); }},
    effect: (run) => { hm.disposeClient = run(); },
  };
  hm.module.apply(ctx);
  const root = ReactDOM.createRoot(document.getElementById('footer'));
  hm.mountFooter = () => root.render(React.createElement(registered.get('sidebar.footer.action'), {wide: true}));
  hm.unmountFooter = () => root.render(null);
  if (!location.search.includes('nomount')) hm.mountFooter();
})();
</script>
</body></html>`;

export async function startPromptHost({bundle = process.env.HM_CORE_CLIENT_BUNDLE ?? 'lib/client.js'} = {}) {
  const files = {'/react.js': await readFile(REACT), '/react-dom.js': await readFile(REACT_DOM), '/client.js': await readFile(resolve(bundle))};
  const state = {armed: false, pendingTotal: 15, shownAt: null, stamps: 0, pointsReads: 0, bindLinks: 0, openExternal: []};
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://host');
    const json = (status, body) => { response.writeHead(status, {'content-type': 'application/json'}); response.end(JSON.stringify(body)); };
    let body = '';
    for await (const chunk of request) body += chunk;
    if (url.pathname === '/') { response.writeHead(200, {'content-type': 'text/html; charset=utf-8'}); response.end(PAGE); return; }
    if (files[url.pathname]) { response.writeHead(200, {'content-type': 'text/javascript'}); response.end(files[url.pathname]); return; }
    if (url.pathname === '/api/hanamesh/core/points' && request.method === 'GET') {
      state.pointsReads += 1;
      const pending = state.armed ? state.pendingTotal : 0;
      json(200, {status: 'ready', reason: null, totalPoints: 0, pendingTotal: pending, hanas: [], bound: false, prompt: {show: pending > 0 && state.shownAt === null, shownAt: state.shownAt}});
      return;
    }
    if (url.pathname === '/api/hanamesh/core/points/prompt-shown' && request.method === 'POST') {
      state.stamps += 1;
      state.shownAt ??= new Date().toISOString();
      json(200, {shownAt: state.shownAt});
      return;
    }
    if (url.pathname === '/api/hanamesh/core/bind-link' && request.method === 'POST') { state.bindLinks += 1; json(200, {url: 'https://hanamesh.invalid/bind?challenge=fixture'}); return; }
    if (url.pathname === '/api/hanamesh/core/open-external' && request.method === 'POST') { state.openExternal.push(JSON.parse(body || '{}').url); json(200, {ok: true}); return; }
    json(404, {error: {code: 'NOT_FOUND'}});
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {origin, state, close: () => new Promise(resolve => server.close(resolve))};
}

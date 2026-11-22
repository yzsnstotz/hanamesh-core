import {createElement, Fragment, useEffect, useRef, useState, version as reactVersion, type ReactNode} from 'react';
import type {Modal as DSHModal, isBehindModal as DSHIsBehindModal} from '@deepseek-ai/dsh-client-ui-primitives';

/** The declared client inject is already supplied by DSH's ModuleLoader. Resolve
 * its public UI face only while rendering UI, so importing portable client helpers
 * in Node never executes a browser CSS module or imports a second host runtime. */
function hostPrimitives(): {Modal: typeof DSHModal; isBehindModal: typeof DSHIsBehindModal} {
  return require('@deepseek-ai/dsh-client-ui-primitives') as {Modal: typeof DSHModal; isBehindModal: typeof DSHIsBehindModal};
}

interface CoreModalProps {title: string; onClose: () => void; className: string; children?: ReactNode; onDisplayed?: () => void; onDisplayError?: () => void}
/** Admit a background Core layer only when DSH's public modal stack permits it.
 * Observe portal mutations, not clocks: no host selectors, inert writes, retries
 * or custom z-index. After admission DSH itself owns every later overlay. */
export function CoreModal({title, onClose, className, children, onDisplayed, onDisplayError}: CoreModalProps): ReactNode {
  const anchor = useRef<HTMLSpanElement | null>(null);
  const content = useRef<HTMLDivElement | null>(null);
  const [admitted, setAdmitted] = useState(false);
  const displayed = useRef(false);
  const {Modal, isBehindModal} = hostPrimitives();
  useEffect(() => {
    const node = anchor.current;
    if (!node) return;
    let active = true;
    const admit = (): void => {
      if (!active || isBehindModal(node)) return;
      observer.disconnect();
      setAdmitted(true);
    };
    const observer = new MutationObserver(admit);
    observer.observe(node.ownerDocument.body, {childList: true, subtree: true});
    admit();
    return () => { active = false; observer.disconnect(); };
  }, []);
  useEffect(() => {
    if (!admitted || displayed.current || (!onDisplayed && !onDisplayError)) return;
    let active = true;
    const acknowledge = (): void => {
      if (!active || displayed.current) return;
      const node = content.current;
      if (!node?.isConnected) { displayed.current = true; observer.disconnect(); onDisplayError?.(); return; }
      if (isBehindModal(node)) return;
      displayed.current = true;
      observer.disconnect();
      onDisplayed?.();
    };
    const observer = new MutationObserver(acknowledge);
    observer.observe(anchor.current!.ownerDocument.body, {childList: true, subtree: true});
    acknowledge();
    return () => { active = false; observer.disconnect(); };
  }, [admitted, onDisplayed, onDisplayError]);
  return createElement(Fragment, null,
    createElement('span', {hidden: true, ref: anchor, 'data-hanamesh-core-modal-anchor': title}),
    createElement(Modal, {open: admitted, onClose, title, headless: true, className},
      createElement('div', {ref: content, className: 'hm-core-modal-content'}, children)));
}

/** Structural subset of Connection's public client contract; optional for older supported peers. */
interface PeerConnection {
  generation?: {getSnapshot(): {id: number} | undefined; subscribe(listener: () => void): () => void};
}

export interface SlotRegistry {
  entries?(name: string): readonly {options: {id?: string; label?: string; order?: number}}[];
  entriesOfSlot?(name: string): readonly {options: {id?: string; label?: string; order?: number}}[];
  subscribe?(name: string, listener: () => void): () => void;
  snapshot?(name: string): readonly unknown[];
  inject(name: string, run: () => (() => void)): () => void;
  register(spec: {name: string; id?: string; key?: string; order?: number; label?: string; children?: Record<string, {kind: 'list'; scope: 'root'}>}, component: unknown): () => void;
}
interface ClientContext {slots: SlotRegistry; connection?: PeerConnection; layout?: {selectPanel(id: string | null): void}; inject?(names: string[], run: (ctx: ClientContext) => void): unknown; effect(run: () => (() => void), label?: string): unknown}

/** Current external React observation only. No storage, timers, retries or backend dependency inference. */
export function startClientPeerLease(connection: PeerConnection | undefined, page: Pick<Window, 'addEventListener' | 'removeEventListener'>, doFetch: typeof fetch | undefined = typeof fetch === 'function' ? fetch : undefined): () => void {
  const generation = connection?.generation;
  if (typeof generation?.getSnapshot !== 'function' || typeof generation.subscribe !== 'function' || typeof doFetch !== 'function') return () => {};
  const pageId = crypto.randomUUID();
  let current: number | undefined, active: AbortController | undefined, hidden = false, disposed = false;
  const withdraw = (): void => {active?.abort(); active = undefined;};
  const observe = (): void => {
    if (disposed || hidden) return;
    const next = generation.getSnapshot()?.id;
    if (next === current) return;
    withdraw(); current = next;
    if (!next) return;
    const invocation = new AbortController(); active = invocation;
    const payload = {protocol: 2, pageId, activationId: crypto.randomUUID(), generation: next, reactVersion};
    const failed = (code: string): void => {
      if (disposed || invocation.signal.aborted) return;
      invocation.abort();
      console.error('HanaMesh Core client peer observation:', code);
    };
    try {void doFetch('/api/hanamesh/core/client-peer-lease', {method: 'POST', credentials: 'same-origin', headers: {'content-type': 'application/json'}, body: JSON.stringify(payload), signal: invocation.signal}).then(async response => {
      if (invocation.signal.aborted || disposed) return;
      let code = 'CORE_SUITE_CLIENT_PEER_ENDED';
      if (!response.ok) {
        try {const value = await response.json() as {error?: {code?: unknown}}; code = typeof value.error?.code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(value.error.code) ? value.error.code : 'CORE_SUITE_CLIENT_PEER_RESPONSE_INVALID';}
        catch {code = 'CORE_SUITE_CLIENT_PEER_RESPONSE_INVALID';}
      }
      if (!response.ok) {failed(code); return;}
      if (response.headers.get('content-type') !== 'application/octet-stream' || !response.body) {failed('CORE_SUITE_CLIENT_PEER_RESPONSE_INVALID'); return;}
      const reader = response.body.getReader(), frame = new TextEncoder().encode('hanamesh-core-client-peer-lease/2\n');
      let offset = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) {failed(offset === frame.length ? code : 'CORE_SUITE_CLIENT_PEER_RESPONSE_INVALID'); break;}
          for (const byte of chunk.value) {
            if (offset === frame.length) offset = 0;
            if (byte !== frame[offset++]) {failed('CORE_SUITE_CLIENT_PEER_RESPONSE_INVALID'); await reader.cancel(); return;}
          }
        }
      } finally {reader.releaseLock();}
    }).catch(() => failed('CORE_SUITE_CLIENT_PEER_TRANSPORT_FAILED'));}
    catch {failed('CORE_SUITE_CLIENT_PEER_TRANSPORT_FAILED');}
  };
  const hide = (): void => {hidden = true; current = undefined; withdraw();};
  const show = (): void => {if (!hidden) return; hidden = false; observe();};
  const unsubscribe = generation.subscribe(observe);
  page.addEventListener('pagehide', hide); page.addEventListener('pageshow', show);
  observe();
  return () => {disposed = true; withdraw(); unsubscribe(); page.removeEventListener('pagehide', hide); page.removeEventListener('pageshow', show);};
}

const CORE_VERSION = '0.3.41';
type CorePage = 'account' | 'configuration' | 'diagnostics';
/** Root-scoped, versioned owner contract. Modules declare their own id/label/order. */
export interface HanaMeshTabProps {
  readonly version: 1;
  readonly navigateTab: (id: string) => void;
  readonly openPlugins: () => void;
}
export interface CorePluginTabOwner {
  readonly install?: unknown;
  readonly openPackage?: unknown;
  readonly update?: unknown;
}
/** rc.1 has install/openPackage; later peers may also offer update. Never call absent methods. */
export function corePluginCapabilities(owner: CorePluginTabOwner | undefined): {install: boolean; openPackage: boolean; update: boolean} {
  return {install: typeof owner?.install === 'function', openPackage: typeof owner?.openPackage === 'function', update: typeof owner?.update === 'function'};
}
let selectCorePage: ((id: string | null) => void) | undefined;
let selectHanaMeshTab: ((id: string) => void) | undefined;
let requestedTab = 'home';
function openCoreAccount(): void {requestedTab = 'account';selectCorePage?.('hanamesh-home');selectHanaMeshTab?.('account');}
export function corePageShowsRow(page: CorePage | undefined, label: string): boolean {
  if (label === '我的Hana') return false;
  if (page === 'account') return ['账号', '设备身份', '数据授权', '本机使用记录', '市场与资产'].includes(label);
  if (page === 'configuration') return ['网站', '服务端', '运行配置'].includes(label);
  if (page === 'diagnostics') return ['服务端', '网站', '运行配置', '组件与版本', '关于', '贡献事件', '本设备贡献累计'].includes(label);
  return true;
}
function corePageContent(page: CorePage | undefined, content: ReactNode[]): ReactNode[] {
  return content.filter(child => {
    if (!child || typeof child !== 'object' || !('type' in child)) return !!child;
    const node = child as {type: unknown; props: {label?: string; role?: string; 'data-hanamesh-core-hint'?: string}};
    if (node.type === Row) return corePageShowsRow(page, node.props.label ?? '');
    if (page === undefined) return true;
    if (node.type === SuiteSourceSettings) return page === 'configuration';
    return node.props.role === 'alert' || node.props.role === 'status' || (page === 'diagnostics' && node.props['data-hanamesh-core-hint'] === 'suite-repair');
  });
}
export type CoreRenderSlot = (key: string, owner: HanaMeshTabProps, options?: {only?: string; fallback?: ReactNode}) => ReactNode;
function pluginPageAvailable(slots: SlotRegistry): boolean {return (slots.snapshot?.('plugins.tab').length ?? 0) > 0;}
function usePluginPage(slots: SlotRegistry): boolean {
  const [available, setAvailable] = useState(() => pluginPageAvailable(slots));
  useEffect(() => {const read = (): void => setAvailable(pluginPageAvailable(slots));read();return slots.subscribe?.('plugins.tab', read);}, [slots]);
  return available;
}
function tabRows(slots: SlotRegistry): {id: string; label: string}[] {
  const rows = slots.entriesOfSlot?.('hanamesh.tab') ?? slots.entries?.('hanamesh.tab') ?? [];
  return rows.filter(row => typeof row.options.id === 'string' && typeof row.options.label === 'string').map(row => ({id: row.options.id!, label: row.options.label!}));
}
function HanaMeshShell({slots, navigate, renderSlot}: {slots: SlotRegistry; navigate: (id: string | null) => void; renderSlot?: CoreRenderSlot}): ReactNode {
  const [tabs, setTabs] = useState(() => tabRows(slots));
  const [selected, setSelected] = useState(requestedTab);
  const [notice, setNotice] = useState<string | null>(null);
  const available = usePluginPage(slots);
  const active = tabs.some(tab => tab.id === selected) ? selected : 'home';
  useEffect(() => {const read = (): void => setTabs(tabRows(slots));read();return slots.subscribe?.('hanamesh.tab', read);}, [slots]);
  useEffect(() => {if (active !== selected) {requestedTab = 'home';setSelected('home');setNotice('当前标签已停用，已返回首页。');}}, [active, selected]);
  const navigateTab = (id: string): void => {
    if (!tabRows(slots).some(tab => tab.id === id)) {setNotice('该标签尚未安装或已停用。');return;}
    requestedTab = id;setSelected(id);setNotice(null);
  };
  useEffect(() => {selectHanaMeshTab = navigateTab;return () => {if (selectHanaMeshTab === navigateTab) selectHanaMeshTab = undefined;};}, [slots]);
  const openPlugins = (): void => {
    if (!pluginPageAvailable(slots)) {setNotice('当前 DSH 未提供插件页接口，请启用插件管理器或升级 DSH。');return;}
    try {navigate('plugins');} catch {setNotice('当前 DSH 插件页暂不可用，请启用插件管理器。');}
  };
  const owner: HanaMeshTabProps = {version: 1, navigateTab, openPlugins};
  const keyboard = (event: {key: string; preventDefault(): void; currentTarget: HTMLButtonElement}, index: number): void => {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();navigateTab(tabs[next]!.id);
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');buttons?.[next]?.focus();
  };
  return createElement('div', {className: 'hm-core-page hm-core-shell', 'data-hanamesh-shell': '1'},
    createElement('header', {className: 'hm-core-shell-head'}, createElement('h1', null, 'HanaMesh')),
    createElement('nav', {className: 'hm-core-page-tabs', role: 'tablist', 'aria-label': 'HanaMesh'}, ...tabs.map((tab, index) => createElement('button', {
      key: tab.id, id: `hm-tab-${tab.id}`, type: 'button', role: 'tab', 'aria-selected': active === tab.id, 'aria-controls': 'hm-tab-panel', tabIndex: active === tab.id ? 0 : -1,
      onClick: () => navigateTab(tab.id), onKeyDown: (event: {key: string; preventDefault(): void; currentTarget: HTMLButtonElement}) => keyboard(event, index),
    }, tab.label))),
    (!available || notice) && createElement('p', {role: 'status', className: 'hm-core-notice'}, notice ?? '当前 DSH 未提供插件页接口，请启用插件管理器或升级 DSH。'),
    createElement('div', {role: 'tabpanel', id: 'hm-tab-panel', 'aria-labelledby': `hm-tab-${active}`, tabIndex: 0},
      renderSlot ? renderSlot('hanamesh.tab', owner, {only: active}) : createElement('p', {role: 'alert'}, '当前 DSH 未提供标签渲染接口，请升级 DSH。')));
}
function HanaMeshHome(props: HanaMeshTabProps & {renderSlot?: CoreRenderSlot}): ReactNode {
  const [state, setState] = useState<CoreState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const read = useRef(0);
  const load = async (refresh = false): Promise<void> => {
    const sequence = ++read.current;
    try {const next = await jsonRequest<CoreState>(refresh ? '/api/hanamesh/core/refresh' : '/api/hanamesh/core/state', refresh ? {method: 'POST'} : undefined);if (sequence === read.current) {setState(next);setError(null);}}
    catch (cause) {if (sequence === read.current) setError(cause instanceof Error ? cause.message : 'CORE_INTERNAL_ERROR');}
  };
  useEffect(() => {void load();const focus = (): void => {void load(true);};window.addEventListener('focus', focus);return () => {read.current++;window.removeEventListener('focus', focus);};}, []);
  const bound = state?.session?.bound ?? null;
  const visit = (): void => {if (state?.websiteOrigin) void openWebsite(new URL('/me', state.websiteOrigin).href).catch(cause => setError(cause instanceof Error ? cause.message : 'CORE_INTERNAL_ERROR'));};
  return createElement('div', {'data-hanamesh-home': 'true', className: 'hm-core-home'},
    createElement('div', {className: 'hm-core-notice', role: 'status'}, bound === true ? `已连接 · ${state?.account?.displayName ?? '网站账号'}` : bound === false ? '尚未连接账号。登录、设备绑定和数据授权分别管理。' : state ? '账号连接状态暂不可用，请在账号标签核对服务连接。' : '正在读取账号连接状态…'),
    error && createElement('p', {role: 'alert'}, `读取未完成：${actionError(error)}`, createElement('button', {type: 'button', onClick: () => void load()}, '重新读取')),
    createElement(PointsBindBanner, {navigateTab: props.navigateTab}),
    createElement('section', null, createElement('div', {className: 'hm-core-section-head'}, createElement('h2', null, '继续使用'), createElement('button', {type: 'button', onClick: props.openPlugins}, '去市场逛逛 →')),
      createElement('p', {className: 'hm-core-muted'}, '市场在 DSH「插件」页，进入后选择 HanaMesh 标签。'),
      props.renderSlot?.('hanamesh.home.continue', props, {fallback: createElement('p', {className: 'hm-core-muted'}, '暂无应用贡献内容，可前往插件页查看。')})),
    createElement('section', {className: 'hm-core-card'}, createElement('h2', null, '套件状态'),createElement('p', {className: 'hm-core-muted'}, `Core ${CORE_VERSION}`),
      ...(state?.components ?? []).map(row => createElement('div', {key: row.id, className: 'hm-core-home-item'}, createElement('b', null, row.label), createElement('span', null, `${row.version ?? '未知版本'} · ${componentText(row)}`))),
      !state && createElement('p', null, '正在读取套件状态…'),
      createElement('button', {type: 'button', onClick: props.openPlugins}, '技术设置 → DSH 插件页')),
    createElement('section', {className: 'hm-core-card'}, createElement('h2', null, '我的资产在网站上'), createElement('p', null, '积分、发布的插件、收益明细都在 HanaMesh 网站查看。'),
      createElement('button', {type: 'button', disabled: !(state?.websiteBinding?.ready ?? !!state?.websiteOrigin), onClick: visit}, '去网站看资产 ↗')));
}
function CoreAccount(props: HanaMeshTabProps & {renderSlot?: CoreRenderSlot}): ReactNode {
  return createElement(Fragment, null, createElement<{page?: CorePage; onOpenUsage?: () => void}>(HanaMeshSection, {page: 'account'}),
    createElement('section', {className: 'hm-core-card', 'data-hanamesh-models': 'contributions'}, createElement('h2', null, '模型连接'), createElement('p', null, '沿用 DSH 当前选择的模型；连接内容由提供方插件贡献。'), props.renderSlot?.('hanamesh.account.models', props)));
}
/** The standalone composition boundary is exported for public contract consumers and portable UI tests. */
export function registerCorePages(ctx: Pick<ClientContext, 'slots' | 'layout'>): () => void {
  if (!ctx.layout) throw new Error('CORE_LAYOUT_UNAVAILABLE');
  const previous = selectCorePage, navigate = (id: string | null): void => ctx.layout!.selectPanel(id);
  selectCorePage = navigate;
  const releases: (() => void)[] = [];
  releases.push(ctx.slots.inject('main', () => ctx.slots.register({name: 'main', key: 'hanamesh-home', children: {'hanamesh.tab': {kind: 'list', scope: 'root'}}}, (props: {renderSlot?: CoreRenderSlot}) => createElement(HanaMeshShell, {...props, slots: ctx.slots, navigate}))));
  releases.push(ctx.slots.inject('hanamesh.tab', () => ctx.slots.register({name: 'hanamesh.tab', id: 'home', label: '首页', order: 0, children: {'hanamesh.home.continue': {kind: 'list', scope: 'root'}}}, HanaMeshHome)));
  releases.push(ctx.slots.inject('hanamesh.tab', () => ctx.slots.register({name: 'hanamesh.tab', id: 'account', label: '账号', order: 100, children: {'hanamesh.account.models': {kind: 'list', scope: 'root'}}}, CoreAccount)));
  releases.push(ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({name: 'sidebar.panellist', id: 'hanamesh-home', order: -30, label: 'HanaMesh'}, CoreHomeIcon)));
  return () => {for (const release of releases.reverse()) release();if (selectCorePage === navigate) selectCorePage = previous;};
}
function CorePluginConfig({page, view}: {page: CorePage; view?: 'page' | 'summary'}): ReactNode {
  if (view === 'summary') return createElement('span', null, page === 'configuration' ? '服务地址与本机套件来源' : '诊断、贡献事件与关于');
  return createElement('div', {className: 'hm-core-plugin-config'}, createElement<{page?: CorePage; onOpenUsage?: () => void}>(HanaMeshSection, {page}));
}
function CoreBacklink(): ReactNode {
  const [error, setError] = useState<string | null>(null);
  const open = (): void => {
    if (!selectCorePage) {setError('HanaMesh 页面尚未启用，请启用 Core 的页面入口。');return;}
    try {selectCorePage('hanamesh-home');setError(null);}
    catch {setError('HanaMesh 页面暂不可用，请确认页面入口已启用。');}
  };
  return createElement('section', {className: 'hm-core-section'},
    createElement('button', {type: 'button', onClick: open}, '在 HanaMesh 中打开 →'),
    error && createElement('p', {role: 'alert'}, error));
}
export function registerCorePluginConfig(ctx: Pick<ClientContext, 'slots' | 'layout'>): () => void {
  const releases: (() => void)[] = [];
  for (const key of ['@hanamesh/hanamesh', '@hanamesh/core']) releases.push(ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({name: 'plugins.bundle.config', key}, (props: {view?: 'page' | 'summary'}) => createElement(CorePluginConfig, {...props, page: 'configuration'}))));
  for (const key of ['@hanamesh/hanamesh#hanamesh-core', '@hanamesh/core#hanamesh-core']) releases.push(ctx.slots.inject('plugins.row.config', () => ctx.slots.register({name: 'plugins.row.config', key}, (props: {view?: 'page' | 'summary'}) => createElement(CorePluginConfig, {...props, page: 'diagnostics'}))));
  releases.push(ctx.slots.inject('plugins.detail.section', () => ctx.slots.register({name: 'plugins.detail.section', id: 'hanamesh-core.backlink'}, ({subject}: {subject?: {kind: string; pkg?: {name: string; rows?: readonly {moduleName: string}[]}}}) => {
    if (subject?.pkg?.name !== '@hanamesh/core' && !(subject?.pkg?.name === '@hanamesh/hanamesh' && subject.pkg.rows?.some(row => row.moduleName === '@hanamesh/core'))) return null;
    return createElement(CoreBacklink);
  })));
  return () => {for (const release of releases.reverse()) release();};
}
function CoreHomeIcon({size = 20}: {size?: number}): ReactNode {return createElement('span', {'aria-hidden': true, style: {display: 'block', width: size, height: size, background: 'currentColor', maskImage: 'url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLWxheW91dC1kYXNoYm9hcmQiIGFyaWEtaGlkZGVuPSJ0cnVlIj48cmVjdCB3aWR0aD0iNyIgaGVpZ2h0PSI5IiB4PSIzIiB5PSIzIiByeD0iMSI+PC9yZWN0PjxyZWN0IHdpZHRoPSI3IiBoZWlnaHQ9IjUiIHg9IjE0IiB5PSIzIiByeD0iMSI+PC9yZWN0PjxyZWN0IHdpZHRoPSI3IiBoZWlnaHQ9IjkiIHg9IjE0IiB5PSIxMiIgcng9IjEiPjwvcmVjdD48cmVjdCB3aWR0aD0iNyIgaGVpZ2h0PSI1IiB4PSIzIiB5PSIxNiIgcng9IjEiPjwvcmVjdD48L3N2Zz4=")', maskSize: 'contain', maskRepeat: 'no-repeat'}});}


type ComponentRow = {id: string; label: string; status: string; version: string | null; requiredRange: string; reason?: string; nextStep: string | null; serviceReady?: boolean};
/** J1.S4 machine-wide identity shared by DSH and HanaMesh desktop; see controller `Identity`. */
type IdentityState = {
  status: 'shared' | 'local-only' | 'failed';
  location: string | null;
  source: 'existing' | 'created' | 'migrated' | 'adopted' | 'conflict' | null;
  reason: 'CORE_DEVICE_CORRUPT' | 'CORE_DEVICE_STORE_UNAVAILABLE' | null;
  detail: string | null;
  replacedDeviceIds: string[];
};
type CoreState = {
  /** null while the shared identity cannot be read; `identity.reason` says why. */
  deviceId: string | null;
  identity: IdentityState;
  registrationFailure?: {code: string; status?: number; upstreamStatus?: number; persistence: string | null} | null;
  registrationRecovery?: {state: 'checking'|'recovered'|'failed'|'blocked'; message: string; nextAttemptAt: string|null; principalChanged: boolean}|null;
  configuration?: {timeoutMs: number; checkIntervalMs: number; maxHanaRows: number; profileTimeoutMs: number; maxResponseBytes: number; clientPollIntervalMs: number; pointsRefreshMs: number; contributionIntervalMs: number; activityPageBudget: number; activityDisplayRows: number; catalogConcurrency: number; contributionWindowDays?: number; };
  registration: {status: 'unregistered' | 'registered' | 'failed'; lastError: string | null};
  consent: {state: 'withheld' | 'granted'};
  consentPrompt?: {show: boolean; shownAt: string | null};
  session: {bound: boolean | null} | null;
  /** usage rc.3+: GitHub account name of the bound principal; null when unbound or the server predates it. */
  account: {provider: 'github'; displayName: string} | null;
  /** Effective server: the address set on this page, else the plugin config default. */
  serverOrigin: string | null;
  serverOriginSource?: 'setting' | 'config';
  configuredServerOrigin?: string | null;
  /** A stored address that no longer validates; the default is in effect until it is saved again or cleared. */
  serverOriginFault?: string | null;
  websiteOrigin: string | null;
  websiteOriginSource?: 'setting' | 'config';
  configuredWebsiteOrigin?: string | null;
  websiteOriginFault?: string | null;
  websiteBinding?: {ready: boolean; reason: string | null; message: string | null};
  health: {mode: 'normal' | 'restricted' | 'blocked' | 'repair'; fault: string | null};
  components: ComponentRow[];
  contributions: {status: 'unavailable'; reason: string; upstreamStatus?: number} | {status: 'ready'; windowDays: number; availability?: 'available' | 'unavailable' | null; actions: Record<'install' | 'open' | 'use' | 'uninstall', number>};
};

/** T2 `GET /api/hanamesh/core/points` (host side signs the custody read). Every number is 分; the host decides `prompt.show`. */
type BreakdownKey = 'install' | 'open' | 'use' | 'claimBonus' | 'creatorMirror' | 'launchInitiator';
type HanaPoints = {displayNameStatus?: 'ready' | 'not-found' | 'failed'; displayNameReason?: string | null; upstreamStatus?: number; hanaId: string; displayName: string | null; points: number; pending: number; breakdown: Record<BreakdownKey, number>};
type PointsState = {
  configuration?: {pointsRefreshMs: number};
  reason: string | null;
  upstreamStatus?: number;
  totalPoints: number;
  pendingTotal: number;
  hanas: HanaPoints[];
  /** Mirrors Usage contributions `bound`; the settings section reads the same fact from `CoreState.session.bound`. */
  bound: boolean | null;
  prompt: {show: boolean; shownAt: string | null};
  status: 'ready' | 'unavailable';
};
type ActivityItem = {hanaRef: string; action: 'install' | 'open' | 'use' | 'uninstall'; occurredAt: string};
type ActivityState = {status: 'ready' | 'unavailable'; reason: string | null; upstreamStatus?: number; items: ActivityItem[]; nextAfter: string | null; window: {from: string; to: string} | null};
type ActivityView = ActivityState & {scanned: number};
type LocalUsageSummary = {status: 'loading' | 'missing' | 'unavailable'} | {status: 'ready'; total: number; pending: number};
const ACTION_LABELS: Record<ActivityItem['action'], string> = {install: '安装', open: '打开', use: '使用', uninstall: '卸载'};
/** Usage pages are oldest-first. Never present a scanned prefix as "latest" until its cursor reaches the tail. */
export async function collectLatestActivity(fetchPage: (query: {from?: string; to?: string; after?: string}) => Promise<ActivityState>, previous: ActivityView | null, limits: {activityPageBudget: number; activityDisplayRows: number} = {activityPageBudget: 5, activityDisplayRows: 25}): Promise<ActivityView> {
  if (![limits.activityPageBudget, limits.activityDisplayRows].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('CORE_INPUT_INVALID');
  let current: ActivityView | null = previous?.status === 'ready' ? previous : null;
  for (let page = 0; page < limits.activityPageBudget; page++) {
    const query = current?.status === 'ready' && current.window && current.nextAfter ? {...current.window, after: current.nextAfter} : {};
    const next = await fetchPage(query);
    if (next.status !== 'ready') return {...next, scanned: current?.scanned ?? 0};
    const items = [...(current?.items ?? []), ...next.items].slice(-limits.activityDisplayRows);
    current = {...next, items, scanned: (current?.scanned ?? 0) + next.items.length};
    if (!next.nextAfter) break;
  }
  if (current === null) throw new Error('ACTIVITY_PAGE_MISSING');
  return current;
}
/** 分 can carry thousandths (the creator mirror is a server-set fraction of a point); trim trailing zeros so the row reads as 分, not a float. */
const fen = (value: number): string => `${Number(value.toFixed(3))} 分`;
const POINTS_REASONS: Record<string, string> = {
  NOT_CONNECTED: '未连接服务端，暂时读不到分',
  CONSENT_WITHHELD: '未开启数据授权，本设备不上报事件，因此没有分',
  NOT_REGISTERED: '本设备尚未注册成功，注册后才会记分',
  CORE_POINTS_LIMIT_EXCEEDED: 'Hana 行数超过本地配置预算，请调整插件配置后刷新',
  CORE_RESPONSE_LIMIT_EXCEEDED: '响应超过本地字节预算，请检查响应或调整插件配置',
  CORE_UPSTREAM_UNAVAILABLE: '服务端暂时不可达 CORE_UPSTREAM_UNAVAILABLE，稍后再看',
};
export function coreErrorText(code: string | null, upstreamStatus?: number): string {
  if (code === 'CORE_UPSTREAM_RESPONSE_INVALID') return `服务端响应格式不符合协议 ${code}${upstreamStatus === undefined ? '' : `（HTTP ${upstreamStatus}）`}`;
  if (upstreamStatus !== undefined) return `${upstreamStatus < 500 ? '服务端拒绝' : '服务端返回错误'}：${code === 'IDENTITY_ORIGIN_REJECTED' ? '来源未被信任 ' : ''}${code ?? 'CORE_UPSTREAM_HTTP_ERROR'}（HTTP ${upstreamStatus}）`;
  if (code === 'CORE_SERVER_NOT_CONFIGURED') return '尚未配置服务端地址';
  if (code === 'CORE_INTERNAL_ERROR') return '客户端处理失败 CORE_INTERNAL_ERROR，请查看组件健康信息';
  return POINTS_REASONS[code ?? ''] ?? `暂不可用：${code ?? '未知'}`;
}
const pointsReason = coreErrorText;
const ACTION_ERRORS: Record<string, string> = {
  CORE_WEBSITE_CONFIGURATION_REQUIRED: '服务端已更换，请先在 HanaMesh 账号中保存对应的网站地址；本机服务端只能打开本机网站。',
  CORE_CONFIGURATION_CHANGED: '地址已改变，请重新点击绑定。',
  CORE_CONSENT_REQUIRED: '打开数据授权后才会向服务端注册设备（绑定也需要已注册的设备）',
};
const actionError = (code: string): string => ACTION_ERRORS[code] ?? code;
const SERVER_ERRORS: Record<string, string> = {
  CORE_ORIGIN_REJECTED: '地址无效：须为 https:// 根地址，或本机 http://127.0.0.1 / localhost / [::1]（可带端口），不能带路径、参数或账号密码',
  CORE_INPUT_INVALID: '地址无效：请填写完整地址，如 https://api.example.com',
};
const IDENTITY_FAILURES: Record<NonNullable<IdentityState['reason']>, string> = {
  CORE_DEVICE_CORRUPT: '设备身份文件已损坏（内容无法解析，或密钥与设备 id 不一致）',
  CORE_DEVICE_STORE_UNAVAILABLE: '设备身份文件无法读取或写入（权限或磁盘问题）',
};
const IDENTITY_SOURCES: Record<NonNullable<IdentityState['source']>, string> = {
  existing: '', created: '本机首次创建', migrated: '已把本客户端原有身份迁移为本机共享身份', adopted: '已采用本机已有的共享身份', conflict: '已采用本机已有的共享身份',
};
const short = (id: string): string => `${id.slice(0, 8)}…`;

const styleText = `
/* Core owns only these content regions; DSH owns sidebar and main layout. */
.hm-core-page{width:100%;height:100%;overflow:auto;box-sizing:border-box;min-width:0;padding:18px 24px 32px;margin:auto;color:var(--dsw-alias-label-primary,CanvasText);background:var(--dsw-alias-bg-base,Canvas);font:14px/1.55 system-ui,sans-serif}.hm-core-page *{box-sizing:border-box}.hm-core-page h1{margin:0;font-size:19px}.hm-core-page h2{margin:0;font-size:15px}.hm-core-shell-head{display:flex;align-items:center;gap:12px;margin-bottom:12px}.hm-core-page button,.hm-core-plugin-config button,.hm-core-page input,.hm-core-plugin-config input{font:inherit;border:1px solid var(--dsw-alias-border-l2,#8993a5);border-radius:10px;padding:6px 12px;background:var(--dsw-alias-bg-layer-2,Canvas);color:inherit;max-width:100%;cursor:pointer}.hm-core-page button:disabled{opacity:.5;cursor:default}.hm-core-page :focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#0891b2);outline-offset:2px}.hm-core-page-tabs{display:flex;gap:2px;overflow-x:auto;border-bottom:1px solid var(--dsw-alias-border-l1,#8993a5);margin-bottom:16px}.hm-core-page-tabs button{border:0;border-bottom:2px solid transparent;border-radius:0;background:transparent;padding:9px 14px;white-space:nowrap;color:var(--dsw-alias-label-secondary,CanvasText)}.hm-core-page-tabs [aria-selected=true]{border-bottom-color:var(--dsw-alias-brand-primary,#0891b2);color:var(--dsw-alias-label-primary,CanvasText);font-weight:600}.hm-core-home{display:flex;flex-direction:column;gap:16px}.hm-core-notice,.hm-core-bind-banner{padding:9px 14px;border:1px solid var(--dsw-alias-border-l2,#8993a5);border-radius:10px;background:var(--dsw-alias-bg-layer-2,Canvas);font-size:13px}.hm-core-bind-banner{display:flex;align-items:center;flex-wrap:wrap;gap:10px;border-color:var(--dsw-alias-state-warning-primary,#b45309)}.hm-core-bind-banner span{flex:1}.hm-core-section-head,.hm-core-home-item{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.hm-core-home-item{padding:8px 0}.hm-core-card{border:1px solid var(--dsw-alias-border-l1,#8993a5);border-radius:14px;padding:16px;background:var(--dsw-alias-bg-layer-2,Canvas);min-width:0}.hm-core-page .hm-core-row{display:block;border:1px solid var(--dsw-alias-border-l1,#8993a5);border-radius:14px;padding:16px;background:var(--dsw-alias-bg-layer-2,Canvas);margin-bottom:12px}.hm-core-page .hm-core-row>strong{display:block;margin-bottom:10px}.hm-core-copy{overflow-wrap:anywhere}.hm-core-plugin-config{color:var(--dsw-alias-label-primary,CanvasText)}
@media(max-width:620px){.hm-core-page{padding:16px}.hm-core-bind-banner{align-items:flex-start}.hm-core-bind-banner span{flex-basis:100%}}

.hm-core-section{display:flex;flex-direction:column;gap:0;color:var(--dsw-alias-label-primary,CanvasText);font:14px/1.55 system-ui,sans-serif}
.hm-core-section h2{font-size:20px;margin:0 0 8px}.hm-core-row{display:grid;grid-template-columns:104px minmax(0,1fr);gap:16px;padding:16px 0;border-bottom:1px solid var(--dsw-alias-line-1,#e8e8e8)}
.hm-core-row>strong{font-weight:600}.hm-core-copy{display:flex;flex-direction:column;gap:8px;min-width:0}.hm-core-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.hm-core-section button{cursor:pointer;border:1px solid var(--dsw-alias-line-1,#d8d8d8);border-radius:10px;background:transparent;color:inherit;padding:7px 12px;font:inherit}
.hm-core-section button:hover{background:var(--dsw-alias-interactive-bg-hover,#f4f4f4)}.hm-core-muted{color:var(--dsw-alias-label-secondary,#6f6f6f);font-size:13px}
.hm-core-switch{display:inline-flex;gap:9px;align-items:center}.hm-core-components{display:grid;gap:5px}.hm-core-error{color:var(--dsw-alias-state-error-primary,#b42318)}
@media(max-width:620px){.hm-core-row{grid-template-columns:1fr;gap:6px}}
.hm-core-points{display:grid;gap:10px}.hm-core-points b{font-weight:600}.hm-core-hana{display:grid;gap:3px;padding:8px 0;border-top:1px solid var(--dsw-alias-line-1,#e8e8e8)}
.hm-core-events{display:grid;gap:5px}.hm-core-event{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:5px 0;border-top:1px solid var(--dsw-alias-line-1,#e8e8e8)}
.hm-core-event time{white-space:nowrap}.hm-core-event span{overflow-wrap:anywhere}
.hm-core-prompt{border:1px solid var(--dsw-alias-line-1,#d8d8d8);border-radius:12px;padding:20px;max-width:420px;font:14px/1.55 system-ui,sans-serif}
/* Canvas/CanvasText are the fallbacks on purpose: they are a matched system pair, so a missing DSH token can never
   produce light-on-light in the host's dark theme (rc.31 first real-UI run did exactly that with a #fff fallback). */
.hm-core-prompt{color:var(--dsw-alias-label-primary,CanvasText);background:var(--dsw-alias-bg-layer-2,Canvas)}
.hm-core-prompt h3{margin:0 0 8px;font-size:16px}
.hm-core-prompt p{margin:0 0 14px}
.hm-core-prompt button{cursor:pointer;border:1px solid var(--dsw-alias-line-1,#d8d8d8);border-radius:10px;background:transparent;color:inherit;padding:7px 12px;font:inherit}
.hm-core-local-usage{box-sizing:border-box;width:100%;height:100%;max-width:none;max-height:100%;margin:0;border:0;padding:0;overflow:hidden;gap:0;color:var(--dsw-alias-label-primary,CanvasText);background:var(--dsw-alias-bg-layer-2,Canvas);font:14px/1.55 system-ui,sans-serif}
.hm-core-local-usage-content,.hm-core-local-usage>.hm-core-modal-content{display:flex;flex-direction:column;min-height:0;height:100%}
.hm-core-local-usage-header{display:flex;align-items:center;flex-shrink:0;gap:16px;padding:16px 24px;background:inherit;border-bottom:1px solid var(--dsw-alias-line-1,#e8e8e8)}
.hm-core-local-usage-header h1{flex:1;font-size:22px;margin:0}
.hm-core-local-usage-header button{cursor:pointer;border:1px solid var(--dsw-alias-line-1,#d8d8d8);border-radius:10px;background:transparent;color:inherit;padding:7px 12px;font:inherit}
`;

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {...init, headers: {...init?.headers, ...(init?.body ? {'content-type': 'application/json'} : {})}});
  let body: T & {error?: {code?: string; upstreamStatus?: number}};
  try { body = await response.json(); } catch { throw new Error(coreErrorText('CORE_UPSTREAM_RESPONSE_INVALID', response.status)); }
  if (!response.ok) {const code=body.error?.code ?? `HTTP_${response.status}`;throw new Error(body.error?.upstreamStatus === undefined ? code : coreErrorText(code,body.error.upstreamStatus));}
  return body;
}

/** The bind landing needs a server `bind` challenge, so the link is minted by our own host route, never in the bundle. */
async function openBindPage(): Promise<string> {
  const link = await jsonRequest<{url: string}>('/api/hanamesh/core/bind-link', {method: 'POST'});
  await openWebsite(link.url);
  return link.url;
}

async function openWebsite(url: string): Promise<void> {
  const result = await jsonRequest<{opened: boolean}>('/api/hanamesh/core/open-external', {method: 'POST', body: JSON.stringify({url})});
  if (!result.opened) window.open(url, '_blank', 'noopener,noreferrer');
}

function componentText(row: ComponentRow): string {
  if (row.status === 'satisfied' && row.id === 'usage' && row.serviceReady === false) return '已安装，服务未就绪';
  if (row.status === 'satisfied') return '已安装';
  if (row.status === 'missing') return '未安装或未加入当前加载配置';
  if (row.status === 'inactive') return '已安装但未启用';
  if (row.status === 'incompatible') return `版本不匹配（要求 ${row.requiredRange}）`;
  return `需修复${row.reason ? `：${row.reason}` : ''}${row.nextStep ? `${row.reason ? ' ' : '：'}${row.nextStep}` : ''}`;
}

function Row({label, children}: {label: string; children?: ReactNode}): ReactNode {
  return createElement('div', {className: 'hm-core-row'}, createElement('strong', null, label), createElement('div', {className: 'hm-core-copy'}, children));
}

/** Public same-origin Usage view; opening it never navigates the host settings. */
function LocalUsageDialog({onClose}: {onClose: () => void; restoreFocus: () => void}): ReactNode {
  return createElement(CoreModal, {onClose, title: '本机使用记录', className: 'hm-core-local-usage'},
    createElement('div', {className: 'hm-core-local-usage-content', 'data-hanamesh-core-page': 'local-usage'},
      createElement('header', {className: 'hm-core-local-usage-header'},
        createElement('h1', {id: 'hm-core-local-usage-title'}, '本机使用记录'),
        createElement('button', {type: 'button', onClick: onClose}, '返回账号')),
      createElement('iframe', {src: '/api/hanamesh/usage/panel/view', title: '本机使用记录详情', style: {width: '100%', flex: 1, minHeight: 0, border: 0}})));
}

type SuiteSourceView={protocolVersion:'1';status:'disabled'|'ready'|'failed'|'disposed';selection:string;registry:string|null;archiveCount:number;lastError:string|null;configuration:{configured:unknown;selection:{mode:string;options?:unknown}}};
function SuiteSourceSettings(_props:{'data-suite-source-section':boolean}):ReactNode {
 const [value,setValue]=useState<SuiteSourceView|null>(null),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const active=useRef(true);
 const load=async(edit=false):Promise<void>=>{const next=await jsonRequest<SuiteSourceView>('/api/hanamesh/core/suite-source');if(!active.current)return;setValue(next);if(edit){const options=next.configuration.selection.mode==='custom'?next.configuration.selection.options:next.configuration.configured;setDraft(options===null||options===undefined?'':JSON.stringify(options,null,2))}};
 useEffect(()=>{active.current=true;void load(true).catch(cause=>{if(active.current)setError(cause instanceof Error?cause.message:'CORE_INTERNAL_ERROR')});return()=>{active.current=false}},[]);
 const save=async(mode:'configured'|'disabled'|'custom'):Promise<void>=>{
  if(busy)return;let selection:unknown={mode};if(mode==='custom'){try{selection={mode,options:JSON.parse(draft)}}catch{setError('CORE_SUITE_SOURCE_CONFIG_INVALID');return}}
  setBusy(true);setError(null);
  try{await jsonRequest('/api/hanamesh/core/suite-source',{method:'POST',body:JSON.stringify(selection)});await load()}
  catch(cause){const code=cause instanceof Error?cause.message:'CORE_INTERNAL_ERROR';if(active.current)setError(code);try{await load()}catch(readback){if(active.current)setError(code+'；读取状态失败：'+(readback instanceof Error?readback.message:'CORE_INTERNAL_ERROR'))}}
  finally{if(active.current)setBusy(false)}
 };
 return createElement('section',{'data-hanamesh-suite-source':value?.status??'loading',className:'hm-core-copy'},
  createElement('h3',null,'本机套件来源'),
  createElement('p',null,value?.status==='ready'?`运行中：${value.registry} · ${value.archiveCount} 份已核验归档`:value?.status==='disabled'?(value.selection==='disabled'?'已明确停用':'未配置本机来源'):value?.status==='failed'?'来源未启动':value?.status==='disposed'?'来源已释放':'读取中…'),
  value&&createElement('small',{className:'hm-core-muted'},`当前选择：${value.selection==='custom'?'已保存的自定义来源':value.selection==='disabled'?'停用':'插件配置'}。Core 只在本插件加载后提供来源，不预装自己，不改客户端或其他插件的来源设置。`),
  (error||value?.lastError)&&createElement('p',{role:'alert',className:'hm-core-error'},`来源操作未完成：${error??value?.lastError}。请核对归档与配置；不会自动重试。`),
  createElement('button',{type:'button',disabled:busy,onClick:()=>{setError(null);void load().catch(cause=>setError(cause instanceof Error?cause.message:'CORE_INTERNAL_ERROR'))}},'读取来源状态'),
  createElement('details',null,createElement('summary',null,'本机来源高级设置'),
   createElement('p',{className:'hm-core-muted'},'填写 Core、Usage、Market 和 Theme 正常归档的绝对路径与 SHA-512 完整性，以及监听端口、上游元数据来源和资源预算。'),
   createElement('textarea',{'aria-label':'本机来源配置',value:draft,rows:12,disabled:busy,onChange:(event:{currentTarget:{value:string}})=>setDraft(event.currentTarget.value),style:{width:'100%',boxSizing:'border-box'}}),
   createElement('div',{className:'hm-core-actions'},createElement('button',{type:'button',disabled:busy||!draft.trim(),onClick:()=>void save('custom')},'保存本机来源'),createElement('button',{type:'button',disabled:busy,onClick:()=>void save('disabled')},'停用本机来源'),createElement('button',{type:'button',disabled:busy,onClick:()=>void save('configured')},'使用插件配置'))));
}

export function HanaMeshSection({page, onOpenUsage}: {page?: CorePage; onOpenUsage?: () => void} = {}): ReactNode {
  const [state, setState] = useState<CoreState | null>(null);
  const [activity, setActivity] = useState<ActivityView | null>(null);
  const [activityBusy, setActivityBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentReview, setConsentReview] = useState<CoreState['consent']['state'] | null>(null);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [websiteDraft, setWebsiteDraft] = useState('');
  const [websiteBusy, setWebsiteBusy] = useState(false);
  const [websiteError, setWebsiteError] = useState<string | null>(null);
  const [serverDraft, setServerDraft] = useState('');
  const [serverBusy, setServerBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [localUsage, setLocalUsage] = useState<LocalUsageSummary>({status: 'loading'});
  const [localUsageOpen, setLocalUsageOpen] = useState(false);
  const localUsageEntry = useRef<HTMLButtonElement | null>(null);
  const localUsageRead = useRef(0);
  const consentWrite = useRef(false);
  const stateRead = useRef(0);
  const configurationWrites = useRef(0);
  const loadLocalUsage = async (): Promise<void> => {
    const read = ++localUsageRead.current;
    let next: LocalUsageSummary;
    try {
      const response = await fetch('/api/hanamesh/usage/panel', {headers: {accept: 'application/json'}});
      if (response.status === 404 || response.status === 503) next = {status: 'missing'};
      else {
        if (!response.ok) throw new Error('LOCAL_USAGE_UNAVAILABLE');
        const panel = await response.json() as {total?: unknown; outbox?: {pending?: unknown}};
        const total = panel?.total, pending = panel?.outbox?.pending;
        if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0 || typeof pending !== 'number' || !Number.isSafeInteger(pending) || pending < 0) throw new Error('LOCAL_USAGE_UNAVAILABLE');
        next = {status: 'ready', total, pending};
      }
    } catch { next = {status: 'unavailable'}; }
    if (read === localUsageRead.current) setLocalUsage(next);
  };
  const loadActivity = async (more = false): Promise<void> => {
    if (activityBusy) return;
    setActivityBusy(true);
    try {
      const next = await collectLatestActivity(async query => {
        const params = Object.keys(query).length ? `?${new URLSearchParams(query).toString()}` : '';
        return jsonRequest<ActivityState>(`/api/hanamesh/core/activity${params}`);
      }, more ? activity : null, state?.configuration);
      setActivity(next);
    } catch (cause) { setActivity({status: 'unavailable', reason: cause instanceof Error ? cause.message : 'CORE_INTERNAL_ERROR', items: [], nextAfter: null, window: null, scanned: 0}); }
    finally { setActivityBusy(false); }
  };
  const load = async (refresh = false): Promise<void> => {
    if (consentWrite.current || configurationWrites.current > 0) return;
    if (page === undefined || page === 'account') void loadLocalUsage();
    const read = ++stateRead.current;
    try {
      const next = await jsonRequest<CoreState>(refresh ? '/api/hanamesh/core/refresh' : '/api/hanamesh/core/state', refresh ? {method: 'POST'} : undefined);
      if (configurationWrites.current === 0 && read === stateRead.current) { setState(next); setError(null); }
    }
    catch (cause) { if (configurationWrites.current === 0 && read === stateRead.current) setError(cause instanceof Error ? cause.message : 'CORE_INTERNAL_ERROR'); }
  };
  useEffect(() => {
    void load();
    if (page === undefined || page === 'diagnostics') void loadActivity();
    const timer = window.setInterval(() => void load(), state?.configuration?.clientPollIntervalMs ?? 10_000);
    // Returning from website binding must bypass the host's state/points caches,
    // even when the website stayed open longer than three minutes.
    const refresh = (): void => { void load(true); };
    const visible = (): void => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [state?.configuration?.clientPollIntervalMs, page]);
  const post = async (path: string, body?: unknown): Promise<void> => {
    try { await jsonRequest(path, {method: 'POST', ...(body === undefined ? {} : {body: JSON.stringify(body)})}); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'CORE_INTERNAL_ERROR'); }
  };
  const saveConsent = async (requested: CoreState['consent']['state']): Promise<void> => {
    if (consentWrite.current) return;
    consentWrite.current = true;
    stateRead.current++;
    setConsentBusy(true);
    setConsentError(null);
    try {
      await jsonRequest('/api/hanamesh/core/consent', {method: 'POST', body: JSON.stringify({state: requested})});
      const next = await jsonRequest<CoreState>('/api/hanamesh/core/state');
      setState(next);
      if (next.consent.state !== requested) throw new Error('CORE_CONSENT_NOT_CONFIRMED');
      void loadActivity();
      void loadLocalUsage();
    } catch (cause) { setConsentError(cause instanceof Error ? cause.message : 'CORE_INTERNAL_ERROR'); }
    finally { consentWrite.current = false; setConsentBusy(false); }
  };
  const saveServer = async (serverOrigin: string | null): Promise<void> => {
    configurationWrites.current++; stateRead.current++;
    setServerBusy(true);
    setServerError(null);
    try {
      setState(await jsonRequest<CoreState>('/api/hanamesh/core/server', {method: 'POST', body: JSON.stringify({serverOrigin})}));
      setServerDraft('');
      void loadActivity();
    } catch (cause) { setServerError(cause instanceof Error ? cause.message : 'CORE_INTERNAL_ERROR'); }
    finally {configurationWrites.current--; stateRead.current++; setServerBusy(false); }
  };
  const saveWebsite = async (websiteOrigin: string | null): Promise<void> => {
    configurationWrites.current++; stateRead.current++;
    setWebsiteBusy(true); setWebsiteError(null);
    try {setState(await jsonRequest<CoreState>('/api/hanamesh/core/website', {method: 'POST', body: JSON.stringify({websiteOrigin})}));setWebsiteDraft('');}
    catch(cause){setWebsiteError(cause instanceof Error ? cause.message : 'CORE_INTERNAL_ERROR');}
    finally{configurationWrites.current--; stateRead.current++; setWebsiteBusy(false);}
  };
  const bind = async (): Promise<void> => {
    try {
      await openBindPage();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'CORE_INTERNAL_ERROR'); }
  };
  const visit = (path = '/'): void => {
    if (!state?.websiteOrigin) { setError('CORE_URL_NOT_ALLOWED'); return; }
    const url = new URL(path, state.websiteOrigin).href;
    void openWebsite(url).catch(cause => setError(cause instanceof Error ? cause.message : 'CORE_INTERNAL_ERROR'));
  };
  if (!state) return createElement('section', {className: 'hm-core-section', 'data-hanamesh-core': 'loading'}, createElement('h2', null, 'HanaMesh'), createElement('p', {className: error ? 'hm-core-error' : 'hm-core-muted'}, error ? `未能读取：${error}` : '正在读取…'), error && createElement('button', {type: 'button', onClick: () => void load()}, '重新读取'));
  const waitingForConsent = state.registration.status !== 'registered' && state.consent.state !== 'granted';
  const registration = state.serverOrigin === null ? '未连接' : state.registration.status === 'registered' ? '已注册' : waitingForConsent ? '未注册：打开数据授权后注册' : state.registration.status === 'failed' ? `注册失败：${state.registration.lastError ?? '未知'}` : '未注册';
  const windowDays = state.configuration?.contributionWindowDays ?? 90;
  const serverFromSetting = state.serverOriginSource === 'setting';
  const websiteReady = state.websiteBinding?.ready ?? !!state.websiteOrigin;
  const bound = state.session?.bound ?? null;
  const identity = state.identity;
  const identityRow = identity.status === 'failed'
    ? createElement('div', {className: 'hm-core-copy', 'data-hanamesh-core-identity': 'failed'},
      createElement('span', {className: 'hm-core-error', role: 'alert'}, `${IDENTITY_FAILURES[identity.reason ?? 'CORE_DEVICE_STORE_UNAVAILABLE']}${identity.detail ? `（${identity.detail}）` : ''}：${identity.location ?? '未知位置'}`),
      createElement('small', {className: 'hm-core-muted'}, '为避免两个客户端各算一台设备，Core 不会自动新建身份，也不会覆盖这个文件；修复或移走该文件后重新读取。在此之前不注册、不签名、不上报。'),
      createElement('div', {className: 'hm-core-actions'}, createElement('button', {type: 'button', onClick: () => void post('/api/hanamesh/core/refresh')}, '重新读取设备身份')))
    : createElement('div', {className: 'hm-core-copy', 'data-hanamesh-core-identity': identity.status, 'data-hanamesh-core-device': state.deviceId ?? ''},
      createElement('div', {className: 'hm-core-actions'}, createElement('span', null, `设备 id：${state.deviceId ? short(state.deviceId) : '—'}　注册：${registration}`), state.serverOrigin && state.registration.status !== 'registered' && !waitingForConsent && createElement('button', {type: 'button', onClick: () => void post('/api/hanamesh/core/device/register')}, '重试注册')),
      createElement('small', {className: 'hm-core-muted'}, identity.status === 'shared'
        ? `本机共享：DSH 与 HanaMesh 客户端使用同一设备身份（${identity.location}）${identity.source && IDENTITY_SOURCES[identity.source] ? `；${IDENTITY_SOURCES[identity.source]}` : ''}`
        : '仅本客户端：未接入本机共享身份'),
      identity.replacedDeviceIds.length > 0 && createElement('small', {className: 'hm-core-muted'}, `本客户端原有身份 ${identity.replacedDeviceIds.map(short).join('、')} 与本机共享身份冲突，已改用共享身份；原身份的密钥已保留在本客户端存储中，未删除。原身份未绑定时的待绑定分不会自动转入。`));
  const contributions = state.contributions.status === 'ready'
    ? `install ${state.contributions.actions.install} · open ${state.contributions.actions.open} · use ${state.contributions.actions.use} · uninstall ${state.contributions.actions.uninstall}　窗口：近 ${state.contributions.windowDays} 天`
    : pointsReason(state.contributions.reason, state.contributions.upstreamStatus);
  const contributionsNote = state.contributions.status !== 'ready' ? null
    : state.contributions.availability === 'unavailable' ? '服务端只保留了这个窗口的一部分记录，数字不完整'
      : state.contributions.availability === 'available' ? null : '服务端未说明这个窗口的记录是否完整';
  const missingComponents = state.components.filter(row => row.status === 'missing');
  const inactiveComponents = state.components.filter(row => row.status === 'inactive');
  const content: ReactNode[] = [
    createElement('h2', null, 'HanaMesh'),
    createElement('p', {className: 'hm-core-muted', 'data-hanamesh-core-hint': 'suite-components'}, 'HanaMesh 套件包含 Core、使用记录（Usage）、市场（Market）和主题（Theme）。'),
    (missingComponents.length > 0 || inactiveComponents.length > 0) && createElement('div', {className: 'hm-core-copy', 'data-hanamesh-core-hint': 'suite-repair'},
      missingComponents.length > 0 && createElement('p', {className: 'hm-core-error'}, `套件不完整，缺 ${missingComponents.map(row => row.label).join('、')}。组件未安装或未加入当前加载配置。`),
      inactiveComponents.length > 0 && createElement('p', null, `已安装但未启用：${inactiveComponents.map(row => row.label).join('、')}。`),
      createElement('p', {className: 'hm-core-muted'}, '请在 DSH 插件页安装缺少的组件，或启用已安装的组件，然后重新检查。')),
    error && createElement('p', {className: 'hm-core-error', role: 'alert'}, `读取或保存失败：${actionError(error)}`, createElement('button', {type: 'button', onClick: () => void load()}, '重新读取')),
    createElement(SuiteSourceSettings,{'data-suite-source-section':true}),
    createElement(Row, {label: '设备身份'}, identityRow),
    state.registrationFailure && createElement('p', {role: 'alert', className: 'hm-core-error'}, `注册失败：${coreErrorText(state.registrationFailure.code, state.registrationFailure.upstreamStatus)}${state.registrationFailure.persistence ? `；状态保存失败：${state.registrationFailure.persistence}` : ''}。请使用重试注册。`),
    state.registrationRecovery && createElement('p', {role: 'status', 'data-hanamesh-registration-recovery': state.registrationRecovery.state}, state.registrationRecovery.message,
      state.registrationRecovery.nextAttemptAt && createElement('span', null, ' 下次自动核对：', createElement('time', {dateTime: state.registrationRecovery.nextAttemptAt}, new Date(state.registrationRecovery.nextAttemptAt).toLocaleString()))),
    createElement(Row, {label: '服务端'}, createElement('div', {className: 'hm-core-copy', 'data-hanamesh-core-server': serverFromSetting ? 'setting' : 'config'},
      createElement('span', null, `当前：${state.serverOrigin ?? '未设置（不连接服务端）'}（${serverFromSetting ? '你设置的' : '出厂默认'}）`),
      serverFromSetting && createElement('small', {className: 'hm-core-muted'}, `出厂默认：${state.configuredServerOrigin ?? '未设置'}`),
      state.serverOriginFault && createElement('span', {className: 'hm-core-error', role: 'alert'}, `已保存的服务端地址无效（${state.serverOriginFault}），当前使用出厂默认；请重新保存或恢复默认。`),
      createElement('div', {className: 'hm-core-actions'},
        createElement('input', {type: 'text', 'aria-label': '服务端地址', placeholder: 'https://api.example.com', value: serverDraft, disabled: serverBusy, onChange: (event: {currentTarget: {value: string}}) => setServerDraft(event.currentTarget.value)}),
        createElement('button', {type: 'button', disabled: serverBusy || serverDraft.trim() === '', onClick: () => void saveServer(serverDraft.trim())}, '保存'),
        createElement('button', {type: 'button', disabled: serverBusy || !serverFromSetting, onClick: () => void saveServer(null)}, '恢复默认')),
      serverError && createElement('span', {className: 'hm-core-error', role: 'alert'}, SERVER_ERRORS[serverError] ?? `保存失败：${serverError}`),
      createElement('small', {className: 'hm-core-muted'}, '立即生效。注册属于某个服务端：更换后本设备在新服务端重新注册（需已打开数据授权），贡献、分与使用记录改读新服务端。'))),
    createElement(Row, {label: '网站'}, createElement('div', {className: 'hm-core-copy', 'data-hanamesh-core-website': state.websiteOriginSource ?? 'config'},
      createElement('span', null, `当前：${state.websiteOrigin ?? '未设置'}（${state.websiteOriginSource === 'setting' ? '你设置的' : '出厂默认'}）`),
      state.websiteOriginSource === 'setting' && createElement('small', {className: 'hm-core-muted'}, `出厂默认：${state.configuredWebsiteOrigin ?? '未设置'}`),
      state.websiteOriginFault && createElement('span', {role: 'alert', className: 'hm-core-error'}, `已保存的网站地址无效（${state.websiteOriginFault}），请重新保存或恢复默认。`),
      createElement('div', {className: 'hm-core-actions'},
        createElement('input', {type: 'text', 'aria-label': '网站地址', placeholder: 'https://market.example.com', value: websiteDraft, disabled: websiteBusy, onChange: (event: {currentTarget: {value: string}}) => setWebsiteDraft(event.currentTarget.value)}),
        createElement('button', {type: 'button', disabled: websiteBusy || websiteDraft.trim() === '', onClick: () => saveWebsite(websiteDraft.trim())}, '保存'),
        createElement('button', {type: 'button', disabled: websiteBusy || state.websiteOriginSource !== 'setting', onClick: () => saveWebsite(null)}, '恢复默认')),
      websiteError && createElement('span', {className: 'hm-core-error', role: 'alert'}, SERVER_ERRORS[websiteError] ?? `保存失败：${websiteError}`),
      !websiteReady && createElement('p', {role: 'alert', className: 'hm-core-error'}, state.websiteBinding?.message ?? '请先设置对应的网站地址。'),
      createElement('small', {className: 'hm-core-muted'}, '立即生效。更换服务端后，须同时保存对应网站；本机服务端只能使用本机网站。'))),
    state.configuration && createElement(Row, {label: '运行配置'}, createElement('span', {'data-hanamesh-core-configuration': 'visible'}, `请求时限 ${state.configuration.timeoutMs}ms；健康检查 ${state.configuration.checkIntervalMs}ms；名称请求时限 ${state.configuration.profileTimeoutMs}ms；Hana 行预算 ${state.configuration.maxHanaRows}；响应字节预算 ${state.configuration.maxResponseBytes}；界面轮询 ${state.configuration.clientPollIntervalMs ?? 10000}ms；积分刷新 ${state.configuration.pointsRefreshMs ?? 60000}ms；贡献刷新 ${state.configuration.contributionIntervalMs ?? 60000}ms；活动每次 ${state.configuration.activityPageBudget ?? 5} 页、显示 ${state.configuration.activityDisplayRows ?? 25} 行；名称并发 ${state.configuration.catalogConcurrency ?? 4}；贡献窗口 ${windowDays} 天。可在插件配置中修改。`)),
    createElement(Row, {label: '数据授权'}, createElement('label', {className: 'hm-core-switch'}, createElement('input', {type: 'checkbox', checked: state.consent.state === 'granted', disabled: consentBusy, onChange: event => {const requested = event.currentTarget.checked ? 'granted' : 'withheld';setConsentReview(requested);}}), '允许 HanaMesh 记录并上报本设备的使用事件（安装/打开/使用/卸载；不含内容与对话）'),
      createElement('span', {role: 'status'}, consentBusy ? '正在保存并读取授权状态…' : `${consentError ? '上次读取' : '当前'}：${state.consent.state === 'granted' ? '已开启' : '已关闭'}`),
      // Turning consent on sends data at once (registration, then usage records): say where, before the switch is used.
      createElement('small', {className: 'hm-core-muted', 'data-hanamesh-core-consent-destination': state.serverOrigin ?? 'none'}, state.serverOrigin === null
        ? '没有设置服务端：开启后只在本机记录，不发送。'
        : `开启后会立即向 ${state.serverOrigin}（${state.serverOriginSource === 'setting' ? '你设置的服务端' : '出厂默认服务端'}）注册本设备并上报使用记录；要换服务端，请先在 DSH 插件页的 HanaMesh 包配置中改好再开启。`),
      consentError && createElement('p', {className: 'hm-core-error', role: 'alert'}, `授权保存未确认：${consentError}。请重新切换授权，或重新进入页面读取当前状态。`),
      createElement('small', {className: 'hm-core-muted'}, '撤回后本地缓冲清空并向服务端发起删除；服务端按其保留设置保存原始记录（默认 90 天）。')),
    createElement(Row, {label: '本机使用记录'}, createElement('div', {className: 'hm-core-copy', 'data-hanamesh-core-local-usage': localUsage.status},
      createElement('span', {role: 'status'}, localUsage.status === 'ready' ? `本机已保留 ${localUsage.total} 条记录 · ${localUsage.pending} 条待上传`
        : localUsage.status === 'loading' ? '正在读取本机使用记录…'
          : localUsage.status === 'missing' ? 'Usage 服务未安装或未启动，无法读取本机使用记录。' : '本机使用记录暂时无法读取，请重试。'),
      createElement('small', {className: 'hm-core-muted'}, '读取本机 Usage 保存的记录与上传队列。'),
      createElement('div', {className: 'hm-core-actions'},
        createElement('button', {type: 'button', ref: localUsageEntry, disabled: localUsage.status !== 'ready', onClick: onOpenUsage ?? (() => setLocalUsageOpen(true))}, '查看本机记录'),
        createElement('button', {type: 'button', onClick: () => void loadLocalUsage()}, '刷新本机记录')))),
    createElement(Row, {label: '账号'}, createElement('div', {className: 'hm-core-actions'},
      bound === true
        ? createElement('span', {'data-hanamesh-core-bound': 'true', ...(state.account ? {'data-hanamesh-core-account': state.account.displayName} : {})}, state.account?.provider === 'github'
          ? `已绑定到 GitHub 账号 ${state.account.displayName}（设备 ${short(state.deviceId ?? '')}）`
          : `已绑定到网站账号（设备 ${short(state.deviceId ?? '')} 已关联你的 GitHub 登录）`)
        : createElement('span', {'data-hanamesh-core-bound': String(bound)}, bound === false ? '未绑定：绑定后网站才能把本设备的贡献记到你的账号' : state.serverOrigin === null ? '未连接服务端' : identity.status === 'failed' ? '设备身份不可用，暂不能绑定' : '绑定状态读取中…'),
      bound === true
        ? createElement('button', {type: 'button', disabled: !websiteReady, onClick: () => visit('/me')}, '在网站查看账号与设备')
        : createElement('button', {type: 'button', disabled: !websiteReady, onClick: () => void bind()}, '去网站绑定'),
      // T9: the email form lives on the website; core only carries the entry point.
      createElement('button', {type: 'button', disabled: !websiteReady, 'data-hanamesh-core-email': 'entry', onClick: () => visit('/me')}, '邮箱绑定'))),
    createElement(Row, {label: '市场与资产'}, createElement('p', null, '交易、发行、LP 与资产在网站管理。'), createElement('button', {type: 'button', disabled: !websiteReady, onClick: () => visit('/me')}, '在网站查看')),
    createElement(Row, {label: '贡献事件'}, createElement('div', {className: 'hm-core-events', 'data-hanamesh-core-activity': activity?.status ?? 'loading'},
      createElement('b', null, `本设备近 ${windowDays} 天贡献事件`),
      createElement('small', {className: 'hm-core-muted'}, '「打开」记插件页面被打开，「使用」记插件命令成功执行；聊天回合不计。事件不等于逐笔积分，积分以“我的 Hana”账本汇总为准。'),
      activityBusy && createElement('span', {className: 'hm-core-muted'}, '正在读取最新事件…'),
      activity === null ? createElement('span', {className: 'hm-core-muted'}, '正在读取事件…')
        : activity.status === 'unavailable' ? createElement('span', {className: 'hm-core-muted'}, pointsReason(activity.reason, activity.upstreamStatus))
          : activity.nextAfter ? createElement('span', {className: 'hm-core-muted'}, `已扫描 ${activity.scanned} 条，尚未抵达最新；请继续读取。`)
            : activity.items.length === 0 ? createElement('span', {className: 'hm-core-muted'}, '本设备在此窗口没有可读的原始事件')
              : createElement(Fragment, null, createElement('small', {className: 'hm-core-muted'}, '最新事件（新到旧）'), ...[...activity.items].reverse().map((item, index) => createElement('div', {key: `${item.occurredAt}:${item.hanaRef}:${item.action}:${index}`, className: 'hm-core-event'},
                createElement('span', null, `${ACTION_LABELS[item.action]} · ${item.hanaRef}`),
                createElement('time', {dateTime: item.occurredAt}, new Date(item.occurredAt).toLocaleString('zh-CN'))))),
      createElement('div', {className: 'hm-core-actions'},
        createElement('button', {type: 'button', disabled: activityBusy, onClick: () => void loadActivity()}, '刷新事件'),
        activity?.status === 'ready' && activity.nextAfter && createElement('button', {type: 'button', disabled: activityBusy, onClick: () => void loadActivity(true)}, '继续读取到最新')))),
    createElement(Row, {label: '本设备贡献累计'}, createElement('div', {className: 'hm-core-copy', 'data-hanamesh-core-contributions': state.contributions.status === 'ready' ? (state.contributions.availability ?? 'unknown') : 'unavailable'},
      createElement('span', null, contributions),
      contributionsNote && createElement('small', {className: state.contributions.status === 'ready' && state.contributions.availability === 'unavailable' ? 'hm-core-error' : 'hm-core-muted'}, contributionsNote))),
    createElement(Row, {label: '组件与版本'}, createElement('div', {className: 'hm-core-components'}, createElement('span', {'data-hanamesh-component': 'core'}, `HanaMesh Core：版本 ${CORE_VERSION}`), state.health.fault && createElement('span', {className: 'hm-core-error'}, `检查未完成（${state.health.fault}）`), ...state.components.map(row => createElement('span', {key: row.id, 'data-hanamesh-component': row.id}, `${row.label}：版本 ${row.version ?? '未知'} · ${componentText(row)}`)), createElement('button', {type: 'button', onClick: () => void post('/api/hanamesh/core/health/recheck')}, '重新检查'))),
    createElement(Row, {label: '关于'}, createElement('div', {className: 'hm-core-actions'}, createElement('span', null, `hanamesh-core ${CORE_VERSION} · 支持 DSH 0.2.x`), createElement('button', {type: 'button', disabled: !websiteReady, onClick: () => visit('/')}, '去网站'))),
  ];
  return createElement('section', {className: 'hm-core-section', 'data-hanamesh-core': 'ready'}, ...corePageContent(page, content),
    localUsageOpen && (page === undefined || page === 'account') && createElement(LocalUsageDialog, {onClose: () => setLocalUsageOpen(false), restoreFocus: () => localUsageEntry.current?.focus()}),
    consentReview !== null && createElement(CoreModal, {title: '确认数据授权', className: 'hm-core-prompt hm-core-consent-review', onClose: () => setConsentReview(null)},
      createElement('h3', null, '确认数据授权'),
      createElement('p', null, consentReview === 'granted' ? '开启后记录本设备的安装、打开、使用与卸载摘要；不包含对话、文件或凭据。登录与设备绑定不会自动授权。' : '撤回后停止记录并清空本机缓冲；服务端删除结果单独核对。'),
      createElement('p', {'data-hanamesh-consent-review-destination': state.serverOrigin ?? 'none'}, state.serverOrigin === null ? '只在本机记录，不发送到服务端。' : `上报目的地：${state.serverOrigin}`),
      createElement('div', {className: 'hm-core-actions'},
        createElement('button', {type: 'button', onClick: () => setConsentReview(null)}, '取消'),
        createElement('button', {type: 'button', disabled: consentBusy, onClick: () => {const requested = consentReview;setConsentReview(null);void saveConsent(requested);}}, consentReview === 'granted' ? '确认开启' : '确认撤回'))));
}

/** A homepage banner consumes the one-time marker only after it is visible,
 * the document is foreground, and the public DSH modal stack has yielded. */
export function PointsBindBanner({navigateTab}: {navigateTab: (id: string) => void}): ReactNode {
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const anchor = useRef<HTMLDivElement | null>(null);
  const marked = useRef(false);
  const live = useRef(false);
  useEffect(() => {
    let cancelled = false;live.current = true;
    let timer = 0, pointsRefreshMs = 60_000, reading = false, offered = false;
    const poll = async (): Promise<void> => {
      if (cancelled || reading || offered) return;
      reading = true;
      try {
        const next = await jsonRequest<PointsState>('/api/hanamesh/core/points');
        if (cancelled) return;
        const configured = next.configuration?.pointsRefreshMs ?? 60_000;
        if (configured !== pointsRefreshMs) {
          pointsRefreshMs = configured;
          window.clearInterval(timer);
          timer = window.setInterval(() => void poll(), pointsRefreshMs);
        }
        setError(null);
        if (!next.prompt.show) return;
        offered = true;
        window.clearInterval(timer);
        setPending(next.pendingTotal);
      } catch (cause) {
        if (!cancelled) setError(`积分提醒读取失败：${actionError(cause instanceof Error ? cause.message : 'CORE_INTERNAL_ERROR')}`);
      } finally {reading = false;}
    };
    void poll();
    timer = window.setInterval(() => void poll(), pointsRefreshMs);
    return () => {cancelled = true;live.current = false;window.clearInterval(timer);};
  }, []);
  const displayed = (): void => {
    if (marked.current || !live.current) return;
    marked.current = true;
    void jsonRequest('/api/hanamesh/core/points/prompt-shown', {method: 'POST'}).catch(() => {if (live.current) setError('提示记录未能保存，下次可能再次提示。请在 DSH 插件页中检查本机状态。');});
  };
  useEffect(() => {
    const node = anchor.current;
    if (pending === null || dismissed || !node) return;
    let visible = false;
    const acknowledge = (): void => {if (node.isConnected && visible && document.visibilityState === 'visible' && !hostPrimitives().isBehindModal(node)) displayed();};
    const intersection = new IntersectionObserver(entries => {visible = entries.some(entry => entry.target === node && entry.isIntersecting);acknowledge();});
    const mutation = new MutationObserver(acknowledge);
    intersection.observe(node);mutation.observe(node.ownerDocument.body, {childList: true, subtree: true});document.addEventListener('visibilitychange', acknowledge);
    return () => {intersection.disconnect();mutation.disconnect();document.removeEventListener('visibilitychange', acknowledge);};
  }, [pending, dismissed]);
  if (dismissed) return null;
  if (pending === null) return error ? createElement('p', {role: 'alert'}, error) : null;
  return createElement('div', {ref: anchor, className: 'hm-core-bind-banner', 'data-hanamesh-core-prompt': 'bind', role: 'status'},
    createElement('b', null, '积分提醒'), createElement('span', null, `你已累计 ${fen(pending)}（待绑定）。绑定后这些分才归入你的账号。分不是代币。`),
    createElement('button', {type: 'button', onClick: () => navigateTab('account')}, '去绑定'),
    createElement('button', {type: 'button', onClick: () => setDismissed(true)}, '以后再说'),
    error && createElement('p', {role: 'alert'}, error));
}

// One queue per loaded Core client serializes StrictMode and duplicate sidebar mounts. Web Locks, when
// present, also serializes tabs of the same carrier origin. Without it independent windows can both show;
// the durable marker and the original explicit-consent write barrier remain authoritative.
let consentPromptTail: Promise<void> = Promise.resolve();
export function FirstConsentPrompt({openSettings}: {openSettings: () => void}): ReactNode {
  const [view, setView] = useState<CoreState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false);
  const active = useRef(false);
  const finish = useRef<(() => void) | null>(null);
  const writing = useRef(false);
  const markerWrite = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    let cancelled = false;
    let release!: () => void;
    const closed = new Promise<void>(resolve => { release = resolve; });
    finish.current = release;
    active.current = true;
    const run = async (): Promise<void> => {
      if (cancelled) return;
      const next = await jsonRequest<CoreState>('/api/hanamesh/core/state');
      if (cancelled || !next.consentPrompt?.show) return;
      setView(next);
      await closed;
      await markerWrite.current;
    };
    const previous = consentPromptTail;
    const task = previous.then(async () => {
      if (cancelled) return;
      if (typeof navigator !== 'undefined' && navigator.locks?.request) {
        await navigator.locks.request('hanamesh-core-first-consent', run);
      } else await run();
    }).catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'CORE_INTERNAL_ERROR'); });
    consentPromptTail = task;
    return () => { cancelled = true; active.current = false; release(); };
  }, []);
  const displayed = (): void => {
    markerWrite.current = jsonRequest('/api/hanamesh/core/consent/prompt-shown', {method: 'POST'})
      .then(() => { if (active.current) setShown(true); })
      .catch(cause => { if (active.current) setError(cause instanceof Error ? cause.message : 'CORE_INTERNAL_ERROR'); });
  };
  const displayFailed = (): void => { setError('CORE_CONSENT_PROMPT_DISPLAY_FAILED'); setView(null); finish.current?.(); };
  const close = (): void => { setView(null); finish.current?.(); };
  const enable = async (): Promise<void> => {
    if (writing.current || !shown) return;
    writing.current = true; setBusy(true); setError(null);
    try {
      const before = await jsonRequest<CoreState>('/api/hanamesh/core/state');
      if (!active.current) return;
      if (before.consent.state === 'withheld') await jsonRequest('/api/hanamesh/core/consent', {method: 'POST', body: JSON.stringify({state: 'granted'})});
      const next = await jsonRequest<CoreState>('/api/hanamesh/core/state');
      if (next.consent.state !== 'granted') throw new Error('CORE_CONSENT_NOT_CONFIRMED');
      if (active.current) close();
    } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : 'CORE_INTERNAL_ERROR'); }
    finally { writing.current = false; if (active.current) setBusy(false); }
  };
  const settings = (): void => { close(); openSettings(); };
  return createElement(Fragment, null,
    view && createElement(CoreModal, {className: 'hm-core-prompt', title: '开启 HanaMesh 使用记录？', onClose: close, onDisplayed: displayed, onDisplayError: displayFailed},
      createElement('div', {'data-hanamesh-core-prompt': 'consent'},
      createElement('h3', {id: 'hm-core-first-consent-title'}, '开启 HanaMesh 使用记录？'),
      createElement('p', null, '开启后，符合规则的插件使用可计贡献积分并支持作者收入；仅记录时间、插件、功能、成败和渠道，不保存/上传对话、工具内容、文件或凭据；账号页可随时关闭。'),
      createElement('p', null, '只有你亲自点击开启才会记录；不选择或稍后均不记录。账号绑定另行确认，积分归属和作者收入按服务端规则处理。'),
      createElement('p', null, view?.serverOrigin ? `记录将上报至 ${view.serverOrigin}。可先到 DSH 插件页的 HanaMesh 包配置修改服务端。` : '尚未配置服务端（CORE_SERVER_NOT_CONFIGURED）；请先到 DSH 插件页的 HanaMesh 包配置填写服务端。'),
      view?.identity?.status === 'failed' && createElement('p', {role: 'alert'}, `本机设备身份不可用（${view.identity.reason ?? 'CORE_NOT_READY'}）；请到 HanaMesh 账号检查身份存储位置并重新读取。`),
      createElement('div', {className: 'hm-core-actions'},
        createElement('button', {type: 'button', disabled: busy || !shown, onClick: () => { void enable(); }}, '开启'),
        createElement('button', {type: 'button', disabled: busy, onClick: close}, '稍后'),
        createElement('button', {type: 'button', disabled: busy, onClick: settings}, '打开账号')),
      error && createElement('p', {role: 'alert'}, `未能确认：${error}。可打开 HanaMesh 账号读取当前状态并手动选择。`))),
    error && !view && createElement('p', {role: 'alert'}, `HanaMesh 首次提示：${error}。`, createElement('button', {type: 'button', onClick: settings}, '打开账号')));
}

export const name = 'hanamesh-core-client';
export const inject = ['slots', 'connection'];
export function apply(ctx: ClientContext): void {
  ctx.effect(() => startClientPeerLease(ctx.connection, window), 'hanamesh-core:client-peer-lease');
  ctx.inject?.(['layout'], scoped => {
    scoped.effect(() => registerCorePages(scoped), 'hanamesh-core:pages');
  });
  ctx.effect(() => {
    const style = document.createElement('style'); style.dataset['hanameshCore'] = 'client'; style.textContent = styleText; document.head.append(style);
    const configuration = registerCorePluginConfig(ctx);
    const overlay = ctx.slots.inject('shell.overlay', () => ctx.slots.register({name: 'shell.overlay', id: 'hanamesh-core.consent'}, () => createElement(FirstConsentPrompt, {openSettings: () => {
      openCoreAccount();
    }})));
    return () => {overlay();configuration();style.remove();};
  }, 'hanamesh-core:client');
}

import {createElement, useEffect, useState, type ReactNode} from 'react';

interface SlotRegistry {
  inject(name: string, run: () => (() => void)): () => void;
  register(spec: {name: string; id: string; order: number; label: string}, component: unknown): () => void;
}
interface ClientContext {slots: SlotRegistry; effect(run: () => (() => void), label?: string): unknown}

type ComponentRow = {id: string; label: string; status: string; version: string | null; requiredRange: string; nextStep: string | null; serviceReady?: boolean};
type CoreState = {
  deviceId: string;
  registration: {status: 'unregistered' | 'registered' | 'failed'; lastError: string | null};
  consent: {state: 'withheld' | 'granted'};
  session: {bound: boolean | null};
  /** usage rc.3+: GitHub account name of the bound principal; null when unbound or the server predates it. */
  account: {provider: 'github'; displayName: string} | null;
  serverOrigin: string | null;
  websiteOrigin: string | null;
  health: {mode: 'normal' | 'restricted' | 'blocked' | 'repair'; fault: string | null};
  components: ComponentRow[];
  contributions: {status: 'unavailable'; reason: string} | {status: 'ready'; windowDays: 90; actions: Record<'install' | 'open' | 'use' | 'uninstall', number>};
};

const styleText = `
.hm-core-section{display:flex;flex-direction:column;gap:0;color:var(--dsw-alias-label-primary);font:14px/1.55 system-ui,sans-serif}
.hm-core-section h2{font-size:20px;margin:0 0 8px}.hm-core-row{display:grid;grid-template-columns:104px minmax(0,1fr);gap:16px;padding:16px 0;border-bottom:1px solid var(--dsw-alias-line-1,#e8e8e8)}
.hm-core-row>strong{font-weight:600}.hm-core-copy{display:flex;flex-direction:column;gap:8px;min-width:0}.hm-core-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.hm-core-section button,.hm-core-footer{cursor:pointer;border:1px solid var(--dsw-alias-line-1,#d8d8d8);border-radius:10px;background:transparent;color:inherit;padding:7px 12px;font:inherit}
.hm-core-section button:hover,.hm-core-footer:hover{background:var(--dsw-alias-interactive-bg-hover,#f4f4f4)}.hm-core-muted{color:var(--dsw-alias-label-secondary,#6f6f6f);font-size:13px}
.hm-core-switch{display:inline-flex;gap:9px;align-items:center}.hm-core-components{display:grid;gap:5px}.hm-core-error{color:var(--dsw-alias-state-error-primary,#b42318)}
.hm-core-footer{width:100%;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hm-core-footer[data-wide=false]{width:36px;height:36px;padding:0;text-align:center;border-radius:50%}
@media(max-width:620px){.hm-core-row{grid-template-columns:1fr;gap:6px}}
`;

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {...init, headers: {...init?.headers, ...(init?.body ? {'content-type': 'application/json'} : {})}});
  const body = await response.json() as T & {error?: {code?: string}};
  if (!response.ok) throw new Error(body.error?.code ?? `HTTP_${response.status}`);
  return body;
}

function componentText(row: ComponentRow): string {
  if (row.status === 'satisfied' && row.id === 'usage' && row.serviceReady === false) return `已安装 ${row.version ?? ''}，服务未就绪`.trim();
  if (row.status === 'satisfied') return `已安装 ${row.version ?? ''}`.trim();
  if (row.status === 'missing') return '未安装';
  if (row.status === 'inactive') return '已禁用';
  if (row.status === 'incompatible') return `版本不匹配 ${row.version ?? '未知'} ≠ ${row.requiredRange}`;
  return `需修复${row.nextStep ? `：${row.nextStep}` : ''}`;
}

function Row({label, children}: {label: string; children?: ReactNode}): ReactNode {
  return createElement('div', {className: 'hm-core-row'}, createElement('strong', null, label), createElement('div', {className: 'hm-core-copy'}, children));
}

function HanaMeshSection(): ReactNode {
  const [state, setState] = useState<CoreState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = async (): Promise<void> => {
    try { setState(await jsonRequest<CoreState>('/api/hanamesh/core/state')); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'CORE_UPSTREAM_UNAVAILABLE'); }
  };
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 10_000); return () => window.clearInterval(timer); }, []);
  const post = async (path: string, body?: unknown): Promise<void> => {
    try { await jsonRequest(path, {method: 'POST', ...(body === undefined ? {} : {body: JSON.stringify(body)})}); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'CORE_UPSTREAM_UNAVAILABLE'); }
  };
  const bind = async (): Promise<void> => {
    try {
      const link = await jsonRequest<{url: string}>('/api/hanamesh/core/bind-link', {method: 'POST'});
      window.open(link.url, '_blank', 'noopener,noreferrer');
      void post('/api/hanamesh/core/open-external', {url: link.url});
      // The bound flag rides on the contributions query (60 s cache). After sending the user to the
      // website, ask the host to re-read for up to three minutes so the row flips without a restart.
      let polls = 0;
      const timer = window.setInterval(() => {
        polls += 1;
        void jsonRequest<CoreState>('/api/hanamesh/core/refresh', {method: 'POST'}).then(next => {
          setState(next);
          if (next.session.bound === true || polls >= 12) window.clearInterval(timer);
        }).catch(() => { if (polls >= 12) window.clearInterval(timer); });
      }, 15_000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'CORE_UPSTREAM_UNAVAILABLE'); }
  };
  const visit = (path = '/'): void => {
    if (!state?.websiteOrigin) { setError('CORE_URL_NOT_ALLOWED'); return; }
    const url = new URL(path, state.websiteOrigin).href;
    window.open(url, '_blank', 'noopener,noreferrer');
    void post('/api/hanamesh/core/open-external', {url});
  };
  if (!state) return createElement('section', {className: 'hm-core-section', 'data-hanamesh-core': 'loading'}, createElement('h2', null, 'HanaMesh'), createElement('p', {className: error ? 'hm-core-error' : 'hm-core-muted'}, error ? `未能读取：${error}` : '正在读取…'));
  const registration = state.serverOrigin === null ? '未连接' : state.registration.status === 'registered' ? '已注册' : state.registration.status === 'failed' ? `注册失败：${state.registration.lastError ?? '未知'}` : '未注册';
  const contributions = state.contributions.status === 'ready'
    ? `install ${state.contributions.actions.install} · open ${state.contributions.actions.open} · use ${state.contributions.actions.use} · uninstall ${state.contributions.actions.uninstall}　窗口：近 ${state.contributions.windowDays} 天`
    : `暂不可用：${state.contributions.reason}`;
  return createElement('section', {className: 'hm-core-section', 'data-hanamesh-core': 'ready'},
    createElement('h2', null, 'HanaMesh'),
    createElement('p', {className: 'hm-core-muted', 'data-hanamesh-core-hint': 'bundle-exclusive'}, '套件与单包互斥：已单独安装 hanamesh-usage 或 @hanamesh/dsh-app-host 的用户，装 hanamesh-core 前先 dsh plugin remove 它们；已装套件后再单独安装它们同样会以 duplicate loader entry id 起不来。'),
    error && createElement('p', {className: 'hm-core-error', role: 'alert'}, `未能保存：${error}`),
    createElement(Row, {label: '设备身份'}, createElement('div', {className: 'hm-core-actions'}, createElement('span', null, `设备 id：${state.deviceId.slice(0, 8)}…　注册：${registration}`), state.serverOrigin && state.registration.status !== 'registered' && createElement('button', {type: 'button', onClick: () => void post('/api/hanamesh/core/device/register')}, '重试注册'))),
    createElement(Row, {label: '数据授权'}, createElement('label', {className: 'hm-core-switch'}, createElement('input', {type: 'checkbox', checked: state.consent.state === 'granted', onChange: event => void post('/api/hanamesh/core/consent', {state: event.currentTarget.checked ? 'granted' : 'withheld'})}), '允许 HanaMesh 记录并上报本设备的使用事件（安装/打开/使用/卸载；不含内容与对话）'), createElement('span', null, `当前：${state.consent.state === 'granted' ? '已开启' : '已关闭'}`), createElement('small', {className: 'hm-core-muted'}, '撤回后本地缓冲清空并向服务端发起删除；原始记录服务端保留 90 天。')),
    createElement(Row, {label: '账号'}, createElement('div', {className: 'hm-core-actions'},
      state.session.bound === true
        ? createElement('span', {'data-hanamesh-core-bound': 'true', ...(state.account ? {'data-hanamesh-core-account': state.account.displayName} : {})}, state.account?.provider === 'github'
          ? `已绑定到 GitHub 账号 ${state.account.displayName}（设备 ${state.deviceId.slice(0, 8)}…）`
          : `已绑定到网站账号（设备 ${state.deviceId.slice(0, 8)}… 已关联你的 GitHub 登录）`)
        : createElement('span', {'data-hanamesh-core-bound': String(state.session.bound)}, state.session.bound === false ? '未绑定：绑定后网站才能把本设备的贡献记到你的账号' : state.serverOrigin === null ? '未连接服务端' : '绑定状态读取中…'),
      state.session.bound === true
        ? createElement('button', {type: 'button', onClick: () => visit('/me')}, '在网站查看账号与设备')
        : createElement('button', {type: 'button', onClick: () => void bind()}, '去网站绑定'))),
    createElement(Row, {label: '我的 Hana'}, createElement('div', {className: 'hm-core-actions'}, createElement('span', null, state.session.bound === true ? '可领权益 / 认领状态：已绑定，在网站「我的」页查看' : '可领权益 / 认领状态：绑定后在网站查看'), createElement('button', {type: 'button', onClick: () => visit('/me')}, '去网站'))),
    createElement(Row, {label: '本设备贡献累计'}, createElement('span', null, contributions)),
    createElement(Row, {label: '组件'}, createElement('div', {className: 'hm-core-components'}, state.health.fault && createElement('span', {className: 'hm-core-error'}, `检查未完成（${state.health.fault}）`), ...state.components.map(row => createElement('span', {key: row.id}, `${row.label}：${componentText(row)}`)), createElement('span', {className: 'hm-core-muted', 'data-hanamesh-core-hint': 'support-dependencies'}, '支持依赖：@hanamesh/lib-provision、zod（不是插件，DSH Market 里会显示为「Installed, not active」，属正常，无需操作）'), createElement('button', {type: 'button', onClick: () => void post('/api/hanamesh/core/health/recheck')}, '重新检查'))),
    createElement(Row, {label: '关于'}, createElement('div', {className: 'hm-core-actions'}, createElement('span', null, 'hanamesh-core 0.2.0-rc.30 · DSH >=0.1.5-alpha.1 <0.2.0（已实测 0.1.5-alpha.1、0.1.5-rc.2）'), createElement('button', {type: 'button', onClick: () => visit('/')}, '去网站'))),
  );
}

/** Settings nav entry named "HanaMesh" — the DSH default dialog (`[role=dialog] nav button`) or a full-page settings layout
 *  (e.g. dsh-better-sidebar renders Settings as a page with a "Back to app" nav). Our own sidebar footer is excluded. */
function findHanaMeshSettingsEntry(): HTMLButtonElement | undefined {
  const inDialog = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] nav button')].find(node => node.textContent?.trim() === 'HanaMesh');
  if (inDialog) return inDialog;
  const candidates = [...document.querySelectorAll<HTMLButtonElement>('button, [role="tab"], a')].filter(node => node.textContent?.trim() === 'HanaMesh' && !node.classList.contains('hm-core-footer') && !node.closest('.hm-core-section'));
  return candidates.at(-1) as HTMLButtonElement | undefined;
}

function openHanaMeshSettings(): void {
  const direct = findHanaMeshSettingsEntry();
  if (direct) { direct.click(); return; }
  const trigger = document.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')
    ?? [...document.querySelectorAll<HTMLButtonElement>('button')].find(node => /^(Settings|设置)$/.test(node.textContent?.trim() ?? ''));
  trigger?.click();
  let attempts = 0;
  const select = (): void => {
    const button = findHanaMeshSettingsEntry();
    if (button) button.click(); else if (++attempts < 30) window.setTimeout(select, 100);
  };
  window.setTimeout(select, 100);
}

function FooterAction({wide}: {wide: boolean}): ReactNode {
  return createElement('button', {type: 'button', className: 'hm-core-footer', 'data-wide': String(wide), title: 'HanaMesh', 'aria-label': '打开 HanaMesh 设置', onClick: openHanaMeshSettings}, wide ? 'HanaMesh' : 'H');
}

export const name = 'hanamesh-core-client';
export const inject = ['slots'];
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    const style = document.createElement('style'); style.dataset['hanameshCore'] = 'client'; style.textContent = styleText; document.head.append(style);
    const section = ctx.slots.inject('settings.section', () => ctx.slots.register({name: 'settings.section', id: 'hanamesh', order: 80, label: 'HanaMesh'}, HanaMeshSection));
    const footer = ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({name: 'sidebar.footer.action', id: 'hanamesh', order: 80, label: 'HanaMesh'}, FooterAction));
    return () => { footer(); section(); style.remove(); };
  }, 'hanamesh-core:client');
}

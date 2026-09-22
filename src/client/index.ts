import {createElement, Fragment, useEffect, useRef, useState, type ReactNode} from 'react';

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

/** T2 `GET /api/hanamesh/core/points` (host side signs the custody read). Every number is 分; the host decides `prompt.show`. */
type BreakdownKey = 'install' | 'open' | 'use' | 'claimBonus' | 'creatorMirror' | 'launchInitiator';
type HanaPoints = {hanaId: string; points: number; pending: number; breakdown: Record<BreakdownKey, number>};
type PointsState = {
  status: 'ready' | 'unavailable';
  reason: string | null;
  totalPoints: number;
  pendingTotal: number;
  hanas: HanaPoints[];
  bound: boolean | null;
  prompt: {show: boolean; shownAt: string | null};
};
const BREAKDOWN_LABELS: ReadonlyArray<readonly [BreakdownKey, string]> = [
  ['install', '安装'], ['open', '打开'], ['use', '使用'], ['claimBonus', '认领'], ['creatorMirror', '创作镜像'], ['launchInitiator', '发起'],
];
/** 分 can carry thousandths (creator mirror is 5% of a whole point); trim trailing zeros so the row reads as 分, not a float. */
const fen = (value: number): string => `${Number(value.toFixed(3))} 分`;
const POINTS_REASONS: Record<string, string> = {
  NOT_CONNECTED: '未连接服务端，暂时读不到分',
  CONSENT_WITHHELD: '未开启数据授权，本设备不上报事件，因此没有分',
  NOT_REGISTERED: '本设备尚未注册成功，注册后才会记分',
  CORE_UPSTREAM_UNAVAILABLE: '服务端暂时不可达，稍后再看',
};
const pointsReason = (reason: string | null): string => POINTS_REASONS[reason ?? ''] ?? `暂不可用：${reason ?? '未知'}`;

const styleText = `
.hm-core-section{display:flex;flex-direction:column;gap:0;color:var(--dsw-alias-label-primary);font:14px/1.55 system-ui,sans-serif}
.hm-core-section h2{font-size:20px;margin:0 0 8px}.hm-core-row{display:grid;grid-template-columns:104px minmax(0,1fr);gap:16px;padding:16px 0;border-bottom:1px solid var(--dsw-alias-line-1,#e8e8e8)}
.hm-core-row>strong{font-weight:600}.hm-core-copy{display:flex;flex-direction:column;gap:8px;min-width:0}.hm-core-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.hm-core-section button,.hm-core-footer{cursor:pointer;border:1px solid var(--dsw-alias-line-1,#d8d8d8);border-radius:10px;background:transparent;color:inherit;padding:7px 12px;font:inherit}
.hm-core-section button:hover,.hm-core-footer:hover{background:var(--dsw-alias-interactive-bg-hover,#f4f4f4)}.hm-core-muted{color:var(--dsw-alias-label-secondary,#6f6f6f);font-size:13px}
.hm-core-switch{display:inline-flex;gap:9px;align-items:center}.hm-core-components{display:grid;gap:5px}.hm-core-error{color:var(--dsw-alias-state-error-primary,#b42318)}
.hm-core-footer{width:100%;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hm-core-footer[data-wide=false]{width:36px;height:36px;padding:0;text-align:center;border-radius:50%}
@media(max-width:620px){.hm-core-row{grid-template-columns:1fr;gap:6px}}
.hm-core-points{display:grid;gap:6px}.hm-core-points b{font-weight:600}
.hm-core-prompt{border:1px solid var(--dsw-alias-line-1,#d8d8d8);border-radius:12px;padding:20px;max-width:420px;font:14px/1.55 system-ui,sans-serif}
/* Canvas/CanvasText are the fallbacks on purpose: they are a matched system pair, so a missing DSH token can never
   produce light-on-light in the host's dark theme (rc.31 first real-UI run did exactly that with a #fff fallback). */
.hm-core-prompt{color:var(--dsw-alias-label-primary,CanvasText);background:var(--dsw-alias-bg-layer-2,Canvas)}
.hm-core-prompt::backdrop{background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.45))}.hm-core-prompt h3{margin:0 0 8px;font-size:16px}
.hm-core-prompt p{margin:0 0 14px}
.hm-core-prompt button{cursor:pointer;border:1px solid var(--dsw-alias-line-1,#d8d8d8);border-radius:10px;background:transparent;color:inherit;padding:7px 12px;font:inherit}
`;

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {...init, headers: {...init?.headers, ...(init?.body ? {'content-type': 'application/json'} : {})}});
  const body = await response.json() as T & {error?: {code?: string}};
  if (!response.ok) throw new Error(body.error?.code ?? `HTTP_${response.status}`);
  return body;
}

/** The bind landing needs a server `bind` challenge, so the link is minted by our own host route, never in the bundle. */
async function openBindPage(): Promise<string> {
  const link = await jsonRequest<{url: string}>('/api/hanamesh/core/bind-link', {method: 'POST'});
  window.open(link.url, '_blank', 'noopener,noreferrer');
  await jsonRequest('/api/hanamesh/core/open-external', {method: 'POST', body: JSON.stringify({url: link.url})}).catch(() => undefined);
  return link.url;
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
  const [points, setPoints] = useState<PointsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadPoints = async (): Promise<void> => {
    try { setPoints(await jsonRequest<PointsState>('/api/hanamesh/core/points')); }
    catch { setPoints(null); }
  };
  const load = async (): Promise<void> => {
    try { setState(await jsonRequest<CoreState>('/api/hanamesh/core/state')); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'CORE_UPSTREAM_UNAVAILABLE'); }
    await loadPoints();
  };
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 10_000); return () => window.clearInterval(timer); }, []);
  const post = async (path: string, body?: unknown): Promise<void> => {
    try { await jsonRequest(path, {method: 'POST', ...(body === undefined ? {} : {body: JSON.stringify(body)})}); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'CORE_UPSTREAM_UNAVAILABLE'); }
  };
  const bind = async (): Promise<void> => {
    try {
      await openBindPage();
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
        : createElement('button', {type: 'button', onClick: () => void bind()}, '去网站绑定'),
      // T9: the email form lives on the website; core only carries the entry point.
      createElement('button', {type: 'button', 'data-hanamesh-core-email': 'entry', onClick: () => visit('/me')}, '邮箱绑定'))),
    createElement(Row, {label: '我的 Hana'}, createElement('div', {className: 'hm-core-points', 'data-hanamesh-core-points': points?.status ?? 'loading'},
      points === null
        ? createElement('span', {className: 'hm-core-muted'}, '正在读取分…')
        : points.status === 'unavailable'
          ? createElement('span', {className: 'hm-core-muted'}, pointsReason(points.reason))
          : points.hanas.length === 0
            ? createElement('span', {className: 'hm-core-muted'}, '还没有分：安装并使用 Hana 后这里会出现每个 Hana 的分')
            : createElement(Fragment, null,
              createElement('span', {'data-hanamesh-core-total': String(points.totalPoints)}, createElement('b', null, `总计 ${fen(points.totalPoints)}`), points.pendingTotal > 0 ? `　其中待绑定 ${fen(points.pendingTotal)}` : ''),
              ...points.hanas.map(row => createElement('span', {key: row.hanaId, 'data-hanamesh-core-hana': row.hanaId},
                `${row.hanaId.slice(0, 8)}…　${fen(row.points)}${row.pending > 0 ? `（待绑定 ${fen(row.pending)}）` : ''}　`,
                createElement('small', {className: 'hm-core-muted'}, BREAKDOWN_LABELS.map(([key, label]) => `${label} ${Number(row.breakdown[key].toFixed(3))}`).join(' · ')))),
            ),
      createElement('small', {className: 'hm-core-muted', 'data-hanamesh-core-hint': 'points-not-token'}, '分不是代币：分只记录贡献，兑换比例与发币另行公布；创作者镜像按 5% 计。'),
      createElement('div', {className: 'hm-core-actions'}, createElement('button', {type: 'button', onClick: () => visit('/me')}, '去网站')))),
    createElement(Row, {label: '本设备贡献累计'}, createElement('span', null, contributions)),
    createElement(Row, {label: '组件'}, createElement('div', {className: 'hm-core-components'}, state.health.fault && createElement('span', {className: 'hm-core-error'}, `检查未完成（${state.health.fault}）`), ...state.components.map(row => createElement('span', {key: row.id}, `${row.label}：${componentText(row)}`)), createElement('span', {className: 'hm-core-muted', 'data-hanamesh-core-hint': 'support-dependencies'}, '支持依赖：@hanamesh/lib-provision、zod（不是插件，DSH Market 里会显示为「Installed, not active」，属正常，无需操作）'), createElement('button', {type: 'button', onClick: () => void post('/api/hanamesh/core/health/recheck')}, '重新检查'))),
    createElement(Row, {label: '关于'}, createElement('div', {className: 'hm-core-actions'}, createElement('span', null, 'hanamesh-core 0.2.0-rc.32 · DSH >=0.1.5-alpha.1 <0.2.0（已实测 0.1.5-alpha.1、0.1.5-rc.2）'), createElement('button', {type: 'button', onClick: () => visit('/')}, '去网站'))),
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

/** T2 one-time bind nudge. The host decides `prompt.show` (pending 分 > 0, device not bound, marker never stamped);
 *  the moment it is displayed we stamp the storage-domain marker, so a restart or reinstall never shows it again.
 *  Rendered as a native `<dialog>` in the browser top layer, so no layout hack covers the host chrome permanently. */
function PointsBindPrompt(): ReactNode {
  const [pending, setPending] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement | null>(null);
  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const poll = async (): Promise<void> => {
      try {
        const next = await jsonRequest<PointsState>('/api/hanamesh/core/points');
        if (cancelled || !next.prompt.show) return;
        window.clearInterval(timer);
        await jsonRequest('/api/hanamesh/core/points/prompt-shown', {method: 'POST'}).catch(() => undefined);
        if (cancelled) return;
        setPending(next.pendingTotal);
      } catch { /* the nudge is optional; a failed read simply waits for the next tick */ }
    };
    void poll();
    timer = window.setInterval(() => void poll(), 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    const node = dialog.current;
    if (pending === null || !node || node.open) return;
    if (typeof node.showModal === 'function') node.showModal(); else node.setAttribute('open', '');
  }, [pending]);
  if (pending === null) return null;
  const close = (): void => { dialog.current?.close?.(); setPending(null); };
  return createElement('dialog', {className: 'hm-core-prompt', ref: dialog, 'data-hanamesh-core-prompt': 'bind', onCancel: close},
    createElement('h3', null, '绑定后这些分才归入你的账号'),
    createElement('p', null, `你已累计 ${fen(pending)}（待绑定）。绑定 GitHub 账号后，这些分会全部归入账号；未绑定的分有上限。分不是代币。`),
    createElement('div', {className: 'hm-core-actions'},
      createElement('button', {type: 'button', onClick: () => { void openBindPage().catch(() => undefined); close(); }}, '去网站绑定'),
      createElement('button', {type: 'button', onClick: close}, '以后再说')));
}

function FooterAction({wide}: {wide: boolean}): ReactNode {
  return createElement(Fragment, null,
    createElement('button', {type: 'button', className: 'hm-core-footer', 'data-wide': String(wide), title: 'HanaMesh', 'aria-label': '打开 HanaMesh 设置', onClick: openHanaMeshSettings}, wide ? 'HanaMesh' : 'H'),
    createElement(PointsBindPrompt));
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

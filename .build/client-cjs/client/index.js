"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inject = exports.name = void 0;
exports.collectLatestActivity = collectLatestActivity;
exports.apply = apply;
const react_1 = require("react");
const BREAKDOWN_LABELS = [
    ['install', '安装贡献'], ['open', '打开贡献'], ['use', '应用活跃小时'], ['claimBonus', 'Creator 认领奖励'], ['creatorMirror', 'Creator 镜像奖励'], ['launchInitiator', '发起奖励'],
];
const ACTION_LABELS = { install: '安装', open: '打开', use: '应用活跃小时', uninstall: '卸载' };
/** Usage pages are oldest-first. Never present a scanned prefix as "latest" until its cursor reaches the tail. */
async function collectLatestActivity(fetchPage, previous) {
    let current = previous?.status === 'ready' ? previous : null;
    for (let page = 0; page < 5; page++) {
        const query = current?.status === 'ready' && current.window && current.nextAfter ? { ...current.window, after: current.nextAfter } : {};
        const next = await fetchPage(query);
        if (next.status !== 'ready')
            return { ...next, scanned: current?.scanned ?? 0 };
        const items = [...(current?.items ?? []), ...next.items].slice(-25);
        current = { ...next, items, scanned: (current?.scanned ?? 0) + next.items.length };
        if (!next.nextAfter)
            break;
    }
    if (current === null)
        throw new Error('ACTIVITY_PAGE_MISSING');
    return current;
}
/** 分 can carry thousandths (creator mirror is 5% of a whole point); trim trailing zeros so the row reads as 分, not a float. */
const fen = (value) => `${Number(value.toFixed(3))} 分`;
const POINTS_REASONS = {
    NOT_CONNECTED: '未连接服务端，暂时读不到分',
    CONSENT_WITHHELD: '未开启数据授权，本设备不上报事件，因此没有分',
    NOT_REGISTERED: '本设备尚未注册成功，注册后才会记分',
    CORE_UPSTREAM_UNAVAILABLE: '服务端暂时不可达，稍后再看',
};
const pointsReason = (reason) => POINTS_REASONS[reason ?? ''] ?? `暂不可用：${reason ?? '未知'}`;
const styleText = `
.hm-core-section{display:flex;flex-direction:column;gap:0;color:var(--dsw-alias-label-primary);font:14px/1.55 system-ui,sans-serif}
.hm-core-section h2{font-size:20px;margin:0 0 8px}.hm-core-row{display:grid;grid-template-columns:104px minmax(0,1fr);gap:16px;padding:16px 0;border-bottom:1px solid var(--dsw-alias-line-1,#e8e8e8)}
.hm-core-row>strong{font-weight:600}.hm-core-copy{display:flex;flex-direction:column;gap:8px;min-width:0}.hm-core-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.hm-core-section button,.hm-core-footer{cursor:pointer;border:1px solid var(--dsw-alias-line-1,#d8d8d8);border-radius:10px;background:transparent;color:inherit;padding:7px 12px;font:inherit}
.hm-core-section button:hover,.hm-core-footer:hover{background:var(--dsw-alias-interactive-bg-hover,#f4f4f4)}.hm-core-muted{color:var(--dsw-alias-label-secondary,#6f6f6f);font-size:13px}
.hm-core-switch{display:inline-flex;gap:9px;align-items:center}.hm-core-components{display:grid;gap:5px}.hm-core-error{color:var(--dsw-alias-state-error-primary,#b42318)}
.hm-core-footer{width:100%;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hm-core-footer[data-wide=false]{width:36px;height:36px;padding:0;text-align:center;border-radius:50%}
@media(max-width:620px){.hm-core-row{grid-template-columns:1fr;gap:6px}}
.hm-core-points{display:grid;gap:10px}.hm-core-points b{font-weight:600}.hm-core-hana{display:grid;gap:3px;padding:8px 0;border-top:1px solid var(--dsw-alias-line-1,#e8e8e8)}
.hm-core-events{display:grid;gap:5px}.hm-core-event{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:5px 0;border-top:1px solid var(--dsw-alias-line-1,#e8e8e8)}
.hm-core-event time{white-space:nowrap}.hm-core-event span{overflow-wrap:anywhere}
.hm-core-prompt{border:1px solid var(--dsw-alias-line-1,#d8d8d8);border-radius:12px;padding:20px;max-width:420px;font:14px/1.55 system-ui,sans-serif}
/* Canvas/CanvasText are the fallbacks on purpose: they are a matched system pair, so a missing DSH token can never
   produce light-on-light in the host's dark theme (rc.31 first real-UI run did exactly that with a #fff fallback). */
.hm-core-prompt{color:var(--dsw-alias-label-primary,CanvasText);background:var(--dsw-alias-bg-layer-2,Canvas)}
.hm-core-prompt::backdrop{background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.45))}.hm-core-prompt h3{margin:0 0 8px;font-size:16px}
.hm-core-prompt p{margin:0 0 14px}
.hm-core-prompt button{cursor:pointer;border:1px solid var(--dsw-alias-line-1,#d8d8d8);border-radius:10px;background:transparent;color:inherit;padding:7px 12px;font:inherit}
`;
async function jsonRequest(path, init) {
    const response = await fetch(path, { ...init, headers: { ...init?.headers, ...(init?.body ? { 'content-type': 'application/json' } : {}) } });
    const body = await response.json();
    if (!response.ok)
        throw new Error(body.error?.code ?? `HTTP_${response.status}`);
    return body;
}
/** The bind landing needs a server `bind` challenge, so the link is minted by our own host route, never in the bundle. */
async function openBindPage() {
    const link = await jsonRequest('/api/hanamesh/core/bind-link', { method: 'POST' });
    window.open(link.url, '_blank', 'noopener,noreferrer');
    await jsonRequest('/api/hanamesh/core/open-external', { method: 'POST', body: JSON.stringify({ url: link.url }) }).catch(() => undefined);
    return link.url;
}
function componentText(row) {
    if (row.status === 'satisfied' && row.id === 'usage' && row.serviceReady === false)
        return `已安装 ${row.version ?? ''}，服务未就绪`.trim();
    if (row.status === 'satisfied')
        return `已安装 ${row.version ?? ''}`.trim();
    if (row.status === 'missing')
        return '未安装';
    if (row.status === 'inactive')
        return '已禁用';
    if (row.status === 'incompatible')
        return `版本不匹配 ${row.version ?? '未知'} ≠ ${row.requiredRange}`;
    return `需修复${row.nextStep ? `：${row.nextStep}` : ''}`;
}
function Row({ label, children }) {
    return (0, react_1.createElement)('div', { className: 'hm-core-row' }, (0, react_1.createElement)('strong', null, label), (0, react_1.createElement)('div', { className: 'hm-core-copy' }, children));
}
function HanaMeshSection() {
    const [state, setState] = (0, react_1.useState)(null);
    const [points, setPoints] = (0, react_1.useState)(null);
    const [activity, setActivity] = (0, react_1.useState)(null);
    const [activityBusy, setActivityBusy] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)(null);
    const loadPoints = async () => {
        try {
            setPoints(await jsonRequest('/api/hanamesh/core/points'));
        }
        catch {
            setPoints(null);
        }
    };
    const loadActivity = async (more = false) => {
        if (activityBusy)
            return;
        setActivityBusy(true);
        try {
            const next = await collectLatestActivity(async (query) => {
                const params = Object.keys(query).length ? `?${new URLSearchParams(query).toString()}` : '';
                return jsonRequest(`/api/hanamesh/core/activity${params}`);
            }, more ? activity : null);
            setActivity(next);
        }
        catch {
            setActivity({ status: 'unavailable', reason: 'CORE_UPSTREAM_UNAVAILABLE', items: [], nextAfter: null, window: null, scanned: 0 });
        }
        finally {
            setActivityBusy(false);
        }
    };
    const load = async () => {
        try {
            setState(await jsonRequest('/api/hanamesh/core/state'));
            setError(null);
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : 'CORE_UPSTREAM_UNAVAILABLE');
        }
        await loadPoints();
    };
    (0, react_1.useEffect)(() => { void load(); void loadActivity(); const timer = window.setInterval(() => void load(), 10_000); return () => window.clearInterval(timer); }, []);
    const post = async (path, body) => {
        try {
            await jsonRequest(path, { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
            await load();
            if (path.endsWith('/consent'))
                await loadActivity();
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : 'CORE_UPSTREAM_UNAVAILABLE');
        }
    };
    const bind = async () => {
        try {
            await openBindPage();
            // The bound flag rides on the contributions query (60 s cache). After sending the user to the
            // website, ask the host to re-read for up to three minutes so the row flips without a restart.
            let polls = 0;
            const timer = window.setInterval(() => {
                polls += 1;
                void jsonRequest('/api/hanamesh/core/refresh', { method: 'POST' }).then(next => {
                    setState(next);
                    if (next.session.bound === true || polls >= 12)
                        window.clearInterval(timer);
                }).catch(() => { if (polls >= 12)
                    window.clearInterval(timer); });
            }, 15_000);
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : 'CORE_UPSTREAM_UNAVAILABLE');
        }
    };
    const visit = (path = '/') => {
        if (!state?.websiteOrigin) {
            setError('CORE_URL_NOT_ALLOWED');
            return;
        }
        const url = new URL(path, state.websiteOrigin).href;
        window.open(url, '_blank', 'noopener,noreferrer');
        void post('/api/hanamesh/core/open-external', { url });
    };
    if (!state)
        return (0, react_1.createElement)('section', { className: 'hm-core-section', 'data-hanamesh-core': 'loading' }, (0, react_1.createElement)('h2', null, 'HanaMesh'), (0, react_1.createElement)('p', { className: error ? 'hm-core-error' : 'hm-core-muted' }, error ? `未能读取：${error}` : '正在读取…'));
    const registration = state.serverOrigin === null ? '未连接' : state.registration.status === 'registered' ? '已注册' : state.registration.status === 'failed' ? `注册失败：${state.registration.lastError ?? '未知'}` : '未注册';
    const contributions = state.contributions.status === 'ready'
        ? `install ${state.contributions.actions.install} · open ${state.contributions.actions.open} · use ${state.contributions.actions.use} · uninstall ${state.contributions.actions.uninstall}　窗口：近 ${state.contributions.windowDays} 天`
        : `暂不可用：${state.contributions.reason}`;
    return (0, react_1.createElement)('section', { className: 'hm-core-section', 'data-hanamesh-core': 'ready' }, (0, react_1.createElement)('h2', null, 'HanaMesh'), (0, react_1.createElement)('p', { className: 'hm-core-muted', 'data-hanamesh-core-hint': 'bundle-exclusive' }, '套件与单包互斥：已单独安装 hanamesh-usage 或 @hanamesh/dsh-app-host 的用户，装 hanamesh-core 前先 dsh plugin remove 它们；已装套件后再单独安装它们同样会以 duplicate loader entry id 起不来。'), error && (0, react_1.createElement)('p', { className: 'hm-core-error', role: 'alert' }, `未能保存：${error}`), (0, react_1.createElement)(Row, { label: '设备身份' }, (0, react_1.createElement)('div', { className: 'hm-core-actions' }, (0, react_1.createElement)('span', null, `设备 id：${state.deviceId.slice(0, 8)}…　注册：${registration}`), state.serverOrigin && state.registration.status !== 'registered' && (0, react_1.createElement)('button', { type: 'button', onClick: () => void post('/api/hanamesh/core/device/register') }, '重试注册'))), (0, react_1.createElement)(Row, { label: '数据授权' }, (0, react_1.createElement)('label', { className: 'hm-core-switch' }, (0, react_1.createElement)('input', { type: 'checkbox', checked: state.consent.state === 'granted', onChange: event => void post('/api/hanamesh/core/consent', { state: event.currentTarget.checked ? 'granted' : 'withheld' }) }), '允许 HanaMesh 记录并上报本设备的使用事件（安装/打开/使用/卸载；不含内容与对话）'), (0, react_1.createElement)('span', null, `当前：${state.consent.state === 'granted' ? '已开启' : '已关闭'}`), (0, react_1.createElement)('small', { className: 'hm-core-muted' }, '撤回后本地缓冲清空并向服务端发起删除；原始记录服务端保留 90 天。')), (0, react_1.createElement)(Row, { label: '账号' }, (0, react_1.createElement)('div', { className: 'hm-core-actions' }, state.session.bound === true
        ? (0, react_1.createElement)('span', { 'data-hanamesh-core-bound': 'true', ...(state.account ? { 'data-hanamesh-core-account': state.account.displayName } : {}) }, state.account?.provider === 'github'
            ? `已绑定到 GitHub 账号 ${state.account.displayName}（设备 ${state.deviceId.slice(0, 8)}…）`
            : `已绑定到网站账号（设备 ${state.deviceId.slice(0, 8)}… 已关联你的 GitHub 登录）`)
        : (0, react_1.createElement)('span', { 'data-hanamesh-core-bound': String(state.session.bound) }, state.session.bound === false ? '未绑定：绑定后网站才能把本设备的贡献记到你的账号' : state.serverOrigin === null ? '未连接服务端' : '绑定状态读取中…'), state.session.bound === true
        ? (0, react_1.createElement)('button', { type: 'button', onClick: () => visit('/me') }, '在网站查看账号与设备')
        : (0, react_1.createElement)('button', { type: 'button', onClick: () => void bind() }, '去网站绑定'), 
    // T9: the email form lives on the website; core only carries the entry point.
    (0, react_1.createElement)('button', { type: 'button', 'data-hanamesh-core-email': 'entry', onClick: () => visit('/me') }, '邮箱绑定'))), (0, react_1.createElement)(Row, { label: '我的 Hana' }, (0, react_1.createElement)('div', { className: 'hm-core-points', 'data-hanamesh-core-points': points?.status ?? 'loading' }, points === null
        ? (0, react_1.createElement)('span', { className: 'hm-core-muted' }, '正在读取分…')
        : points.status === 'unavailable'
            ? (0, react_1.createElement)('span', { className: 'hm-core-muted' }, pointsReason(points.reason))
            : points.hanas.length === 0
                ? (0, react_1.createElement)('span', { className: 'hm-core-muted' }, '还没有分：安装并使用 Hana 后这里会出现每个 Hana 的分')
                : (0, react_1.createElement)(react_1.Fragment, null, (0, react_1.createElement)('span', { 'data-hanamesh-core-total': String(points.totalPoints) }, (0, react_1.createElement)('b', null, `总计 ${fen(points.totalPoints)}`), points.pendingTotal > 0 ? `　其中待绑定 ${fen(points.pendingTotal)}` : ''), ...points.hanas.map(row => {
                    const sources = BREAKDOWN_LABELS.map(([key, label]) => [label, row.breakdown[key]]).filter(([, value]) => value !== 0);
                    const other = Number((row.points - sources.reduce((sum, [, value]) => sum + value, 0)).toFixed(3));
                    return (0, react_1.createElement)('div', { key: row.hanaId, className: 'hm-core-hana', 'data-hanamesh-core-hana': row.hanaId }, (0, react_1.createElement)('span', null, (0, react_1.createElement)('b', null, row.displayName ?? `${row.hanaId.slice(0, 8)}…`), `　${fen(row.points)}${row.pending > 0 ? `（另有待绑定 ${fen(row.pending)}）` : ''}`), (0, react_1.createElement)('small', { className: 'hm-core-muted' }, '积分来源（按类型汇总）：', sources.length ? sources.map(([label, value]) => `${label} ${fen(value)}`).join(' · ') : '暂无已分类分项', other !== 0 ? ` · 其他账项 ${fen(other)}` : ''));
                })), (0, react_1.createElement)('small', { className: 'hm-core-muted', 'data-hanamesh-core-hint': 'points-not-token' }, '分不是代币：分只记录贡献，兑换比例与发币另行公布；创作者镜像按 5% 计。'), (0, react_1.createElement)('div', { className: 'hm-core-actions' }, (0, react_1.createElement)('button', { type: 'button', onClick: () => visit('/me') }, '去网站')))), (0, react_1.createElement)(Row, { label: '贡献事件' }, (0, react_1.createElement)('div', { className: 'hm-core-events', 'data-hanamesh-core-activity': activity?.status ?? 'loading' }, (0, react_1.createElement)('b', null, '本设备近 90 天贡献事件'), (0, react_1.createElement)('small', { className: 'hm-core-muted' }, '活跃小时按授权视图的应用网关请求计算，可能包含页面后台请求，不代表模型调用次数；事件不等于逐笔积分。积分以“我的 Hana”账本汇总为准。'), activityBusy && (0, react_1.createElement)('span', { className: 'hm-core-muted' }, '正在读取最新事件…'), activity === null ? (0, react_1.createElement)('span', { className: 'hm-core-muted' }, '正在读取事件…')
        : activity.status === 'unavailable' ? (0, react_1.createElement)('span', { className: 'hm-core-muted' }, pointsReason(activity.reason))
            : activity.nextAfter ? (0, react_1.createElement)('span', { className: 'hm-core-muted' }, `已扫描 ${activity.scanned} 条，尚未抵达最新；请继续读取。`)
                : activity.items.length === 0 ? (0, react_1.createElement)('span', { className: 'hm-core-muted' }, '本设备在此窗口没有可读的原始事件')
                    : (0, react_1.createElement)(react_1.Fragment, null, (0, react_1.createElement)('small', { className: 'hm-core-muted' }, '最新事件（新到旧）'), ...[...activity.items].reverse().map((item, index) => (0, react_1.createElement)('div', { key: `${item.occurredAt}:${item.hanaRef}:${item.action}:${index}`, className: 'hm-core-event' }, (0, react_1.createElement)('span', null, `${ACTION_LABELS[item.action]} · ${item.hanaRef}`), (0, react_1.createElement)('time', { dateTime: item.occurredAt }, new Date(item.occurredAt).toLocaleString('zh-CN'))))), (0, react_1.createElement)('div', { className: 'hm-core-actions' }, (0, react_1.createElement)('button', { type: 'button', disabled: activityBusy, onClick: () => void loadActivity() }, '刷新事件'), activity?.status === 'ready' && activity.nextAfter && (0, react_1.createElement)('button', { type: 'button', disabled: activityBusy, onClick: () => void loadActivity(true) }, '继续读取到最新')))), (0, react_1.createElement)(Row, { label: '本设备贡献累计' }, (0, react_1.createElement)('span', null, contributions)), (0, react_1.createElement)(Row, { label: '组件' }, (0, react_1.createElement)('div', { className: 'hm-core-components' }, state.health.fault && (0, react_1.createElement)('span', { className: 'hm-core-error' }, `检查未完成（${state.health.fault}）`), ...state.components.map(row => (0, react_1.createElement)('span', { key: row.id }, `${row.label}：${componentText(row)}`)), (0, react_1.createElement)('span', { className: 'hm-core-muted', 'data-hanamesh-core-hint': 'support-dependencies' }, '支持依赖：@hanamesh/lib-provision、zod（不是插件，DSH Market 里会显示为「Installed, not active」，属正常，无需操作）'), (0, react_1.createElement)('button', { type: 'button', onClick: () => void post('/api/hanamesh/core/health/recheck') }, '重新检查'))), (0, react_1.createElement)(Row, { label: '关于' }, (0, react_1.createElement)('div', { className: 'hm-core-actions' }, (0, react_1.createElement)('span', null, 'hanamesh-core 0.2.0-rc.50 · DSH >=0.1.5-alpha.1 <0.2.0（已实测 0.1.5-alpha.1、0.1.5-rc.2）'), (0, react_1.createElement)('button', { type: 'button', onClick: () => visit('/') }, '去网站'))));
}
/** Settings nav entry named "HanaMesh" — the DSH default dialog (`[role=dialog] nav button`) or a full-page settings layout
 *  (e.g. dsh-better-sidebar renders Settings as a page with a "Back to app" nav). Our own sidebar footer is excluded. */
function findHanaMeshSettingsEntry() {
    const inDialog = [...document.querySelectorAll('[role="dialog"] nav button')].find(node => node.textContent?.trim() === 'HanaMesh');
    if (inDialog)
        return inDialog;
    const candidates = [...document.querySelectorAll('button, [role="tab"], a')].filter(node => node.textContent?.trim() === 'HanaMesh' && !node.classList.contains('hm-core-footer') && !node.closest('.hm-core-section'));
    return candidates.at(-1);
}
function openHanaMeshSettings() {
    const direct = findHanaMeshSettingsEntry();
    if (direct) {
        direct.click();
        return;
    }
    const trigger = document.querySelector('button[aria-haspopup="dialog"]')
        ?? [...document.querySelectorAll('button')].find(node => /^(Settings|设置)$/.test(node.textContent?.trim() ?? ''));
    trigger?.click();
    let attempts = 0;
    const select = () => {
        const button = findHanaMeshSettingsEntry();
        if (button)
            button.click();
        else if (++attempts < 30)
            window.setTimeout(select, 100);
    };
    window.setTimeout(select, 100);
}
/** T2 one-time bind nudge. The host decides `prompt.show` (pending 分 > 0, device not bound, marker never stamped).
 *  P05-CORE-01: the `<dialog>` is attached to `document.body`, never inside the sidebar slot — the desktop host hides the
 *  parents of sidebar/main/rightbar while Settings is open (`display:none !important`), and a modal under a hidden ancestor
 *  is invisible yet still makes the whole page inert (Core46 locked the P05 A settings page and spent the marker unseen).
 *  The storage-domain marker is stamped only after the dialog is open AND on screen; a dialog that cannot open or is not
 *  visible is closed again at once and the attempt waits for the next poll or for the window to become visible. */
function promptOnScreen(node) {
    if (!node.open || !node.isConnected || document.visibilityState !== 'visible')
        return false;
    if (typeof node.checkVisibility === 'function' && !node.checkVisibility())
        return false;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0)
        return false;
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit !== null && node.contains(hit);
}
function buildBindPrompt(pending, onDismiss) {
    const node = document.createElement('dialog');
    node.className = 'hm-core-prompt';
    node.dataset['hanameshCorePrompt'] = 'bind';
    const title = document.createElement('h3');
    title.textContent = '绑定后这些分才归入你的账号';
    const copy = document.createElement('p');
    copy.textContent = `你已累计 ${fen(pending)}（待绑定）。绑定 GitHub 账号后，这些分会全部归入账号；未绑定的分有上限。分不是代币。`;
    const actions = document.createElement('div');
    actions.className = 'hm-core-actions';
    const bind = document.createElement('button');
    bind.type = 'button';
    bind.textContent = '去网站绑定';
    bind.addEventListener('click', () => { void openBindPage().catch(() => undefined); node.close(); });
    const later = document.createElement('button');
    later.type = 'button';
    later.textContent = '以后再说';
    later.addEventListener('click', () => node.close());
    actions.append(bind, later);
    node.append(title, copy, actions);
    // Esc (cancel) and both buttons end in `close`; the node leaves the document so nothing modal lingers.
    node.addEventListener('close', () => { node.remove(); onDismiss(); });
    return node;
}
function PointsBindPrompt() {
    (0, react_1.useEffect)(() => {
        let disposed = false;
        let busy = false;
        let shown = null;
        let timer = 0;
        const stop = () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', attempt); };
        async function attempt() {
            if (disposed || busy || shown || document.visibilityState !== 'visible')
                return;
            busy = true;
            try {
                const next = await jsonRequest('/api/hanamesh/core/points');
                if (disposed || !next.prompt.show || document.visibilityState !== 'visible')
                    return; // the host decides, the client obeys
                if (document.querySelector('dialog[data-hanamesh-core-prompt]'))
                    return; // another mount is already showing it
                const node = buildBindPrompt(next.pendingTotal, () => { shown = null; });
                document.body.append(node);
                try {
                    if (typeof node.showModal === 'function')
                        node.showModal();
                    else
                        node.setAttribute('open', '');
                }
                catch (cause) {
                    node.remove();
                    console.warn('[hanamesh-core] bind prompt could not open; marker not stamped, will retry', cause);
                    return;
                }
                if (!promptOnScreen(node)) {
                    node.close();
                    console.warn('[hanamesh-core] bind prompt not visible; marker not stamped, will retry');
                    return;
                }
                shown = node;
                stop();
                await jsonRequest('/api/hanamesh/core/points/prompt-shown', { method: 'POST' })
                    .catch((cause) => console.warn('[hanamesh-core] bind prompt shown but marker not persisted; it may show again on the next launch', cause));
            }
            catch { /* the nudge is optional; a failed read simply waits for the next tick */ }
            finally {
                busy = false;
            }
        }
        document.addEventListener('visibilitychange', attempt);
        void attempt();
        timer = window.setInterval(() => void attempt(), 60_000);
        return () => { disposed = true; stop(); const node = shown; shown = null; if (node?.open)
            node.close(); node?.remove(); };
    }, []);
    return null;
}
function FooterAction({ wide }) {
    return (0, react_1.createElement)(react_1.Fragment, null, (0, react_1.createElement)('button', { type: 'button', className: 'hm-core-footer', 'data-wide': String(wide), title: 'HanaMesh', 'aria-label': '打开 HanaMesh 设置', onClick: openHanaMeshSettings }, wide ? 'HanaMesh' : 'H'), (0, react_1.createElement)(PointsBindPrompt));
}
exports.name = 'hanamesh-core-client';
exports.inject = ['slots'];
function apply(ctx) {
    ctx.effect(() => {
        const style = document.createElement('style');
        style.dataset['hanameshCore'] = 'client';
        style.textContent = styleText;
        document.head.append(style);
        const section = ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'hanamesh', order: 80, label: 'HanaMesh' }, HanaMeshSection));
        const footer = ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({ name: 'sidebar.footer.action', id: 'hanamesh', order: 80, label: 'HanaMesh' }, FooterAction));
        return () => { footer(); section(); style.remove(); };
    }, 'hanamesh-core:client');
}

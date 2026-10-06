/* Generated from strictly checked HanaMesh core client source. React is host-supplied. */
window.__ModuleLoader__.load({id:"hanamesh-core",factory:function(require){'use strict';const module={exports:{}};const exports=module.exports;(function(module,exports,require){
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
.hm-core-section{display:flex;flex-direction:column;gap:0;color:var(--dsw-alias-label-primary,CanvasText);font:14px/1.55 system-ui,sans-serif}
.hm-core-settings-page{box-sizing:border-box;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;border:0;padding:0;color:var(--dsw-alias-label-primary,CanvasText);background:var(--dsw-alias-bg-layer-2,Canvas);font:14px/1.55 system-ui,sans-serif}
.hm-core-settings-page::backdrop{background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.45))}
.hm-core-settings-header{display:flex;align-items:center;gap:16px;position:sticky;top:0;padding:16px 24px;background:inherit;border-bottom:1px solid var(--dsw-alias-line-1,#e8e8e8);z-index:1}
.hm-core-settings-header h1{flex:1;font-size:22px;margin:0}.hm-core-settings-body{max-width:880px;padding:24px;margin:0 auto}
.hm-core-settings-header button{cursor:pointer;border:1px solid var(--dsw-alias-line-1,#d8d8d8);border-radius:10px;background:transparent;color:inherit;padding:7px 12px;font:inherit}
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
    const bindTimer = (0, react_1.useRef)(null);
    const loadPoints = async () => {
        try {
            setPoints(await jsonRequest('/api/hanamesh/core/points'));
        }
        catch (cause) {
            setPoints({ status: 'unavailable', reason: cause instanceof Error ? cause.message : 'CORE_UPSTREAM_UNAVAILABLE', totalPoints: 0, pendingTotal: 0, hanas: [], bound: null, prompt: { show: false, shownAt: null } });
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
    (0, react_1.useEffect)(() => { void load(); void loadActivity(); const timer = window.setInterval(() => void load(), 10_000); return () => { window.clearInterval(timer); if (bindTimer.current !== null)
        window.clearInterval(bindTimer.current); }; }, []);
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
            if (bindTimer.current !== null)
                window.clearInterval(bindTimer.current);
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
            bindTimer.current = timer;
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
        return (0, react_1.createElement)('section', { className: 'hm-core-section', 'data-hanamesh-core': 'loading' }, (0, react_1.createElement)('h2', null, 'HanaMesh'), (0, react_1.createElement)('p', { className: error ? 'hm-core-error' : 'hm-core-muted' }, error ? `未能读取：${error}` : '正在读取…'), error && (0, react_1.createElement)('button', { type: 'button', onClick: () => void load() }, '重新读取'));
    const registration = state.serverOrigin === null ? '未连接' : state.registration.status === 'registered' ? '已注册' : state.registration.status === 'failed' ? `注册失败：${state.registration.lastError ?? '未知'}` : '未注册';
    const contributions = state.contributions.status === 'ready'
        ? `install ${state.contributions.actions.install} · open ${state.contributions.actions.open} · use ${state.contributions.actions.use} · uninstall ${state.contributions.actions.uninstall}　窗口：近 ${state.contributions.windowDays} 天`
        : `暂不可用：${state.contributions.reason}`;
    return (0, react_1.createElement)('section', { className: 'hm-core-section', 'data-hanamesh-core': 'ready' }, (0, react_1.createElement)('h2', null, 'HanaMesh'), (0, react_1.createElement)('p', { className: 'hm-core-muted', 'data-hanamesh-core-hint': 'optional-components' }, 'Core 只安装设备身份与同意设置。使用记录和应用容器可分别安装；缺少组件时，下方会显示原因，设备身份与同意开关仍可使用。'), error && (0, react_1.createElement)('p', { className: 'hm-core-error', role: 'alert' }, `读取或保存失败：${error}`, (0, react_1.createElement)('button', { type: 'button', onClick: () => void load() }, '重新读取')), (0, react_1.createElement)(Row, { label: '设备身份' }, (0, react_1.createElement)('div', { className: 'hm-core-actions' }, (0, react_1.createElement)('span', null, `设备 id：${state.deviceId.slice(0, 8)}…　注册：${registration}`), state.serverOrigin && state.registration.status !== 'registered' && (0, react_1.createElement)('button', { type: 'button', onClick: () => void post('/api/hanamesh/core/device/register') }, '重试注册'))), (0, react_1.createElement)(Row, { label: '数据授权' }, (0, react_1.createElement)('label', { className: 'hm-core-switch' }, (0, react_1.createElement)('input', { type: 'checkbox', checked: state.consent.state === 'granted', onChange: event => void post('/api/hanamesh/core/consent', { state: event.currentTarget.checked ? 'granted' : 'withheld' }) }), '允许 HanaMesh 记录并上报本设备的使用事件（安装/打开/使用/卸载；不含内容与对话）'), (0, react_1.createElement)('span', null, `当前：${state.consent.state === 'granted' ? '已开启' : '已关闭'}`), (0, react_1.createElement)('small', { className: 'hm-core-muted' }, '撤回后本地缓冲清空并向服务端发起删除；原始记录服务端保留 90 天。')), (0, react_1.createElement)(Row, { label: '账号' }, (0, react_1.createElement)('div', { className: 'hm-core-actions' }, state.session.bound === true
        ? (0, react_1.createElement)('span', { 'data-hanamesh-core-bound': 'true', ...(state.account ? { 'data-hanamesh-core-account': state.account.displayName } : {}) }, state.account?.provider === 'github'
            ? `已绑定到 GitHub 账号 ${state.account.displayName}（设备 ${state.deviceId.slice(0, 8)}…）`
            : `已绑定到网站账号（设备 ${state.deviceId.slice(0, 8)}… 已关联你的 GitHub 登录）`)
        : (0, react_1.createElement)('span', { 'data-hanamesh-core-bound': String(state.session.bound) }, state.session.bound === false ? '未绑定：绑定后网站才能把本设备的贡献记到你的账号' : state.serverOrigin === null ? '未连接服务端' : '绑定状态读取中…'), state.session.bound === true
        ? (0, react_1.createElement)('button', { type: 'button', onClick: () => visit('/me') }, '在网站查看账号与设备')
        : (0, react_1.createElement)('button', { type: 'button', onClick: () => void bind() }, '去网站绑定'), 
    // T9: the email form lives on the website; core only carries the entry point.
    (0, react_1.createElement)('button', { type: 'button', 'data-hanamesh-core-email': 'entry', onClick: () => visit('/me') }, '邮箱绑定'))), (0, react_1.createElement)(Row, { label: '我的Hana' }, (0, react_1.createElement)('div', { className: 'hm-core-points', 'data-hanamesh-core-points': points?.status ?? 'loading' }, points === null
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
                    : (0, react_1.createElement)(react_1.Fragment, null, (0, react_1.createElement)('small', { className: 'hm-core-muted' }, '最新事件（新到旧）'), ...[...activity.items].reverse().map((item, index) => (0, react_1.createElement)('div', { key: `${item.occurredAt}:${item.hanaRef}:${item.action}:${index}`, className: 'hm-core-event' }, (0, react_1.createElement)('span', null, `${ACTION_LABELS[item.action]} · ${item.hanaRef}`), (0, react_1.createElement)('time', { dateTime: item.occurredAt }, new Date(item.occurredAt).toLocaleString('zh-CN'))))), (0, react_1.createElement)('div', { className: 'hm-core-actions' }, (0, react_1.createElement)('button', { type: 'button', disabled: activityBusy, onClick: () => void loadActivity() }, '刷新事件'), activity?.status === 'ready' && activity.nextAfter && (0, react_1.createElement)('button', { type: 'button', disabled: activityBusy, onClick: () => void loadActivity(true) }, '继续读取到最新')))), (0, react_1.createElement)(Row, { label: '本设备贡献累计' }, (0, react_1.createElement)('span', null, contributions)), (0, react_1.createElement)(Row, { label: 'HanaMesh套件' }, (0, react_1.createElement)('div', { className: 'hm-core-components' }, state.health.fault && (0, react_1.createElement)('span', { className: 'hm-core-error' }, `检查未完成（${state.health.fault}）`), ...state.components.map(row => (0, react_1.createElement)('span', { key: row.id }, `${row.label}：${componentText(row)}`)), (0, react_1.createElement)('button', { type: 'button', onClick: () => void post('/api/hanamesh/core/health/recheck') }, '重新检查'))), (0, react_1.createElement)(Row, { label: '关于' }, (0, react_1.createElement)('div', { className: 'hm-core-actions' }, (0, react_1.createElement)('span', null, 'hanamesh-core 0.2.0-rc.53 · DSH 0.2.0-rc.2'), (0, react_1.createElement)('button', { type: 'button', onClick: () => visit('/') }, '去网站'))));
}
/** A complete Core-owned page in the browser top layer. Its only navigation
 * is FooterAction's local state; no host menu, settings service or DOM lookup. */
function HanaMeshSettingsPage({ onClose, restoreFocus }) {
    const page = (0, react_1.useRef)(null);
    (0, react_1.useEffect)(() => {
        const node = page.current;
        if (!node)
            return;
        node.showModal();
        return () => { if (node.open)
            node.close(); restoreFocus(); };
    }, []);
    return (0, react_1.createElement)('dialog', { ref: page, className: 'hm-core-settings-page', 'data-hanamesh-core-page': 'settings', 'aria-labelledby': 'hm-core-settings-title', onCancel: (event) => { event.preventDefault(); onClose(); } }, (0, react_1.createElement)('header', { className: 'hm-core-settings-header' }, (0, react_1.createElement)('button', { type: 'button', onClick: onClose }, '返回'), (0, react_1.createElement)('h1', { id: 'hm-core-settings-title' }, 'HanaMesh 设置'), (0, react_1.createElement)('button', { type: 'button', onClick: onClose, 'aria-label': '关闭 HanaMesh 设置' }, '关闭')), (0, react_1.createElement)('div', { className: 'hm-core-settings-body' }, (0, react_1.createElement)(HanaMeshSection)));
}
/** T2 one-time bind nudge. The host decides `prompt.show` (pending 分 > 0, device not bound, marker never stamped);
 *  the moment it is displayed we stamp the storage-domain marker, so a restart or reinstall never shows it again.
 *  Rendered as a native `<dialog>` in the browser top layer, so no layout hack covers the host chrome permanently. */
function PointsBindPrompt() {
    const [pending, setPending] = (0, react_1.useState)(null);
    const dialog = (0, react_1.useRef)(null);
    (0, react_1.useEffect)(() => {
        let cancelled = false;
        let timer = 0;
        const poll = async () => {
            try {
                const next = await jsonRequest('/api/hanamesh/core/points');
                if (cancelled || !next.prompt.show)
                    return;
                window.clearInterval(timer);
                await jsonRequest('/api/hanamesh/core/points/prompt-shown', { method: 'POST' }).catch(() => undefined);
                if (cancelled)
                    return;
                setPending(next.pendingTotal);
            }
            catch { /* the nudge is optional; a failed read simply waits for the next tick */ }
        };
        void poll();
        timer = window.setInterval(() => void poll(), 60_000);
        return () => { cancelled = true; window.clearInterval(timer); };
    }, []);
    (0, react_1.useEffect)(() => {
        const node = dialog.current;
        if (pending === null || !node || node.open)
            return;
        if (typeof node.showModal === 'function')
            node.showModal();
        else
            node.setAttribute('open', '');
    }, [pending]);
    if (pending === null)
        return null;
    const close = () => { dialog.current?.close?.(); setPending(null); };
    return (0, react_1.createElement)('dialog', { className: 'hm-core-prompt', ref: dialog, 'data-hanamesh-core-prompt': 'bind', onCancel: close }, (0, react_1.createElement)('h3', null, '绑定后这些分才归入你的账号'), (0, react_1.createElement)('p', null, `你已累计 ${fen(pending)}（待绑定）。绑定 GitHub 账号后，这些分会全部归入账号；未绑定的分有上限。分不是代币。`), (0, react_1.createElement)('div', { className: 'hm-core-actions' }, (0, react_1.createElement)('button', { type: 'button', onClick: () => { void openBindPage().catch(() => undefined); close(); } }, '去网站绑定'), (0, react_1.createElement)('button', { type: 'button', onClick: close }, '以后再说')));
}
function FooterAction({ wide }) {
    const [settingsOpen, setSettingsOpen] = (0, react_1.useState)(false);
    const entry = (0, react_1.useRef)(null);
    const closeSettings = () => { setSettingsOpen(false); };
    return (0, react_1.createElement)(react_1.Fragment, null, (0, react_1.createElement)('button', { type: 'button', className: 'hm-core-footer', 'data-wide': String(wide), title: 'HanaMesh', 'aria-label': '打开 HanaMesh 设置', ref: entry, onClick: () => setSettingsOpen(true) }, wide ? 'HanaMesh' : 'H'), settingsOpen && (0, react_1.createElement)(HanaMeshSettingsPage, { onClose: closeSettings, restoreFocus: () => entry.current?.focus() }), (0, react_1.createElement)(PointsBindPrompt));
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

})(module,exports,require);return module.exports;}});

/* Generated from strictly checked HanaMesh core client source. React is host-supplied. */
window.__ModuleLoader__.load({id:"hanamesh-core",factory:function(require){'use strict';const module={exports:{}};const exports=module.exports;(function(module,exports,require){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inject = exports.name = void 0;
exports.startClientPeerLease = startClientPeerLease;
exports.collectLatestActivity = collectLatestActivity;
exports.coreErrorText = coreErrorText;
exports.FirstConsentPrompt = FirstConsentPrompt;
exports.apply = apply;
const react_1 = require("react");
/** Current external React observation only. No storage, timers, retries or backend dependency inference. */
function startClientPeerLease(connection, page, doFetch = globalThis.fetch) {
    const generation = connection?.generation;
    if (typeof generation?.getSnapshot !== 'function' || typeof generation.subscribe !== 'function' || typeof doFetch !== 'function')
        return () => { };
    const pageId = crypto.randomUUID();
    let current, active, hidden = false, disposed = false;
    const withdraw = () => { active?.abort(); active = undefined; };
    const observe = () => {
        if (disposed || hidden)
            return;
        const next = generation.getSnapshot()?.id;
        if (next === current)
            return;
        withdraw();
        current = next;
        if (!next)
            return;
        const invocation = new AbortController();
        active = invocation;
        const payload = { protocol: 1, pageId, activationId: crypto.randomUUID(), generation: next, reactVersion: react_1.version };
        const failed = (code) => {
            if (disposed || invocation.signal.aborted)
                return;
            invocation.abort();
            console.error('HanaMesh Core client peer observation:', code);
        };
        try {
            void doFetch('/api/hanamesh/core/client-peer-lease', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: invocation.signal }).then(async (response) => {
                if (invocation.signal.aborted || disposed)
                    return;
                let code = 'CORE_SUITE_CLIENT_PEER_ENDED';
                if (!response.ok) {
                    try {
                        const value = await response.json();
                        code = typeof value.error?.code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(value.error.code) ? value.error.code : 'CORE_SUITE_CLIENT_PEER_RESPONSE_INVALID';
                    }
                    catch {
                        code = 'CORE_SUITE_CLIENT_PEER_RESPONSE_INVALID';
                    }
                }
                if (!response.ok) {
                    failed(code);
                    return;
                }
                if (response.headers.get('content-type') !== 'application/octet-stream' || !response.body) {
                    failed('CORE_SUITE_CLIENT_PEER_RESPONSE_INVALID');
                    return;
                }
                const reader = response.body.getReader(), frame = new TextEncoder().encode('hanamesh-core-client-peer-lease/1\n');
                let offset = 0;
                try {
                    for (;;) {
                        const chunk = await reader.read();
                        if (chunk.done) {
                            failed(offset === frame.length ? code : 'CORE_SUITE_CLIENT_PEER_RESPONSE_INVALID');
                            break;
                        }
                        for (const byte of chunk.value) {
                            if (offset >= frame.length || byte !== frame[offset++]) {
                                failed('CORE_SUITE_CLIENT_PEER_RESPONSE_INVALID');
                                await reader.cancel();
                                return;
                            }
                        }
                    }
                }
                finally {
                    reader.releaseLock();
                }
            }).catch(() => failed('CORE_SUITE_CLIENT_PEER_TRANSPORT_FAILED'));
        }
        catch {
            failed('CORE_SUITE_CLIENT_PEER_TRANSPORT_FAILED');
        }
    };
    const hide = () => { hidden = true; current = undefined; withdraw(); };
    const show = () => { if (!hidden)
        return; hidden = false; observe(); };
    const unsubscribe = generation.subscribe(observe);
    page.addEventListener('pagehide', hide);
    page.addEventListener('pageshow', show);
    observe();
    return () => { disposed = true; withdraw(); unsubscribe(); page.removeEventListener('pagehide', hide); page.removeEventListener('pageshow', show); };
}
const CORE_VERSION = '0.3.17';
const SUITE_INSTALL_COMMAND = "env -u GIT_CONFIG_PARAMETERS -u GIT_ASKPASS -u SSH_ASKPASS GIT_CONFIG_NOSYSTEM=1 GIT_TERMINAL_PROMPT=0 GIT_CONFIG_COUNT=2 GIT_CONFIG_KEY_0=credential.helper GIT_CONFIG_VALUE_0= GIT_CONFIG_KEY_1=credential.helper GIT_CONFIG_VALUE_1='!gh auth git-credential' dsh plugin --profile desktop add --save-exact 'github:yzsnstotz/hanamesh-core#main' 'github:yzsnstotz/hanamesh-usage#main' 'github:yzsnstotz/hanamesh-plugin-app-host#main'";
const BREAKDOWN_LABELS = [
    ['install', '安装贡献'], ['open', '打开贡献'], ['use', '使用贡献'], ['claimBonus', 'Creator 认领奖励'], ['creatorMirror', 'Creator 镜像奖励'], ['launchInitiator', '发起奖励'],
];
const ACTION_LABELS = { install: '安装', open: '打开', use: '使用', uninstall: '卸载' };
/** Usage pages are oldest-first. Never present a scanned prefix as "latest" until its cursor reaches the tail. */
async function collectLatestActivity(fetchPage, previous, limits = { activityPageBudget: 5, activityDisplayRows: 25 }) {
    if (![limits.activityPageBudget, limits.activityDisplayRows].every(value => Number.isSafeInteger(value) && value > 0))
        throw new Error('CORE_INPUT_INVALID');
    let current = previous?.status === 'ready' ? previous : null;
    for (let page = 0; page < limits.activityPageBudget; page++) {
        const query = current?.status === 'ready' && current.window && current.nextAfter ? { ...current.window, after: current.nextAfter } : {};
        const next = await fetchPage(query);
        if (next.status !== 'ready')
            return { ...next, scanned: current?.scanned ?? 0 };
        const items = [...(current?.items ?? []), ...next.items].slice(-limits.activityDisplayRows);
        current = { ...next, items, scanned: (current?.scanned ?? 0) + next.items.length };
        if (!next.nextAfter)
            break;
    }
    if (current === null)
        throw new Error('ACTIVITY_PAGE_MISSING');
    return current;
}
/** 分 can carry thousandths (the creator mirror is a server-set fraction of a point); trim trailing zeros so the row reads as 分, not a float. */
const fen = (value) => `${Number(value.toFixed(3))} 分`;
const POINTS_REASONS = {
    NOT_CONNECTED: '未连接服务端，暂时读不到分',
    CONSENT_WITHHELD: '未开启数据授权，本设备不上报事件，因此没有分',
    NOT_REGISTERED: '本设备尚未注册成功，注册后才会记分',
    CORE_POINTS_LIMIT_EXCEEDED: 'Hana 行数超过本地配置预算，请调整插件配置后刷新',
    CORE_RESPONSE_LIMIT_EXCEEDED: '响应超过本地字节预算，请检查响应或调整插件配置',
    CORE_UPSTREAM_UNAVAILABLE: '服务端暂时不可达 CORE_UPSTREAM_UNAVAILABLE，稍后再看',
};
function coreErrorText(code, upstreamStatus) {
    if (code === 'CORE_UPSTREAM_RESPONSE_INVALID')
        return `服务端响应格式不符合协议 ${code}${upstreamStatus === undefined ? '' : `（HTTP ${upstreamStatus}）`}`;
    if (upstreamStatus !== undefined)
        return `${upstreamStatus < 500 ? '服务端拒绝' : '服务端返回错误'}：${code === 'IDENTITY_ORIGIN_REJECTED' ? '来源未被信任 ' : ''}${code ?? 'CORE_UPSTREAM_HTTP_ERROR'}（HTTP ${upstreamStatus}）`;
    if (code === 'CORE_SERVER_NOT_CONFIGURED')
        return '尚未配置服务端地址';
    if (code === 'CORE_INTERNAL_ERROR')
        return '客户端处理失败 CORE_INTERNAL_ERROR，请查看组件健康信息';
    return POINTS_REASONS[code ?? ''] ?? `暂不可用：${code ?? '未知'}`;
}
const pointsReason = coreErrorText;
const ACTION_ERRORS = {
    CORE_WEBSITE_CONFIGURATION_REQUIRED: '服务端已更换，请先在 HanaMesh 设置中保存对应的网站地址；本机服务端只能打开本机网站。',
    CORE_CONFIGURATION_CHANGED: '地址已改变，请重新点击绑定。',
    CORE_CONSENT_REQUIRED: '打开数据授权后才会向服务端注册设备（绑定也需要已注册的设备）',
};
const actionError = (code) => ACTION_ERRORS[code] ?? code;
const SERVER_ERRORS = {
    CORE_ORIGIN_REJECTED: '地址无效：须为 https:// 根地址，或本机 http://127.0.0.1 / localhost / [::1]（可带端口），不能带路径、参数或账号密码',
    CORE_INPUT_INVALID: '地址无效：请填写完整地址，如 https://api.example.com',
};
const IDENTITY_FAILURES = {
    CORE_DEVICE_CORRUPT: '设备身份文件已损坏（内容无法解析，或密钥与设备 id 不一致）',
    CORE_DEVICE_STORE_UNAVAILABLE: '设备身份文件无法读取或写入（权限或磁盘问题）',
};
const IDENTITY_SOURCES = {
    existing: '', created: '本机首次创建', migrated: '已把本客户端原有身份迁移为本机共享身份', adopted: '已采用本机已有的共享身份', conflict: '已采用本机已有的共享身份',
};
const short = (id) => `${id.slice(0, 8)}…`;
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
    let body;
    try {
        body = await response.json();
    }
    catch {
        throw new Error(coreErrorText('CORE_UPSTREAM_RESPONSE_INVALID', response.status));
    }
    if (!response.ok) {
        const code = body.error?.code ?? `HTTP_${response.status}`;
        throw new Error(body.error?.upstreamStatus === undefined ? code : coreErrorText(code, body.error.upstreamStatus));
    }
    return body;
}
/** The bind landing needs a server `bind` challenge, so the link is minted by our own host route, never in the bundle. */
async function openBindPage() {
    const link = await jsonRequest('/api/hanamesh/core/bind-link', { method: 'POST' });
    await openWebsite(link.url);
    return link.url;
}
async function openWebsite(url) {
    const result = await jsonRequest('/api/hanamesh/core/open-external', { method: 'POST', body: JSON.stringify({ url }) });
    if (!result.opened)
        window.open(url, '_blank', 'noopener,noreferrer');
}
function componentText(row) {
    if (row.status === 'satisfied' && row.id === 'usage' && row.serviceReady === false)
        return '已安装，服务未就绪';
    if (row.status === 'satisfied')
        return '已安装';
    if (row.status === 'missing')
        return '未安装或未加入当前加载配置';
    if (row.status === 'inactive')
        return '已安装但未启用';
    if (row.status === 'incompatible')
        return `版本不匹配（要求 ${row.requiredRange}）`;
    return `需修复${row.reason ? `：${row.reason}` : ''}${row.nextStep ? `${row.reason ? ' ' : '：'}${row.nextStep}` : ''}`;
}
function Row({ label, children }) {
    return (0, react_1.createElement)('div', { className: 'hm-core-row' }, (0, react_1.createElement)('strong', null, label), (0, react_1.createElement)('div', { className: 'hm-core-copy' }, children));
}
/** Public same-origin Usage view; opening it never navigates the host settings. */
function LocalUsageDialog({ onClose, restoreFocus }) {
    const dialog = (0, react_1.useRef)(null);
    (0, react_1.useEffect)(() => {
        const node = dialog.current;
        if (!node)
            return;
        node.showModal();
        return () => { if (node.open)
            node.close(); restoreFocus(); };
    }, []);
    return (0, react_1.createElement)('dialog', { ref: dialog, className: 'hm-core-settings-page', 'data-hanamesh-core-page': 'local-usage', 'aria-labelledby': 'hm-core-local-usage-title', onCancel: (event) => { event.preventDefault(); onClose(); } }, (0, react_1.createElement)('header', { className: 'hm-core-settings-header' }, (0, react_1.createElement)('h1', { id: 'hm-core-local-usage-title' }, '本机使用记录'), (0, react_1.createElement)('button', { type: 'button', onClick: onClose }, '返回 HanaMesh 设置')), (0, react_1.createElement)('iframe', { src: '/api/hanamesh/usage/panel/view', title: '本机使用记录详情', style: { width: '100%', height: 'calc(100dvh - 88px)', border: 0 } }));
}
function SuiteSourceSettings(_props) {
    const [value, setValue] = (0, react_1.useState)(null), [draft, setDraft] = (0, react_1.useState)(''), [busy, setBusy] = (0, react_1.useState)(false), [error, setError] = (0, react_1.useState)(null);
    const active = (0, react_1.useRef)(true);
    const load = async (edit = false) => { const next = await jsonRequest('/api/hanamesh/core/suite-source'); if (!active.current)
        return; setValue(next); if (edit) {
        const options = next.configuration.selection.mode === 'custom' ? next.configuration.selection.options : next.configuration.configured;
        setDraft(options === null || options === undefined ? '' : JSON.stringify(options, null, 2));
    } };
    (0, react_1.useEffect)(() => { active.current = true; void load(true).catch(cause => { if (active.current)
        setError(cause instanceof Error ? cause.message : 'CORE_INTERNAL_ERROR'); }); return () => { active.current = false; }; }, []);
    const save = async (mode) => {
        if (busy)
            return;
        let selection = { mode };
        if (mode === 'custom') {
            try {
                selection = { mode, options: JSON.parse(draft) };
            }
            catch {
                setError('CORE_SUITE_SOURCE_CONFIG_INVALID');
                return;
            }
        }
        setBusy(true);
        setError(null);
        try {
            await jsonRequest('/api/hanamesh/core/suite-source', { method: 'POST', body: JSON.stringify(selection) });
            await load();
        }
        catch (cause) {
            const code = cause instanceof Error ? cause.message : 'CORE_INTERNAL_ERROR';
            if (active.current)
                setError(code);
            try {
                await load();
            }
            catch (readback) {
                if (active.current)
                    setError(code + '；读取状态失败：' + (readback instanceof Error ? readback.message : 'CORE_INTERNAL_ERROR'));
            }
        }
        finally {
            if (active.current)
                setBusy(false);
        }
    };
    return (0, react_1.createElement)('section', { 'data-hanamesh-suite-source': value?.status ?? 'loading', className: 'hm-core-copy' }, (0, react_1.createElement)('h3', null, '本机套件来源'), (0, react_1.createElement)('p', null, value?.status === 'ready' ? `运行中：${value.registry} · ${value.archiveCount} 份已核验归档` : value?.status === 'disabled' ? (value.selection === 'disabled' ? '已明确停用' : '未配置本机来源') : value?.status === 'failed' ? '来源未启动' : value?.status === 'disposed' ? '来源已释放' : '读取中…'), value && (0, react_1.createElement)('small', { className: 'hm-core-muted' }, `当前选择：${value.selection === 'custom' ? '已保存的自定义来源' : value.selection === 'disabled' ? '停用' : '插件配置'}。Core 只在本插件加载后提供来源，不预装自己，不改客户端或其他插件的来源设置。`), (error || value?.lastError) && (0, react_1.createElement)('p', { role: 'alert', className: 'hm-core-error' }, `来源操作未完成：${error ?? value?.lastError}。请核对归档与配置；不会自动重试。`), (0, react_1.createElement)('button', { type: 'button', disabled: busy, onClick: () => { setError(null); void load().catch(cause => setError(cause instanceof Error ? cause.message : 'CORE_INTERNAL_ERROR')); } }, '读取来源状态'), (0, react_1.createElement)('details', null, (0, react_1.createElement)('summary', null, '本机来源高级设置'), (0, react_1.createElement)('p', { className: 'hm-core-muted' }, '指定已交付的正常 Core、Usage、App Host 归档绝对路径与 SHA512 完整性；监听端口、上游元数据来源与所有资源预算必须明确配置。未填写不会猜地址或自动补包。'), (0, react_1.createElement)('textarea', { 'aria-label': '本机来源配置', value: draft, rows: 12, disabled: busy, onChange: (event) => setDraft(event.currentTarget.value), style: { width: '100%', boxSizing: 'border-box' } }), (0, react_1.createElement)('div', { className: 'hm-core-actions' }, (0, react_1.createElement)('button', { type: 'button', disabled: busy || !draft.trim(), onClick: () => void save('custom') }, '保存本机来源'), (0, react_1.createElement)('button', { type: 'button', disabled: busy, onClick: () => void save('disabled') }, '停用本机来源'), (0, react_1.createElement)('button', { type: 'button', disabled: busy, onClick: () => void save('configured') }, '使用插件配置'))));
}
function HanaMeshSection() {
    const [state, setState] = (0, react_1.useState)(null);
    const [points, setPoints] = (0, react_1.useState)(null);
    const [activity, setActivity] = (0, react_1.useState)(null);
    const [activityBusy, setActivityBusy] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)(null);
    const [consentBusy, setConsentBusy] = (0, react_1.useState)(false);
    const [consentError, setConsentError] = (0, react_1.useState)(null);
    const [websiteDraft, setWebsiteDraft] = (0, react_1.useState)('');
    const [websiteBusy, setWebsiteBusy] = (0, react_1.useState)(false);
    const [websiteError, setWebsiteError] = (0, react_1.useState)(null);
    const [serverDraft, setServerDraft] = (0, react_1.useState)('');
    const [serverBusy, setServerBusy] = (0, react_1.useState)(false);
    const [serverError, setServerError] = (0, react_1.useState)(null);
    const [localUsage, setLocalUsage] = (0, react_1.useState)({ status: 'loading' });
    const [localUsageOpen, setLocalUsageOpen] = (0, react_1.useState)(false);
    const [suiteCopyStatus, setSuiteCopyStatus] = (0, react_1.useState)(null);
    const localUsageEntry = (0, react_1.useRef)(null);
    const localUsageRead = (0, react_1.useRef)(0);
    const consentWrite = (0, react_1.useRef)(false);
    const stateRead = (0, react_1.useRef)(0);
    const configurationWrites = (0, react_1.useRef)(0);
    const loadLocalUsage = async () => {
        const read = ++localUsageRead.current;
        let next;
        try {
            const response = await fetch('/api/hanamesh/usage/panel', { headers: { accept: 'application/json' } });
            if (response.status === 404 || response.status === 503)
                next = { status: 'missing' };
            else {
                if (!response.ok)
                    throw new Error('LOCAL_USAGE_UNAVAILABLE');
                const panel = await response.json();
                const total = panel?.total, pending = panel?.outbox?.pending;
                if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0 || typeof pending !== 'number' || !Number.isSafeInteger(pending) || pending < 0)
                    throw new Error('LOCAL_USAGE_UNAVAILABLE');
                next = { status: 'ready', total, pending };
            }
        }
        catch {
            next = { status: 'unavailable' };
        }
        if (read === localUsageRead.current)
            setLocalUsage(next);
    };
    const loadPoints = async () => {
        try {
            setPoints(await jsonRequest('/api/hanamesh/core/points'));
        }
        catch (cause) {
            setPoints({ status: 'unavailable', reason: cause instanceof Error ? cause.message : 'CORE_INTERNAL_ERROR', totalPoints: 0, pendingTotal: 0, hanas: [], bound: null, prompt: { show: false, shownAt: null } });
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
            }, more ? activity : null, state?.configuration);
            setActivity(next);
        }
        catch (cause) {
            setActivity({ status: 'unavailable', reason: cause instanceof Error ? cause.message : 'CORE_INTERNAL_ERROR', items: [], nextAfter: null, window: null, scanned: 0 });
        }
        finally {
            setActivityBusy(false);
        }
    };
    const load = async (refresh = false) => {
        if (consentWrite.current || configurationWrites.current > 0)
            return;
        void loadLocalUsage();
        const read = ++stateRead.current;
        try {
            const next = await jsonRequest(refresh ? '/api/hanamesh/core/refresh' : '/api/hanamesh/core/state', refresh ? { method: 'POST' } : undefined);
            if (configurationWrites.current === 0 && read === stateRead.current) {
                setState(next);
                setError(null);
            }
        }
        catch (cause) {
            if (configurationWrites.current === 0 && read === stateRead.current)
                setError(cause instanceof Error ? cause.message : 'CORE_INTERNAL_ERROR');
        }
        await loadPoints();
    };
    (0, react_1.useEffect)(() => {
        void load();
        void loadActivity();
        const timer = window.setInterval(() => void load(), state?.configuration?.clientPollIntervalMs ?? 10_000);
        // Returning from website binding must bypass the host's state/points caches,
        // even when the website stayed open longer than three minutes.
        const refresh = () => { void load(true); };
        const visible = () => { if (document.visibilityState === 'visible')
            refresh(); };
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', visible);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener('focus', refresh);
            document.removeEventListener('visibilitychange', visible);
        };
    }, [state?.configuration?.clientPollIntervalMs]);
    const post = async (path, body) => {
        try {
            await jsonRequest(path, { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
            await load();
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : 'CORE_INTERNAL_ERROR');
        }
    };
    const saveConsent = async (requested) => {
        if (consentWrite.current)
            return;
        consentWrite.current = true;
        stateRead.current++;
        setConsentBusy(true);
        setConsentError(null);
        try {
            await jsonRequest('/api/hanamesh/core/consent', { method: 'POST', body: JSON.stringify({ state: requested }) });
            const next = await jsonRequest('/api/hanamesh/core/state');
            setState(next);
            if (next.consent.state !== requested)
                throw new Error('CORE_CONSENT_NOT_CONFIRMED');
            void loadPoints();
            void loadActivity();
            void loadLocalUsage();
        }
        catch (cause) {
            setConsentError(cause instanceof Error ? cause.message : 'CORE_INTERNAL_ERROR');
        }
        finally {
            consentWrite.current = false;
            setConsentBusy(false);
        }
    };
    const saveServer = async (serverOrigin) => {
        configurationWrites.current++;
        stateRead.current++;
        setServerBusy(true);
        setServerError(null);
        try {
            setState(await jsonRequest('/api/hanamesh/core/server', { method: 'POST', body: JSON.stringify({ serverOrigin }) }));
            setServerDraft('');
            void loadPoints();
            void loadActivity();
        }
        catch (cause) {
            setServerError(cause instanceof Error ? cause.message : 'CORE_INTERNAL_ERROR');
        }
        finally {
            configurationWrites.current--;
            stateRead.current++;
            setServerBusy(false);
        }
    };
    const saveWebsite = async (websiteOrigin) => {
        configurationWrites.current++;
        stateRead.current++;
        setWebsiteBusy(true);
        setWebsiteError(null);
        try {
            setState(await jsonRequest('/api/hanamesh/core/website', { method: 'POST', body: JSON.stringify({ websiteOrigin }) }));
            setWebsiteDraft('');
        }
        catch (cause) {
            setWebsiteError(cause instanceof Error ? cause.message : 'CORE_INTERNAL_ERROR');
        }
        finally {
            configurationWrites.current--;
            stateRead.current++;
            setWebsiteBusy(false);
        }
    };
    const bind = async () => {
        try {
            await openBindPage();
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : 'CORE_INTERNAL_ERROR');
        }
    };
    const visit = (path = '/') => {
        if (!state?.websiteOrigin) {
            setError('CORE_URL_NOT_ALLOWED');
            return;
        }
        const url = new URL(path, state.websiteOrigin).href;
        void openWebsite(url).catch(cause => setError(cause instanceof Error ? cause.message : 'CORE_INTERNAL_ERROR'));
    };
    if (!state)
        return (0, react_1.createElement)('section', { className: 'hm-core-section', 'data-hanamesh-core': 'loading' }, (0, react_1.createElement)('h2', null, 'HanaMesh'), (0, react_1.createElement)('p', { className: error ? 'hm-core-error' : 'hm-core-muted' }, error ? `未能读取：${error}` : '正在读取…'), error && (0, react_1.createElement)('button', { type: 'button', onClick: () => void load() }, '重新读取'));
    const waitingForConsent = state.registration.status !== 'registered' && state.consent.state !== 'granted';
    const registration = state.serverOrigin === null ? '未连接' : state.registration.status === 'registered' ? '已注册' : waitingForConsent ? '未注册：打开数据授权后注册' : state.registration.status === 'failed' ? `注册失败：${state.registration.lastError ?? '未知'}` : '未注册';
    const windowDays = state.configuration?.contributionWindowDays ?? 90;
    const serverFromSetting = state.serverOriginSource === 'setting';
    const websiteReady = state.websiteBinding?.ready ?? !!state.websiteOrigin;
    const bound = state.session?.bound ?? null;
    const identity = state.identity;
    const identityRow = identity.status === 'failed'
        ? (0, react_1.createElement)('div', { className: 'hm-core-copy', 'data-hanamesh-core-identity': 'failed' }, (0, react_1.createElement)('span', { className: 'hm-core-error', role: 'alert' }, `${IDENTITY_FAILURES[identity.reason ?? 'CORE_DEVICE_STORE_UNAVAILABLE']}${identity.detail ? `（${identity.detail}）` : ''}：${identity.location ?? '未知位置'}`), (0, react_1.createElement)('small', { className: 'hm-core-muted' }, '为避免两个客户端各算一台设备，Core 不会自动新建身份，也不会覆盖这个文件；修复或移走该文件后重新读取。在此之前不注册、不签名、不上报。'), (0, react_1.createElement)('div', { className: 'hm-core-actions' }, (0, react_1.createElement)('button', { type: 'button', onClick: () => void post('/api/hanamesh/core/refresh') }, '重新读取设备身份')))
        : (0, react_1.createElement)('div', { className: 'hm-core-copy', 'data-hanamesh-core-identity': identity.status, 'data-hanamesh-core-device': state.deviceId ?? '' }, (0, react_1.createElement)('div', { className: 'hm-core-actions' }, (0, react_1.createElement)('span', null, `设备 id：${state.deviceId ? short(state.deviceId) : '—'}　注册：${registration}`), state.serverOrigin && state.registration.status !== 'registered' && !waitingForConsent && (0, react_1.createElement)('button', { type: 'button', onClick: () => void post('/api/hanamesh/core/device/register') }, '重试注册')), (0, react_1.createElement)('small', { className: 'hm-core-muted' }, identity.status === 'shared'
            ? `本机共享：DSH 与 HanaMesh 客户端使用同一设备身份（${identity.location}）${identity.source && IDENTITY_SOURCES[identity.source] ? `；${IDENTITY_SOURCES[identity.source]}` : ''}`
            : '仅本客户端：未接入本机共享身份'), identity.replacedDeviceIds.length > 0 && (0, react_1.createElement)('small', { className: 'hm-core-muted' }, `本客户端原有身份 ${identity.replacedDeviceIds.map(short).join('、')} 与本机共享身份冲突，已改用共享身份；原身份的密钥已保留在本客户端存储中，未删除。原身份未绑定时的待绑定分不会自动转入。`));
    const contributions = state.contributions.status === 'ready'
        ? `install ${state.contributions.actions.install} · open ${state.contributions.actions.open} · use ${state.contributions.actions.use} · uninstall ${state.contributions.actions.uninstall}　窗口：近 ${state.contributions.windowDays} 天`
        : pointsReason(state.contributions.reason, state.contributions.upstreamStatus);
    const contributionsNote = state.contributions.status !== 'ready' ? null
        : state.contributions.availability === 'unavailable' ? '服务端只保留了这个窗口的一部分记录，数字不完整'
            : state.contributions.availability === 'available' ? null : '服务端未说明这个窗口的记录是否完整';
    const missingComponents = state.components.filter(row => row.status === 'missing');
    const inactiveComponents = state.components.filter(row => row.status === 'inactive');
    const copySuiteCommand = async () => {
        try {
            await navigator.clipboard.writeText(SUITE_INSTALL_COMMAND);
            setSuiteCopyStatus('已复制安装/修复命令');
        }
        catch {
            setSuiteCopyStatus('复制失败，请手动选择并复制上方命令。');
        }
    };
    return (0, react_1.createElement)('section', { className: 'hm-core-section', 'data-hanamesh-core': 'ready' }, (0, react_1.createElement)('h2', null, 'HanaMesh'), (0, react_1.createElement)('p', { className: 'hm-core-muted', 'data-hanamesh-core-hint': 'suite-components' }, 'HanaMesh 套件由 Core、使用记录（Usage）和应用容器（App Host）组成。'), (missingComponents.length > 0 || inactiveComponents.length > 0) && (0, react_1.createElement)('div', { className: 'hm-core-copy', 'data-hanamesh-core-hint': 'suite-repair' }, missingComponents.length > 0 && (0, react_1.createElement)('p', { className: 'hm-core-error' }, `套件不完整，缺 ${missingComponents.map(row => row.label).join('、')}。组件未安装或未加入当前加载配置。`), inactiveComponents.length > 0 && (0, react_1.createElement)('p', null, `已安装但未启用：${inactiveComponents.map(row => row.label).join('、')}。`), (0, react_1.createElement)('p', { className: 'hm-core-muted' }, '下方官方命令仅适用于 macOS / Linux 终端；Windows 安全命令暂未提供。此命令仅用于手动安装/修复，不是兼容升级计划。请手动安装/修复并启用套件；此页面不会自动执行。'), (0, react_1.createElement)('code', { style: { overflowWrap: 'anywhere', userSelect: 'text' } }, SUITE_INSTALL_COMMAND), (0, react_1.createElement)('div', { className: 'hm-core-actions' }, (0, react_1.createElement)('button', { type: 'button', onClick: copySuiteCommand }, '复制安装/修复命令'), suiteCopyStatus && (0, react_1.createElement)('span', { role: 'status' }, suiteCopyStatus))), error && (0, react_1.createElement)('p', { className: 'hm-core-error', role: 'alert' }, `读取或保存失败：${actionError(error)}`, (0, react_1.createElement)('button', { type: 'button', onClick: () => void load() }, '重新读取')), (0, react_1.createElement)(SuiteSourceSettings, { 'data-suite-source-section': true }), (0, react_1.createElement)(Row, { label: '设备身份' }, identityRow), state.registrationFailure && (0, react_1.createElement)('p', { role: 'alert', className: 'hm-core-error' }, `注册失败：${coreErrorText(state.registrationFailure.code, state.registrationFailure.upstreamStatus)}${state.registrationFailure.persistence ? `；状态保存失败：${state.registrationFailure.persistence}` : ''}。请使用重试注册。`), state.registrationRecovery && (0, react_1.createElement)('p', { role: 'status', 'data-hanamesh-registration-recovery': state.registrationRecovery.state }, state.registrationRecovery.message, state.registrationRecovery.nextAttemptAt && (0, react_1.createElement)('span', null, ' 下次自动核对：', (0, react_1.createElement)('time', { dateTime: state.registrationRecovery.nextAttemptAt }, new Date(state.registrationRecovery.nextAttemptAt).toLocaleString()))), (0, react_1.createElement)(Row, { label: '服务端' }, (0, react_1.createElement)('div', { className: 'hm-core-copy', 'data-hanamesh-core-server': serverFromSetting ? 'setting' : 'config' }, (0, react_1.createElement)('span', null, `当前：${state.serverOrigin ?? '未设置（不连接服务端）'}（${serverFromSetting ? '你设置的' : '出厂默认'}）`), serverFromSetting && (0, react_1.createElement)('small', { className: 'hm-core-muted' }, `出厂默认：${state.configuredServerOrigin ?? '未设置'}`), state.serverOriginFault && (0, react_1.createElement)('span', { className: 'hm-core-error', role: 'alert' }, `已保存的服务端地址无效（${state.serverOriginFault}），当前使用出厂默认；请重新保存或恢复默认。`), (0, react_1.createElement)('div', { className: 'hm-core-actions' }, (0, react_1.createElement)('input', { type: 'text', 'aria-label': '服务端地址', placeholder: 'https://api.example.com', value: serverDraft, disabled: serverBusy, onChange: (event) => setServerDraft(event.currentTarget.value) }), (0, react_1.createElement)('button', { type: 'button', disabled: serverBusy || serverDraft.trim() === '', onClick: () => void saveServer(serverDraft.trim()) }, '保存'), (0, react_1.createElement)('button', { type: 'button', disabled: serverBusy || !serverFromSetting, onClick: () => void saveServer(null) }, '恢复默认')), serverError && (0, react_1.createElement)('span', { className: 'hm-core-error', role: 'alert' }, SERVER_ERRORS[serverError] ?? `保存失败：${serverError}`), (0, react_1.createElement)('small', { className: 'hm-core-muted' }, '立即生效。注册属于某个服务端：更换后本设备在新服务端重新注册（需已打开数据授权），贡献、分与使用记录改读新服务端。'))), (0, react_1.createElement)(Row, { label: '网站' }, (0, react_1.createElement)('div', { className: 'hm-core-copy', 'data-hanamesh-core-website': state.websiteOriginSource ?? 'config' }, (0, react_1.createElement)('span', null, `当前：${state.websiteOrigin ?? '未设置'}（${state.websiteOriginSource === 'setting' ? '你设置的' : '出厂默认'}）`), state.websiteOriginSource === 'setting' && (0, react_1.createElement)('small', { className: 'hm-core-muted' }, `出厂默认：${state.configuredWebsiteOrigin ?? '未设置'}`), state.websiteOriginFault && (0, react_1.createElement)('span', { role: 'alert', className: 'hm-core-error' }, `已保存的网站地址无效（${state.websiteOriginFault}），请重新保存或恢复默认。`), (0, react_1.createElement)('div', { className: 'hm-core-actions' }, (0, react_1.createElement)('input', { type: 'text', 'aria-label': '网站地址', placeholder: 'https://market.example.com', value: websiteDraft, disabled: websiteBusy, onChange: (event) => setWebsiteDraft(event.currentTarget.value) }), (0, react_1.createElement)('button', { type: 'button', disabled: websiteBusy || websiteDraft.trim() === '', onClick: () => saveWebsite(websiteDraft.trim()) }, '保存'), (0, react_1.createElement)('button', { type: 'button', disabled: websiteBusy || state.websiteOriginSource !== 'setting', onClick: () => saveWebsite(null) }, '恢复默认')), websiteError && (0, react_1.createElement)('span', { className: 'hm-core-error', role: 'alert' }, SERVER_ERRORS[websiteError] ?? `保存失败：${websiteError}`), !websiteReady && (0, react_1.createElement)('p', { role: 'alert', className: 'hm-core-error' }, state.websiteBinding?.message ?? '请先设置对应的网站地址。'), (0, react_1.createElement)('small', { className: 'hm-core-muted' }, '立即生效。更换服务端后，须同时保存对应网站；本机服务端只能使用本机网站。'))), state.configuration && (0, react_1.createElement)(Row, { label: '运行配置' }, (0, react_1.createElement)('span', { 'data-hanamesh-core-configuration': 'visible' }, `请求时限 ${state.configuration.timeoutMs}ms；健康检查 ${state.configuration.checkIntervalMs}ms；名称请求时限 ${state.configuration.profileTimeoutMs}ms；Hana 行预算 ${state.configuration.maxHanaRows}；响应字节预算 ${state.configuration.maxResponseBytes}；界面轮询 ${state.configuration.clientPollIntervalMs ?? 10000}ms；积分刷新 ${state.configuration.pointsRefreshMs ?? 60000}ms；贡献刷新 ${state.configuration.contributionIntervalMs ?? 60000}ms；活动每次 ${state.configuration.activityPageBudget ?? 5} 页、显示 ${state.configuration.activityDisplayRows ?? 25} 行；名称并发 ${state.configuration.catalogConcurrency ?? 4}；贡献窗口 ${windowDays} 天。可在插件配置中修改。`)), (0, react_1.createElement)(Row, { label: '数据授权' }, (0, react_1.createElement)('label', { className: 'hm-core-switch' }, (0, react_1.createElement)('input', { type: 'checkbox', checked: state.consent.state === 'granted', disabled: consentBusy, onChange: event => void saveConsent(event.currentTarget.checked ? 'granted' : 'withheld') }), '允许 HanaMesh 记录并上报本设备的使用事件（安装/打开/使用/卸载；不含内容与对话）'), (0, react_1.createElement)('span', { role: 'status' }, consentBusy ? '正在保存并读取授权状态…' : `${consentError ? '上次读取' : '当前'}：${state.consent.state === 'granted' ? '已开启' : '已关闭'}`), 
    // Turning consent on sends data at once (registration, then usage records): say where, before the switch is used.
    (0, react_1.createElement)('small', { className: 'hm-core-muted', 'data-hanamesh-core-consent-destination': state.serverOrigin ?? 'none' }, state.serverOrigin === null
        ? '没有设置服务端：开启后只在本机记录，不发送。'
        : `开启后会立即向 ${state.serverOrigin}（${state.serverOriginSource === 'setting' ? '你设置的服务端' : '出厂默认服务端'}）注册本设备并上报使用记录；要换服务端，请先在上方「服务端」里改好再开启。`), consentError && (0, react_1.createElement)('p', { className: 'hm-core-error', role: 'alert' }, `授权保存未确认：${consentError}。请重新切换授权，或重新进入页面读取当前状态。`), (0, react_1.createElement)('small', { className: 'hm-core-muted' }, '撤回后本地缓冲清空并向服务端发起删除；服务端按其保留设置保存原始记录（默认 90 天）。')), (0, react_1.createElement)(Row, { label: '本机使用记录' }, (0, react_1.createElement)('div', { className: 'hm-core-copy', 'data-hanamesh-core-local-usage': localUsage.status }, (0, react_1.createElement)('span', { role: 'status' }, localUsage.status === 'ready' ? `本机已保留 ${localUsage.total} 条记录 · ${localUsage.pending} 条待上传`
        : localUsage.status === 'loading' ? '正在读取本机使用记录…'
            : localUsage.status === 'missing' ? 'Usage 服务未安装或未启动，无法读取本机使用记录。' : '本机使用记录暂时无法读取，请重试。'), (0, react_1.createElement)('small', { className: 'hm-core-muted' }, '读取本机 Usage 保存的记录与上传队列。'), (0, react_1.createElement)('div', { className: 'hm-core-actions' }, (0, react_1.createElement)('button', { type: 'button', ref: localUsageEntry, disabled: localUsage.status !== 'ready', onClick: () => setLocalUsageOpen(true) }, '查看本机记录'), (0, react_1.createElement)('button', { type: 'button', onClick: () => void loadLocalUsage() }, '刷新本机记录')))), localUsageOpen && (0, react_1.createElement)(LocalUsageDialog, { onClose: () => setLocalUsageOpen(false), restoreFocus: () => localUsageEntry.current?.focus() }), (0, react_1.createElement)(Row, { label: '账号' }, (0, react_1.createElement)('div', { className: 'hm-core-actions' }, bound === true
        ? (0, react_1.createElement)('span', { 'data-hanamesh-core-bound': 'true', ...(state.account ? { 'data-hanamesh-core-account': state.account.displayName } : {}) }, state.account?.provider === 'github'
            ? `已绑定到 GitHub 账号 ${state.account.displayName}（设备 ${short(state.deviceId ?? '')}）`
            : `已绑定到网站账号（设备 ${short(state.deviceId ?? '')} 已关联你的 GitHub 登录）`)
        : (0, react_1.createElement)('span', { 'data-hanamesh-core-bound': String(bound) }, bound === false ? '未绑定：绑定后网站才能把本设备的贡献记到你的账号' : state.serverOrigin === null ? '未连接服务端' : identity.status === 'failed' ? '设备身份不可用，暂不能绑定' : '绑定状态读取中…'), bound === true
        ? (0, react_1.createElement)('button', { type: 'button', disabled: !websiteReady, onClick: () => visit('/me') }, '在网站查看账号与设备')
        : (0, react_1.createElement)('button', { type: 'button', disabled: !websiteReady, onClick: () => void bind() }, '去网站绑定'), 
    // T9: the email form lives on the website; core only carries the entry point.
    (0, react_1.createElement)('button', { type: 'button', disabled: !websiteReady, 'data-hanamesh-core-email': 'entry', onClick: () => visit('/me') }, '邮箱绑定'))), (0, react_1.createElement)(Row, { label: '我的Hana' }, (0, react_1.createElement)('div', { className: 'hm-core-points', 'data-hanamesh-core-points': points?.status ?? 'loading' }, 
    // Single source for "bound": Usage contributions (state.session.bound), the same fact the binding row shows.
    points?.status === 'ready' && bound === false && (0, react_1.createElement)('span', { role: 'status', 'data-hanamesh-core-points-binding': 'UNBOUND' }, '未绑定：只累计、暂不可领'), points === null
        ? (0, react_1.createElement)('span', { className: 'hm-core-muted' }, '正在读取分…')
        : points.status === 'unavailable'
            ? (0, react_1.createElement)('span', { className: 'hm-core-muted' }, pointsReason(points.reason, points.upstreamStatus))
            : points.hanas.length === 0
                ? (0, react_1.createElement)('span', { className: 'hm-core-muted' }, '还没有分：安装并使用 Hana 后这里会出现每个 Hana 的分')
                : (0, react_1.createElement)(react_1.Fragment, null, (0, react_1.createElement)('span', { 'data-hanamesh-core-total': String(points.totalPoints) }, (0, react_1.createElement)('b', null, `总计 ${fen(points.totalPoints)}`), points.pendingTotal > 0 ? `　其中待绑定 ${fen(points.pendingTotal)}` : ''), ...points.hanas.map(row => {
                    const sources = BREAKDOWN_LABELS.map(([key, label]) => [label, row.breakdown[key]]).filter(([, value]) => value !== 0);
                    const other = Number((row.points - sources.reduce((sum, [, value]) => sum + value, 0)).toFixed(3));
                    return (0, react_1.createElement)('div', { key: row.hanaId, className: 'hm-core-hana', 'data-hanamesh-core-hana': row.hanaId }, (0, react_1.createElement)('span', null, (0, react_1.createElement)('b', null, row.displayName ?? `${row.hanaId.slice(0, 8)}…`), `　${fen(row.points)}${row.pending > 0 ? `（另有待绑定 ${fen(row.pending)}）` : ''}`), row.displayNameStatus === 'failed' && (0, react_1.createElement)('span', { role: 'alert', className: 'hm-core-error' }, `名称读取失败：${coreErrorText(row.displayNameReason ?? 'CORE_INTERNAL_ERROR', row.upstreamStatus)}。积分仍有效，返回窗口时可重新读取。`), (0, react_1.createElement)('small', { className: 'hm-core-muted' }, '积分来源（按类型汇总）：', sources.length ? sources.map(([label, value]) => `${label} ${fen(value)}`).join(' · ') : '暂无已分类分项', other !== 0 ? ` · 其他账项 ${fen(other)}` : ''));
                })), (0, react_1.createElement)('small', { className: 'hm-core-muted', 'data-hanamesh-core-hint': 'points-not-token' }, '分不是代币：分只记录贡献，兑换比例与发币另行公布；创作者镜像比例以服务端设置为准。'), (0, react_1.createElement)('div', { className: 'hm-core-actions' }, (0, react_1.createElement)('button', { type: 'button', disabled: !websiteReady, onClick: () => visit('/me') }, '去网站')))), (0, react_1.createElement)(Row, { label: '贡献事件' }, (0, react_1.createElement)('div', { className: 'hm-core-events', 'data-hanamesh-core-activity': activity?.status ?? 'loading' }, (0, react_1.createElement)('b', null, `本设备近 ${windowDays} 天贡献事件`), (0, react_1.createElement)('small', { className: 'hm-core-muted' }, '「打开」记插件页面被打开，「使用」记插件命令成功执行；聊天回合不计。事件不等于逐笔积分，积分以“我的 Hana”账本汇总为准。'), activityBusy && (0, react_1.createElement)('span', { className: 'hm-core-muted' }, '正在读取最新事件…'), activity === null ? (0, react_1.createElement)('span', { className: 'hm-core-muted' }, '正在读取事件…')
        : activity.status === 'unavailable' ? (0, react_1.createElement)('span', { className: 'hm-core-muted' }, pointsReason(activity.reason, activity.upstreamStatus))
            : activity.nextAfter ? (0, react_1.createElement)('span', { className: 'hm-core-muted' }, `已扫描 ${activity.scanned} 条，尚未抵达最新；请继续读取。`)
                : activity.items.length === 0 ? (0, react_1.createElement)('span', { className: 'hm-core-muted' }, '本设备在此窗口没有可读的原始事件')
                    : (0, react_1.createElement)(react_1.Fragment, null, (0, react_1.createElement)('small', { className: 'hm-core-muted' }, '最新事件（新到旧）'), ...[...activity.items].reverse().map((item, index) => (0, react_1.createElement)('div', { key: `${item.occurredAt}:${item.hanaRef}:${item.action}:${index}`, className: 'hm-core-event' }, (0, react_1.createElement)('span', null, `${ACTION_LABELS[item.action]} · ${item.hanaRef}`), (0, react_1.createElement)('time', { dateTime: item.occurredAt }, new Date(item.occurredAt).toLocaleString('zh-CN'))))), (0, react_1.createElement)('div', { className: 'hm-core-actions' }, (0, react_1.createElement)('button', { type: 'button', disabled: activityBusy, onClick: () => void loadActivity() }, '刷新事件'), activity?.status === 'ready' && activity.nextAfter && (0, react_1.createElement)('button', { type: 'button', disabled: activityBusy, onClick: () => void loadActivity(true) }, '继续读取到最新')))), (0, react_1.createElement)(Row, { label: '本设备贡献累计' }, (0, react_1.createElement)('div', { className: 'hm-core-copy', 'data-hanamesh-core-contributions': state.contributions.status === 'ready' ? (state.contributions.availability ?? 'unknown') : 'unavailable' }, (0, react_1.createElement)('span', null, contributions), contributionsNote && (0, react_1.createElement)('small', { className: state.contributions.status === 'ready' && state.contributions.availability === 'unavailable' ? 'hm-core-error' : 'hm-core-muted' }, contributionsNote))), (0, react_1.createElement)(Row, { label: '组件与版本' }, (0, react_1.createElement)('div', { className: 'hm-core-components' }, (0, react_1.createElement)('span', { 'data-hanamesh-component': 'core' }, `HanaMesh Core：版本 ${CORE_VERSION}`), state.health.fault && (0, react_1.createElement)('span', { className: 'hm-core-error' }, `检查未完成（${state.health.fault}）`), ...state.components.map(row => (0, react_1.createElement)('span', { key: row.id, 'data-hanamesh-component': row.id }, `${row.label}：版本 ${row.version ?? '未知'} · ${componentText(row)}`)), (0, react_1.createElement)('button', { type: 'button', onClick: () => void post('/api/hanamesh/core/health/recheck') }, '重新检查'))), (0, react_1.createElement)(Row, { label: '关于' }, (0, react_1.createElement)('div', { className: 'hm-core-actions' }, (0, react_1.createElement)('span', null, `hanamesh-core ${CORE_VERSION} · 支持 DSH 0.2.x`), (0, react_1.createElement)('button', { type: 'button', disabled: !websiteReady, onClick: () => visit('/') }, '去网站'))));
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
    const [binding, setBinding] = (0, react_1.useState)(undefined);
    const [bindError, setBindError] = (0, react_1.useState)(null);
    const dialog = (0, react_1.useRef)(null);
    (0, react_1.useEffect)(() => {
        let cancelled = false;
        let timer = 0;
        let pointsRefreshMs = 60_000;
        const poll = async () => {
            try {
                const next = await jsonRequest('/api/hanamesh/core/points');
                if (cancelled)
                    return;
                const configured = next.configuration?.pointsRefreshMs ?? 60_000;
                if (configured !== pointsRefreshMs) {
                    pointsRefreshMs = configured;
                    window.clearInterval(timer);
                    timer = window.setInterval(() => void poll(), pointsRefreshMs);
                }
                if (!next.prompt.show)
                    return;
                window.clearInterval(timer);
                await jsonRequest('/api/hanamesh/core/points/prompt-shown', { method: 'POST' }).catch(() => undefined);
                if (cancelled)
                    return;
                const settings = await jsonRequest('/api/hanamesh/core/state');
                if (cancelled)
                    return;
                setBinding(settings.websiteBinding ?? { ready: !!settings.websiteOrigin, reason: null, message: null });
                setPending(next.pendingTotal);
            }
            catch { /* the nudge is optional; a failed read simply waits for the next tick */ }
        };
        void poll();
        timer = window.setInterval(() => void poll(), pointsRefreshMs);
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
    return (0, react_1.createElement)('dialog', { className: 'hm-core-prompt', ref: dialog, 'data-hanamesh-core-prompt': 'bind', onCancel: close }, (0, react_1.createElement)('h3', null, '绑定后这些分才归入你的账号'), (0, react_1.createElement)('p', null, `你已累计 ${fen(pending)}（待绑定）。绑定 GitHub 账号后，这些分会全部归入账号；未绑定的分有上限。分不是代币。`), (0, react_1.createElement)('div', { className: 'hm-core-actions' }, (0, react_1.createElement)('button', { type: 'button', disabled: !binding?.ready, onClick: () => { void openBindPage().then(close).catch(cause => setBindError(actionError(cause instanceof Error ? cause.message : 'CORE_INTERNAL_ERROR'))); } }, '去网站绑定'), (0, react_1.createElement)('button', { type: 'button', onClick: close }, '以后再说')), !binding?.ready && (0, react_1.createElement)('p', { role: 'alert' }, binding?.message ?? '请先在 HanaMesh 设置中保存对应的网站地址。'), bindError && (0, react_1.createElement)('p', { role: 'alert' }, bindError));
}
// One queue per loaded Core client serializes StrictMode and duplicate sidebar mounts. Web Locks, when
// present, also serializes tabs of the same carrier origin. Without it independent windows can both show;
// the durable marker and the original explicit-consent write barrier remain authoritative.
let consentPromptTail = Promise.resolve();
function FirstConsentPrompt({ openSettings }) {
    const [view, setView] = (0, react_1.useState)(null);
    const [error, setError] = (0, react_1.useState)(null);
    const [busy, setBusy] = (0, react_1.useState)(false);
    const [shown, setShown] = (0, react_1.useState)(false);
    const dialog = (0, react_1.useRef)(null);
    const active = (0, react_1.useRef)(false);
    const finish = (0, react_1.useRef)(null);
    const writing = (0, react_1.useRef)(false);
    const markerWrite = (0, react_1.useRef)(Promise.resolve());
    (0, react_1.useEffect)(() => {
        let cancelled = false;
        let release;
        const closed = new Promise(resolve => { release = resolve; });
        finish.current = release;
        active.current = true;
        const run = async () => {
            if (cancelled)
                return;
            const next = await jsonRequest('/api/hanamesh/core/state');
            if (cancelled || !next.consentPrompt?.show)
                return;
            setView(next);
            await closed;
            await markerWrite.current;
        };
        const previous = consentPromptTail;
        const task = previous.then(async () => {
            if (cancelled)
                return;
            if (typeof navigator !== 'undefined' && navigator.locks?.request) {
                await navigator.locks.request('hanamesh-core-first-consent', run);
            }
            else
                await run();
        }).catch(cause => { if (!cancelled)
            setError(cause instanceof Error ? cause.message : 'CORE_INTERNAL_ERROR'); });
        consentPromptTail = task;
        return () => { cancelled = true; active.current = false; release(); if (dialog.current?.open)
            dialog.current.close(); };
    }, []);
    (0, react_1.useEffect)(() => {
        const node = dialog.current;
        if (!view || !node || !active.current)
            return;
        let opened = false;
        try {
            node.showModal();
            if (!node.open)
                throw new Error('not open');
            opened = true;
        }
        catch {
            setError('CORE_CONSENT_PROMPT_DISPLAY_FAILED');
            finish.current?.();
        }
        if (!opened)
            return;
        // The marker acknowledges actual native display, never merely mounting/reading/rendering.
        markerWrite.current = jsonRequest('/api/hanamesh/core/consent/prompt-shown', { method: 'POST' })
            .then(() => { if (active.current)
            setShown(true); })
            .catch(cause => { if (active.current)
            setError(cause instanceof Error ? cause.message : 'CORE_INTERNAL_ERROR'); });
    }, [view]);
    const close = () => { if (dialog.current?.open)
        dialog.current.close(); finish.current?.(); };
    const enable = async () => {
        if (writing.current || !shown)
            return;
        writing.current = true;
        setBusy(true);
        setError(null);
        try {
            const before = await jsonRequest('/api/hanamesh/core/state');
            if (!active.current)
                return;
            if (before.consent.state === 'withheld')
                await jsonRequest('/api/hanamesh/core/consent', { method: 'POST', body: JSON.stringify({ state: 'granted' }) });
            const next = await jsonRequest('/api/hanamesh/core/state');
            if (next.consent.state !== 'granted')
                throw new Error('CORE_CONSENT_NOT_CONFIRMED');
            if (active.current)
                close();
        }
        catch (cause) {
            if (active.current)
                setError(cause instanceof Error ? cause.message : 'CORE_INTERNAL_ERROR');
        }
        finally {
            writing.current = false;
            if (active.current)
                setBusy(false);
        }
    };
    const settings = () => { close(); openSettings(); };
    return (0, react_1.createElement)(react_1.Fragment, null, (0, react_1.createElement)('dialog', { className: 'hm-core-prompt', ref: dialog, 'data-hanamesh-core-prompt': 'consent', 'aria-labelledby': 'hm-core-first-consent-title', onCancel: (event) => { event.preventDefault(); close(); } }, (0, react_1.createElement)('h3', { id: 'hm-core-first-consent-title' }, '开启 HanaMesh 使用记录？'), (0, react_1.createElement)('p', null, '开启后，符合规则的插件使用可计贡献积分并支持作者收入；仅记录时间、插件、功能、成败和渠道，不保存/上传对话、工具内容、文件或凭据；设置可随时关闭。'), (0, react_1.createElement)('p', null, '只有你亲自点击开启才会记录；不选择或稍后均不记录。账号绑定另行确认，积分归属和作者收入按服务端规则处理。'), (0, react_1.createElement)('p', null, view?.serverOrigin ? `记录将上报至 ${view.serverOrigin}。可先到 HanaMesh 设置修改服务端。` : '尚未配置服务端（CORE_SERVER_NOT_CONFIGURED）；请先到 HanaMesh 设置填写服务端。'), view?.identity?.status === 'failed' && (0, react_1.createElement)('p', { role: 'alert' }, `本机设备身份不可用（${view.identity.reason ?? 'CORE_NOT_READY'}）；请到 HanaMesh 设置检查身份存储位置并重新读取。`), (0, react_1.createElement)('div', { className: 'hm-core-actions' }, (0, react_1.createElement)('button', { type: 'button', disabled: busy || !shown, onClick: () => { void enable(); } }, '开启'), (0, react_1.createElement)('button', { type: 'button', disabled: busy, onClick: close }, '稍后'), (0, react_1.createElement)('button', { type: 'button', disabled: busy, onClick: settings }, '打开设置')), error && (0, react_1.createElement)('p', { role: 'alert' }, `未能确认：${error}。可打开 HanaMesh 设置读取当前状态并手动选择。`)), error && !dialog.current?.open && (0, react_1.createElement)('p', { role: 'alert' }, `HanaMesh 首次提示：${error}。`, (0, react_1.createElement)('button', { type: 'button', onClick: settings }, '打开设置')));
}
function FooterAction({ wide }) {
    const [settingsOpen, setSettingsOpen] = (0, react_1.useState)(false);
    const entry = (0, react_1.useRef)(null);
    const closeSettings = () => { setSettingsOpen(false); };
    return (0, react_1.createElement)(react_1.Fragment, null, (0, react_1.createElement)('button', { type: 'button', className: 'hm-core-footer', 'data-wide': String(wide), title: 'HanaMesh', 'aria-label': '打开 HanaMesh 设置', ref: entry, onClick: () => setSettingsOpen(true) }, wide ? 'HanaMesh' : 'H'), settingsOpen && (0, react_1.createElement)(HanaMeshSettingsPage, { onClose: closeSettings, restoreFocus: () => entry.current?.focus() }), (0, react_1.createElement)(FirstConsentPrompt, { openSettings: () => setSettingsOpen(true) }), (0, react_1.createElement)(PointsBindPrompt));
}
exports.name = 'hanamesh-core-client';
exports.inject = ['slots', 'connection'];
function apply(ctx) {
    ctx.effect(() => startClientPeerLease(ctx.connection, window), 'hanamesh-core:client-peer-lease');
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

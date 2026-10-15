import { createElement, Fragment, useEffect, useRef, useState } from 'react';
const BREAKDOWN_LABELS = [
    ['install', '安装贡献'], ['open', '打开贡献'], ['use', '使用贡献'], ['claimBonus', 'Creator 认领奖励'], ['creatorMirror', 'Creator 镜像奖励'], ['launchInitiator', '发起奖励'],
];
const ACTION_LABELS = { install: '安装', open: '打开', use: '使用', uninstall: '卸载' };
/** Usage pages are oldest-first. Never present a scanned prefix as "latest" until its cursor reaches the tail. */
export async function collectLatestActivity(fetchPage, previous, limits = { activityPageBudget: 5, activityDisplayRows: 25 }) {
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
    CORE_UPSTREAM_UNAVAILABLE: '服务端暂时不可达，稍后再看',
};
const pointsReason = (reason) => POINTS_REASONS[reason ?? ''] ?? `暂不可用：${reason ?? '未知'}`;
const ACTION_ERRORS = {
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
    return createElement('div', { className: 'hm-core-row' }, createElement('strong', null, label), createElement('div', { className: 'hm-core-copy' }, children));
}
function HanaMeshSection() {
    const [state, setState] = useState(null);
    const [points, setPoints] = useState(null);
    const [activity, setActivity] = useState(null);
    const [activityBusy, setActivityBusy] = useState(false);
    const [error, setError] = useState(null);
    const [consentBusy, setConsentBusy] = useState(false);
    const [consentError, setConsentError] = useState(null);
    const [serverDraft, setServerDraft] = useState('');
    const [serverBusy, setServerBusy] = useState(false);
    const [serverError, setServerError] = useState(null);
    const consentWrite = useRef(false);
    const stateRead = useRef(0);
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
            }, more ? activity : null, state?.configuration);
            setActivity(next);
        }
        catch {
            setActivity({ status: 'unavailable', reason: 'CORE_UPSTREAM_UNAVAILABLE', items: [], nextAfter: null, window: null, scanned: 0 });
        }
        finally {
            setActivityBusy(false);
        }
    };
    const load = async (refresh = false) => {
        if (consentWrite.current)
            return;
        const read = ++stateRead.current;
        try {
            const next = await jsonRequest(refresh ? '/api/hanamesh/core/refresh' : '/api/hanamesh/core/state', refresh ? { method: 'POST' } : undefined);
            if (read === stateRead.current) {
                setState(next);
                setError(null);
            }
        }
        catch (cause) {
            if (read === stateRead.current)
                setError(cause instanceof Error ? cause.message : 'CORE_UPSTREAM_UNAVAILABLE');
        }
        await loadPoints();
    };
    useEffect(() => {
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
            setError(cause instanceof Error ? cause.message : 'CORE_UPSTREAM_UNAVAILABLE');
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
        }
        catch (cause) {
            setConsentError(cause instanceof Error ? cause.message : 'CORE_UPSTREAM_UNAVAILABLE');
        }
        finally {
            consentWrite.current = false;
            setConsentBusy(false);
        }
    };
    const saveServer = async (serverOrigin) => {
        setServerBusy(true);
        setServerError(null);
        try {
            setState(await jsonRequest('/api/hanamesh/core/server', { method: 'POST', body: JSON.stringify({ serverOrigin }) }));
            setServerDraft('');
            void loadPoints();
            void loadActivity();
        }
        catch (cause) {
            setServerError(cause instanceof Error ? cause.message : 'CORE_UPSTREAM_UNAVAILABLE');
        }
        finally {
            setServerBusy(false);
        }
    };
    const bind = async () => {
        try {
            await openBindPage();
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
        return createElement('section', { className: 'hm-core-section', 'data-hanamesh-core': 'loading' }, createElement('h2', null, 'HanaMesh'), createElement('p', { className: error ? 'hm-core-error' : 'hm-core-muted' }, error ? `未能读取：${error}` : '正在读取…'), error && createElement('button', { type: 'button', onClick: () => void load() }, '重新读取'));
    const waitingForConsent = state.registration.status !== 'registered' && state.consent.state !== 'granted';
    const registration = state.serverOrigin === null ? '未连接' : state.registration.status === 'registered' ? '已注册' : waitingForConsent ? '未注册：打开数据授权后注册' : state.registration.status === 'failed' ? `注册失败：${state.registration.lastError ?? '未知'}` : '未注册';
    const windowDays = state.configuration?.contributionWindowDays ?? 90;
    const serverFromSetting = state.serverOriginSource === 'setting';
    const bound = state.session?.bound ?? null;
    const identity = state.identity;
    const identityRow = identity.status === 'failed'
        ? createElement('div', { className: 'hm-core-copy', 'data-hanamesh-core-identity': 'failed' }, createElement('span', { className: 'hm-core-error', role: 'alert' }, `${IDENTITY_FAILURES[identity.reason ?? 'CORE_DEVICE_STORE_UNAVAILABLE']}${identity.detail ? `（${identity.detail}）` : ''}：${identity.location ?? '未知位置'}`), createElement('small', { className: 'hm-core-muted' }, '为避免两个客户端各算一台设备，Core 不会自动新建身份，也不会覆盖这个文件；修复或移走该文件后重新读取。在此之前不注册、不签名、不上报。'), createElement('div', { className: 'hm-core-actions' }, createElement('button', { type: 'button', onClick: () => void post('/api/hanamesh/core/refresh') }, '重新读取设备身份')))
        : createElement('div', { className: 'hm-core-copy', 'data-hanamesh-core-identity': identity.status, 'data-hanamesh-core-device': state.deviceId ?? '' }, createElement('div', { className: 'hm-core-actions' }, createElement('span', null, `设备 id：${state.deviceId ? short(state.deviceId) : '—'}　注册：${registration}`), state.serverOrigin && state.registration.status !== 'registered' && !waitingForConsent && createElement('button', { type: 'button', onClick: () => void post('/api/hanamesh/core/device/register') }, '重试注册')), createElement('small', { className: 'hm-core-muted' }, identity.status === 'shared'
            ? `本机共享：DSH 与 HanaMesh 客户端使用同一设备身份（${identity.location}）${identity.source && IDENTITY_SOURCES[identity.source] ? `；${IDENTITY_SOURCES[identity.source]}` : ''}`
            : '仅本客户端：未接入本机共享身份'), identity.replacedDeviceIds.length > 0 && createElement('small', { className: 'hm-core-muted' }, `本客户端原有身份 ${identity.replacedDeviceIds.map(short).join('、')} 与本机共享身份冲突，已改用共享身份；原身份的密钥已保留在本客户端存储中，未删除。原身份未绑定时的待绑定分不会自动转入。`));
    const contributions = state.contributions.status === 'ready'
        ? `install ${state.contributions.actions.install} · open ${state.contributions.actions.open} · use ${state.contributions.actions.use} · uninstall ${state.contributions.actions.uninstall}　窗口：近 ${state.contributions.windowDays} 天`
        : pointsReason(state.contributions.reason);
    const contributionsNote = state.contributions.status !== 'ready' ? null
        : state.contributions.availability === 'unavailable' ? '服务端只保留了这个窗口的一部分记录，数字不完整'
            : state.contributions.availability === 'available' ? null : '服务端未说明这个窗口的记录是否完整';
    return createElement('section', { className: 'hm-core-section', 'data-hanamesh-core': 'ready' }, createElement('h2', null, 'HanaMesh'), createElement('p', { className: 'hm-core-muted', 'data-hanamesh-core-hint': 'optional-components' }, 'Core 只安装设备身份与同意设置。使用记录和应用容器可分别安装；缺少组件时，下方会显示原因，设备身份与同意开关仍可使用。'), error && createElement('p', { className: 'hm-core-error', role: 'alert' }, `读取或保存失败：${actionError(error)}`, createElement('button', { type: 'button', onClick: () => void load() }, '重新读取')), createElement(Row, { label: '设备身份' }, identityRow), state.registrationFailure && createElement('p', { role: 'alert', className: 'hm-core-error' }, `注册失败：${state.registrationFailure.code}${state.registrationFailure.persistence ? `；状态保存失败：${state.registrationFailure.persistence}` : ''}。请使用重试注册。`), createElement(Row, { label: '服务端' }, createElement('div', { className: 'hm-core-copy', 'data-hanamesh-core-server': serverFromSetting ? 'setting' : 'config' }, createElement('span', null, `当前：${state.serverOrigin ?? '未设置（不连接服务端）'}（${serverFromSetting ? '你设置的' : '出厂默认'}）`), serverFromSetting && createElement('small', { className: 'hm-core-muted' }, `出厂默认：${state.configuredServerOrigin ?? '未设置'}`), state.serverOriginFault && createElement('span', { className: 'hm-core-error', role: 'alert' }, `已保存的服务端地址无效（${state.serverOriginFault}），当前使用出厂默认；请重新保存或恢复默认。`), createElement('div', { className: 'hm-core-actions' }, createElement('input', { type: 'text', 'aria-label': '服务端地址', placeholder: 'https://api.example.com', value: serverDraft, disabled: serverBusy, onChange: (event) => setServerDraft(event.currentTarget.value) }), createElement('button', { type: 'button', disabled: serverBusy || serverDraft.trim() === '', onClick: () => void saveServer(serverDraft.trim()) }, '保存'), createElement('button', { type: 'button', disabled: serverBusy || !serverFromSetting, onClick: () => void saveServer(null) }, '恢复默认')), serverError && createElement('span', { className: 'hm-core-error', role: 'alert' }, SERVER_ERRORS[serverError] ?? `保存失败：${serverError}`), createElement('small', { className: 'hm-core-muted' }, '立即生效。注册属于某个服务端：更换后本设备在新服务端重新注册（需已打开数据授权），贡献、分与使用记录改读新服务端。'))), state.configuration && createElement(Row, { label: '运行配置' }, createElement('span', { 'data-hanamesh-core-configuration': 'visible' }, `请求时限 ${state.configuration.timeoutMs}ms；健康检查 ${state.configuration.checkIntervalMs}ms；名称请求时限 ${state.configuration.profileTimeoutMs}ms；Hana 行预算 ${state.configuration.maxHanaRows}；响应字节预算 ${state.configuration.maxResponseBytes}；界面轮询 ${state.configuration.clientPollIntervalMs ?? 10000}ms；积分刷新 ${state.configuration.pointsRefreshMs ?? 60000}ms；贡献刷新 ${state.configuration.contributionIntervalMs ?? 60000}ms；活动每次 ${state.configuration.activityPageBudget ?? 5} 页、显示 ${state.configuration.activityDisplayRows ?? 25} 行；名称并发 ${state.configuration.catalogConcurrency ?? 4}；贡献窗口 ${windowDays} 天。可在插件配置中修改。`)), createElement(Row, { label: '数据授权' }, createElement('label', { className: 'hm-core-switch' }, createElement('input', { type: 'checkbox', checked: state.consent.state === 'granted', disabled: consentBusy, onChange: event => void saveConsent(event.currentTarget.checked ? 'granted' : 'withheld') }), '允许 HanaMesh 记录并上报本设备的使用事件（安装/打开/使用/卸载；不含内容与对话）'), createElement('span', { role: 'status' }, consentBusy ? '正在保存并读取授权状态…' : `${consentError ? '上次读取' : '当前'}：${state.consent.state === 'granted' ? '已开启' : '已关闭'}`), 
    // Turning consent on sends data at once (registration, then usage records): say where, before the switch is used.
    createElement('small', { className: 'hm-core-muted', 'data-hanamesh-core-consent-destination': state.serverOrigin ?? 'none' }, state.serverOrigin === null
        ? '没有设置服务端：开启后只在本机记录，不发送。'
        : `开启后会立即向 ${state.serverOrigin}（${state.serverOriginSource === 'setting' ? '你设置的服务端' : '出厂默认服务端'}）注册本设备并上报使用记录；要换服务端，请先在上方「服务端」里改好再开启。`), consentError && createElement('p', { className: 'hm-core-error', role: 'alert' }, `授权保存未确认：${consentError}。请重新切换授权，或重新进入页面读取当前状态。`), createElement('small', { className: 'hm-core-muted' }, '撤回后本地缓冲清空并向服务端发起删除；服务端按其保留设置保存原始记录（默认 90 天）。')), createElement(Row, { label: '账号' }, createElement('div', { className: 'hm-core-actions' }, bound === true
        ? createElement('span', { 'data-hanamesh-core-bound': 'true', ...(state.account ? { 'data-hanamesh-core-account': state.account.displayName } : {}) }, state.account?.provider === 'github'
            ? `已绑定到 GitHub 账号 ${state.account.displayName}（设备 ${short(state.deviceId ?? '')}）`
            : `已绑定到网站账号（设备 ${short(state.deviceId ?? '')} 已关联你的 GitHub 登录）`)
        : createElement('span', { 'data-hanamesh-core-bound': String(bound) }, bound === false ? '未绑定：绑定后网站才能把本设备的贡献记到你的账号' : state.serverOrigin === null ? '未连接服务端' : identity.status === 'failed' ? '设备身份不可用，暂不能绑定' : '绑定状态读取中…'), bound === true
        ? createElement('button', { type: 'button', onClick: () => visit('/me') }, '在网站查看账号与设备')
        : createElement('button', { type: 'button', onClick: () => void bind() }, '去网站绑定'), 
    // T9: the email form lives on the website; core only carries the entry point.
    createElement('button', { type: 'button', 'data-hanamesh-core-email': 'entry', onClick: () => visit('/me') }, '邮箱绑定'))), createElement(Row, { label: '我的Hana' }, createElement('div', { className: 'hm-core-points', 'data-hanamesh-core-points': points?.status ?? 'loading' }, 
    // Single source for "bound": Usage contributions (state.session.bound), the same fact the binding row shows.
    points?.status === 'ready' && bound === false && createElement('span', { role: 'status', 'data-hanamesh-core-points-binding': 'UNBOUND' }, '未绑定：只累计、暂不可领'), points === null
        ? createElement('span', { className: 'hm-core-muted' }, '正在读取分…')
        : points.status === 'unavailable'
            ? createElement('span', { className: 'hm-core-muted' }, pointsReason(points.reason))
            : points.hanas.length === 0
                ? createElement('span', { className: 'hm-core-muted' }, '还没有分：安装并使用 Hana 后这里会出现每个 Hana 的分')
                : createElement(Fragment, null, createElement('span', { 'data-hanamesh-core-total': String(points.totalPoints) }, createElement('b', null, `总计 ${fen(points.totalPoints)}`), points.pendingTotal > 0 ? `　其中待绑定 ${fen(points.pendingTotal)}` : ''), ...points.hanas.map(row => {
                    const sources = BREAKDOWN_LABELS.map(([key, label]) => [label, row.breakdown[key]]).filter(([, value]) => value !== 0);
                    const other = Number((row.points - sources.reduce((sum, [, value]) => sum + value, 0)).toFixed(3));
                    return createElement('div', { key: row.hanaId, className: 'hm-core-hana', 'data-hanamesh-core-hana': row.hanaId }, createElement('span', null, createElement('b', null, row.displayName ?? `${row.hanaId.slice(0, 8)}…`), `　${fen(row.points)}${row.pending > 0 ? `（另有待绑定 ${fen(row.pending)}）` : ''}`), row.displayNameStatus === 'failed' && createElement('span', { role: 'alert', className: 'hm-core-error' }, `名称读取失败：${row.displayNameReason ?? 'CORE_UPSTREAM_UNAVAILABLE'}。积分仍有效，返回窗口时可重新读取。`), createElement('small', { className: 'hm-core-muted' }, '积分来源（按类型汇总）：', sources.length ? sources.map(([label, value]) => `${label} ${fen(value)}`).join(' · ') : '暂无已分类分项', other !== 0 ? ` · 其他账项 ${fen(other)}` : ''));
                })), createElement('small', { className: 'hm-core-muted', 'data-hanamesh-core-hint': 'points-not-token' }, '分不是代币：分只记录贡献，兑换比例与发币另行公布；创作者镜像比例以服务端设置为准。'), createElement('div', { className: 'hm-core-actions' }, createElement('button', { type: 'button', onClick: () => visit('/me') }, '去网站')))), createElement(Row, { label: '贡献事件' }, createElement('div', { className: 'hm-core-events', 'data-hanamesh-core-activity': activity?.status ?? 'loading' }, createElement('b', null, `本设备近 ${windowDays} 天贡献事件`), createElement('small', { className: 'hm-core-muted' }, '「打开」记插件页面被打开，「使用」记插件命令成功执行；聊天回合不计。事件不等于逐笔积分，积分以“我的 Hana”账本汇总为准。'), activityBusy && createElement('span', { className: 'hm-core-muted' }, '正在读取最新事件…'), activity === null ? createElement('span', { className: 'hm-core-muted' }, '正在读取事件…')
        : activity.status === 'unavailable' ? createElement('span', { className: 'hm-core-muted' }, pointsReason(activity.reason))
            : activity.nextAfter ? createElement('span', { className: 'hm-core-muted' }, `已扫描 ${activity.scanned} 条，尚未抵达最新；请继续读取。`)
                : activity.items.length === 0 ? createElement('span', { className: 'hm-core-muted' }, '本设备在此窗口没有可读的原始事件')
                    : createElement(Fragment, null, createElement('small', { className: 'hm-core-muted' }, '最新事件（新到旧）'), ...[...activity.items].reverse().map((item, index) => createElement('div', { key: `${item.occurredAt}:${item.hanaRef}:${item.action}:${index}`, className: 'hm-core-event' }, createElement('span', null, `${ACTION_LABELS[item.action]} · ${item.hanaRef}`), createElement('time', { dateTime: item.occurredAt }, new Date(item.occurredAt).toLocaleString('zh-CN'))))), createElement('div', { className: 'hm-core-actions' }, createElement('button', { type: 'button', disabled: activityBusy, onClick: () => void loadActivity() }, '刷新事件'), activity?.status === 'ready' && activity.nextAfter && createElement('button', { type: 'button', disabled: activityBusy, onClick: () => void loadActivity(true) }, '继续读取到最新')))), createElement(Row, { label: '本设备贡献累计' }, createElement('div', { className: 'hm-core-copy', 'data-hanamesh-core-contributions': state.contributions.status === 'ready' ? (state.contributions.availability ?? 'unknown') : 'unavailable' }, createElement('span', null, contributions), contributionsNote && createElement('small', { className: state.contributions.status === 'ready' && state.contributions.availability === 'unavailable' ? 'hm-core-error' : 'hm-core-muted' }, contributionsNote))), createElement(Row, { label: 'HanaMesh套件' }, createElement('div', { className: 'hm-core-components' }, state.health.fault && createElement('span', { className: 'hm-core-error' }, `检查未完成（${state.health.fault}）`), ...state.components.map(row => createElement('span', { key: row.id }, `${row.label}：${componentText(row)}`)), createElement('button', { type: 'button', onClick: () => void post('/api/hanamesh/core/health/recheck') }, '重新检查'))), createElement(Row, { label: '关于' }, createElement('div', { className: 'hm-core-actions' }, createElement('span', null, 'hanamesh-core 0.3.4 · DSH 0.2.1-alpha.2'), createElement('button', { type: 'button', onClick: () => visit('/') }, '去网站'))));
}
/** A complete Core-owned page in the browser top layer. Its only navigation
 * is FooterAction's local state; no host menu, settings service or DOM lookup. */
function HanaMeshSettingsPage({ onClose, restoreFocus }) {
    const page = useRef(null);
    useEffect(() => {
        const node = page.current;
        if (!node)
            return;
        node.showModal();
        return () => { if (node.open)
            node.close(); restoreFocus(); };
    }, []);
    return createElement('dialog', { ref: page, className: 'hm-core-settings-page', 'data-hanamesh-core-page': 'settings', 'aria-labelledby': 'hm-core-settings-title', onCancel: (event) => { event.preventDefault(); onClose(); } }, createElement('header', { className: 'hm-core-settings-header' }, createElement('button', { type: 'button', onClick: onClose }, '返回'), createElement('h1', { id: 'hm-core-settings-title' }, 'HanaMesh 设置'), createElement('button', { type: 'button', onClick: onClose, 'aria-label': '关闭 HanaMesh 设置' }, '关闭')), createElement('div', { className: 'hm-core-settings-body' }, createElement(HanaMeshSection)));
}
/** T2 one-time bind nudge. The host decides `prompt.show` (pending 分 > 0, device not bound, marker never stamped);
 *  the moment it is displayed we stamp the storage-domain marker, so a restart or reinstall never shows it again.
 *  Rendered as a native `<dialog>` in the browser top layer, so no layout hack covers the host chrome permanently. */
function PointsBindPrompt() {
    const [pending, setPending] = useState(null);
    const dialog = useRef(null);
    useEffect(() => {
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
                setPending(next.pendingTotal);
            }
            catch { /* the nudge is optional; a failed read simply waits for the next tick */ }
        };
        void poll();
        timer = window.setInterval(() => void poll(), pointsRefreshMs);
        return () => { cancelled = true; window.clearInterval(timer); };
    }, []);
    useEffect(() => {
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
    return createElement('dialog', { className: 'hm-core-prompt', ref: dialog, 'data-hanamesh-core-prompt': 'bind', onCancel: close }, createElement('h3', null, '绑定后这些分才归入你的账号'), createElement('p', null, `你已累计 ${fen(pending)}（待绑定）。绑定 GitHub 账号后，这些分会全部归入账号；未绑定的分有上限。分不是代币。`), createElement('div', { className: 'hm-core-actions' }, createElement('button', { type: 'button', onClick: () => { void openBindPage().catch(() => undefined); close(); } }, '去网站绑定'), createElement('button', { type: 'button', onClick: close }, '以后再说')));
}
function FooterAction({ wide }) {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const entry = useRef(null);
    const closeSettings = () => { setSettingsOpen(false); };
    return createElement(Fragment, null, createElement('button', { type: 'button', className: 'hm-core-footer', 'data-wide': String(wide), title: 'HanaMesh', 'aria-label': '打开 HanaMesh 设置', ref: entry, onClick: () => setSettingsOpen(true) }, wide ? 'HanaMesh' : 'H'), settingsOpen && createElement(HanaMeshSettingsPage, { onClose: closeSettings, restoreFocus: () => entry.current?.focus() }), createElement(PointsBindPrompt));
}
export const name = 'hanamesh-core-client';
export const inject = ['slots'];
export function apply(ctx) {
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

export const STATE_PRESENTATION = Object.freeze({
    signed_out: Object.freeze({ label: '未登录', description: '可以保留并查看无需登录的本地工作；受保护操作需要登录。', marker: '○' }),
    signing_in: Object.freeze({ label: '登录中', description: '正在向身份服务验证；尚未获得任何资源权限。', marker: '…' }),
    signed_in: Object.freeze({ label: '已登录', description: '身份已验证；每次资源访问仍由资源服务独立授权。', marker: '✓' }),
    expired: Object.freeze({ label: '已过期', description: '此设备的会话已结束或不再可用；请重新登录。', marker: '↻' }),
    unavailable: Object.freeze({ label: '身份服务不可达', description: '暂时无法确认可用身份；新的受保护操作已停止，私有工作仍保留。', marker: '!' }),
});
/** Semantic functional UI only. ui-kit artifact is missing; do not invent theme tokens. */
export function renderLoginPage() {
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HanaMesh · 账户与登录</title><script src="/hanamesh/identity/ui.js" defer></script></head><body>
<main id="hanamesh-identity"><a href="/">返回工作台</a><h1>账户与登录</h1>
<p role="note" data-ui-kit-pending>功能界面；ui-kit 0.1.0-rc.3 样式接入尚未验证。</p>
<section aria-labelledby="session-heading"><h2 id="session-heading">当前会话</h2><p id="identity-state" role="status" aria-live="polite" data-state="unavailable">尚未读取身份状态</p><p id="identity-description"></p><p id="identity-principal"></p><p id="identity-policy"></p><p id="identity-revocation" role="status"></p></section>
<form id="identity-login"><fieldset><legend>邮箱登录</legend><p><label for="identity-email">邮箱</label><input id="identity-email" name="email" type="email" maxlength="254" autocomplete="username" required></p><p><label for="identity-password">密码</label><input id="identity-password" name="password" type="password" minlength="12" maxlength="128" autocomplete="current-password" required></p><button type="submit">登录</button></fieldset></form>
<p><button id="identity-refresh" type="button">重新检查身份服务</button> <button id="identity-logout" type="button">退出登录／重试撤销</button></p>
<p id="identity-error" role="alert"></p><section><h2>授权边界</h2><p>此界面不签发会员、交易或资源权限。登录状态不是资源授权；本机检查不能成为防篡改权威。退出、网络中断或插件停用均不会删除私有工作。</p></section></main></body></html>`;
}

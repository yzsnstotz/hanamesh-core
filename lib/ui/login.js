/* Same-origin, owner-only login UI. No persistent browser credentials or raw HTML data. */
(() => {
  'use strict';
  const root = document.getElementById('hanamesh-identity'); if (!root) return;
  const form = document.getElementById('identity-login');
  const email = document.getElementById('identity-email');
  const password = document.getElementById('identity-password');
  const error = document.getElementById('identity-error');
  const labels = {
    signed_out: ['○ 未登录', '受保护操作需要登录；私有工作仍保留。'],
    signing_in: ['… 登录中', '正在验证，请勿重复提交。'],
    signed_in: ['✓ 已登录', '每次资源访问仍由资源服务独立授权。'],
    expired: ['↻ 已过期', '会话已结束或不再可用，请重新登录。'],
    unavailable: ['! 身份服务不可达', '新的受保护操作已停止；私有工作仍保留。'],
  };
  let busy = false;
  let generation = 0;
  async function call(path, input) {
    const response = await globalThis.fetch.call(globalThis, '/api/hanamesh/identity/' + path, {
      method: input === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: input === undefined ? {'accept': 'application/json'} : {'content-type': 'application/json', 'accept': 'application/json'},
      ...(input === undefined ? {} : {body: JSON.stringify(input)}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data?.error?.message === 'string' ? data.error.message : '身份请求未完成。');
    return data;
  }
  function render(state) {
    const entry = labels[state.status] || labels.unavailable;
    const badge = document.getElementById('identity-state');
    badge.textContent = entry[0]; badge.dataset.state = labels[state.status] ? state.status : 'unavailable';
    document.getElementById('identity-description').textContent = entry[1];
    document.getElementById('identity-principal').textContent = state.principal ? `当前主体：${state.principal.displayName}（${state.principal.principalId}）` : '';
    document.getElementById('identity-policy').textContent = state.requiredLogin ? '此 profile 的本地登录策略：需要登录。' : '此 profile 的本地登录策略：可选；受保护资源始终需要有效身份。';
    document.getElementById('identity-revocation').textContent = state.logoutPending ? '服务器撤销尚未确认；不能把本地退出等同于远端会话已撤销。' : '';
    form.querySelector('button').disabled = state.status === 'signing_in';
  }
  async function state() {
    const current = generation;
    try { const result = await call('state'); if (current === generation) render(result); }
    catch { if (current === generation) render({status: 'unavailable'}); }
  }
  async function action(path, data) {
    if (busy) return;
    busy = true; ++generation; error.textContent = '';
    if (path === 'sign-in') render({status: 'signing_in'});
    try { await call(path, data); }
    catch (failure) { error.textContent = failure instanceof Error ? failure.message : '操作未完成。'; }
    finally { password.value = ''; busy = false; await state(); }
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    const input = {email: email.value, password: password.value};
    password.value = '';
    void action('sign-in', input);
  });
  document.getElementById('identity-refresh').addEventListener('click', () => { void action('refresh', {}); });
  document.getElementById('identity-logout').addEventListener('click', () => { void action('sign-out', {}); });
  // No retries of writes. Only explicit refresh or visibility-aware periodic reads.
  const timer = setInterval(() => { if (!busy && !document.hidden) void action('refresh', {}); }, 30000);
  window.addEventListener('pagehide', () => { clearInterval(timer); password.value = ''; }, {once: true});
  void action('refresh', {});
})();

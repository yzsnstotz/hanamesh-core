import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('client distribution declares native slots and avoids forbidden layout/link fallbacks', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.deepEqual(pkg.dsh.client.inject, ['@deepseek-ai/dsh-client-ui-settings', '@deepseek-ai/dsh-client-ui-sidebar']);
  assert.ok(pkg.exports['./client']);
  const source = await readFile('src/client/index.ts', 'utf8');
  assert.match(source, /settings\.section/);
  assert.match(source, /sidebar\.footer\.action/);
  assert.match(source, /已安装.*服务未就绪/);
  assert.match(source, /检查未完成/);
  assert.match(source, /row\.requiredRange/);
  assert.doesNotMatch(source, /position\s*:\s*fixed|target=["']_blank/);
  const bundle = await readFile('lib/client.js', 'utf8');
  assert.match(bundle, /window\.__ModuleLoader__\.load/);
});

test('account row is state-aware: bound hides the bind button and names the account, unbound keeps it (user 2026-09-20)', async () => {
  const source = await readFile('src/client/index.ts', 'utf8');
  assert.match(source, /state\.session\.bound === true\s*\?\s*createElement\('button'[^\n]*visit\('\/me'\)[^\n]*在网站查看账号与设备/);
  assert.match(source, /'去网站绑定'/);
  assert.match(source, /已绑定到网站账号/);
  assert.match(source, /'\/api\/hanamesh\/core\/refresh', \{method: 'POST'\}/); // post-bind polling uses the host refresh route
  // rc.31: the 我的 Hana row stopped being a placeholder and now renders the real points read (T2).
  assert.match(source, /'data-hanamesh-core-points': points\?\.status \?\? 'loading'/);
});

test('B7: bound account row names the GitHub account from state.account and falls back to the rc.19 wording when the server omits it', async () => {
  const source = await readFile('src/client/index.ts', 'utf8');
  assert.match(source, /account: \{provider: 'github'; displayName: string\} \| null;/); // CoreState mirrors GET state
  assert.match(source, /state\.account\?\.provider === 'github'\s*\?\s*`已绑定到 GitHub 账号 \$\{state\.account\.displayName\}/);
  assert.match(source, /:\s*`已绑定到网站账号（设备 \$\{state\.deviceId\.slice\(0, 8\)\}… 已关联你的 GitHub 登录）`/); // fallback for usage <= rc.2
  assert.match(source, /'data-hanamesh-core-account': state\.account\.displayName/); // hook for the AX/headless acceptance read
  const bundle = await readFile('lib/client.js', 'utf8');
  assert.match(bundle, /已绑定到 GitHub 账号/);
});

test('T2: the 我的 Hana row renders real 分 from the host points route, with readable empty states and a "分不是代币" note', async () => {
  const source = await readFile('src/client/index.ts', 'utf8');
  assert.match(source, /jsonRequest<PointsState>\('\/api\/hanamesh\/core\/points'\)/); // client reads the host route, never ctx.get
  assert.doesNotMatch(source, /ctx\.get\(/); // DELIVERY_RULES §1.6: host services are absent from the browser root context
  assert.doesNotMatch(source, /api\.hanamesh\.com|\/v1\/custody/); // the custody read is signed host-side only
  assert.match(source, /const fen = \(value: number\): string => `\$\{Number\(value\.toFixed\(3\)\)\} 分`;/);
  assert.match(source, /CONSENT_WITHHELD: '未开启数据授权/);
  assert.match(source, /NOT_REGISTERED: '本设备尚未注册成功/);
  assert.match(source, /NOT_CONNECTED: '未连接服务端/);
  assert.match(source, /'data-hanamesh-core-hint': 'points-not-token'\}, '分不是代币/);
  assert.match(source, /\['creatorMirror', '创作镜像'\], \['launchInitiator', '发起'\]/);
  const bundle = await readFile('lib/client.js', 'utf8');
  assert.match(bundle, /\/api\/hanamesh\/core\/points/);
  assert.match(bundle, /分不是代币/);
  // The whole surface stays in 分 and %; no token or currency units leak into the client copy.
  assert.doesNotMatch(source, /HANA 币|代币数量|USDT|\bBNB\b/);
});

test('T2: the bind nudge is a one-shot dialog that stamps the host marker the moment it shows', async () => {
  const source = await readFile('src/client/index.ts', 'utf8');
  assert.match(source, /if \(cancelled \|\| !next\.prompt\.show\) return;/); // the host decides, the client obeys
  assert.match(source, /jsonRequest\('\/api\/hanamesh\/core\/points\/prompt-shown', \{method: 'POST'\}\)/);
  assert.match(source, /'data-hanamesh-core-prompt': 'bind'/);
  assert.match(source, /你已累计 \$\{fen\(pending\)\}（待绑定）/);
  assert.match(source, /'去网站绑定'\),\n\s+createElement\('button', \{type: 'button', onClick: close\}, '以后再说'\)/);
  assert.match(source, /createElement\(PointsBindPrompt\)/); // mounted from the always-present sidebar footer slot
  assert.doesNotMatch(source, /className: 'hm-core-prompt'[^\n]*style:/); // no inline layout hacks; the dialog uses the browser top layer
  const bundle = await readFile('lib/client.js', 'utf8');
  assert.match(bundle, /points\/prompt-shown/);
});

test('T9: the 账号 row carries an email-binding entry that opens the website, and no email form lives in core', async () => {
  const source = await readFile('src/client/index.ts', 'utf8');
  assert.match(source, /'data-hanamesh-core-email': 'entry', onClick: \(\) => visit\('\/me'\)\}, '邮箱绑定'/);
  assert.doesNotMatch(source, /type: 'email'|输入邮箱|验证码/); // the form and verification stay on the website (T8/T9)
  const bundle = await readFile('lib/client.js', 'utf8');
  assert.match(bundle, /邮箱绑定/);
});

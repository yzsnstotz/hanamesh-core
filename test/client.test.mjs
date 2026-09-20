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
  assert.match(source, /state\.session\.bound === true \? '可领权益 \/ 认领状态：已绑定/); // row follows the bound flag
});

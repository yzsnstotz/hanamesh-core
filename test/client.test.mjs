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

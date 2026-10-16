import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('Cordis getter uses explicit isolated registry config and real metadata adapter (fixture host, not native DSH)', () => {
  const env = {...process.env}; delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--experimental-loader', './test/fixtures/host-loader.mjs', '--test', '--test-reporter=tap', 'test/fixtures/suite-adapter-check.test.mjs'], {env, encoding: 'utf8', timeout: 15000});
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /# pass 1/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('stage0 source checks run with no external commands on PATH', () => {
  const env = {...process.env, PATH: ''};
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_TEST_WORKER_ID;
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'test/stage0.test.mjs'], {
    encoding: 'utf8',
    env,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

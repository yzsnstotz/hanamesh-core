import assert from 'node:assert/strict';
import {availableParallelism, platform} from 'node:os';
import {once} from 'node:events';
import {Worker} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {runProcessGroup} from './support/pnpm-process.mjs';

assert.notEqual(platform(), 'win32', 'the process-group regression requires POSIX');
const cpus = availableParallelism(), workers = [];
const fixture = fileURLToPath(new URL('./pnpm-process-safety.test.mjs', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const source = {test: sha(await readFile(fixture)), helper: sha(await readFile(new URL('./support/pnpm-process.mjs', import.meta.url)))};
try {
  // Two continuously runnable workers per available CPU reproduce the contention in T1's probe.
  const ready = [];
  for (let i = 0; i < cpus * 2; i++) {
    const worker = new Worker("const{parentPort}=require('node:worker_threads');parentPort.postMessage('ready');for(;;){}", {eval: true});
    workers.push(worker);ready.push(once(worker, 'message').then(([value]) => assert.equal(value, 'ready')));
  }
  await Promise.all(ready);
  const started = performance.now(), cpuStarted = process.cpuUsage();
  console.log(JSON.stringify({event: 'stress-start', platform: platform(), cpus, busyWorkers: workers.length, iterations: 100, source}));
  for (let iteration = 1; iteration <= 100; iteration++) {
    const start = performance.now();
    const result = await runProcessGroup(process.execPath, ['--test', '--test-reporter=tap', '--test-name-pattern=^outer runner exit also reaps its detached owned children$', fixture], {env: process.env});
    const receipt = {iteration, status: result.status, signal: result.signal, timedOut: result.timedOut, groupCleaned: result.groupCleaned, durationMs: performance.now() - start};
    console.log(JSON.stringify(receipt));
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.timedOut, false);
    assert.match(result.stdout, /^ok \d+ - outer runner exit also reaps its detached owned children$/m);
    assert.match(result.stdout, /^# pass 1$/m);
    assert.match(result.stdout, /^# fail 0$/m);
    assert.match(result.stdout, /^# skipped 0$/m);
  }
  console.log(JSON.stringify({event: 'stress-complete', iterations: 100, failures: 0, cpus, busyWorkers: workers.length, durationMs: performance.now() - started, busyProcessCpuMicroseconds: process.cpuUsage(cpuStarted), source}));
} finally {
  await Promise.all(workers.map(worker => worker.terminate()));
}

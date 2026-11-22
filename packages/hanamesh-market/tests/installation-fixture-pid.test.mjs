import test from 'node:test';
import assert from 'node:assert/strict';
import {open, rename, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {scratch, waitForFixtureFile} from './helpers.mjs';

test('a PID file observed mid-write is never accepted as PID 0', async () => {
  const root = await scratch('installation-pid-publication-');
  const incomplete = join(root, 'incomplete-pid');
  const handle = await open(incomplete, 'wx');
  try {
    // Hold the writer between creation and writing bytes, without a timing race.
    await assert.rejects(
      waitForFixtureFile(incomplete, {timeoutMs: 2000}).then(Number),
      /Fixture did not publish its readiness file within its declared startup budget/,
    );
  } finally {
    await handle.close();
  }

  const record = join(root, 'pid');
  const staging = join(root, 'pid.tmp');
  await writeFile(staging, '');
  const pending = waitForFixtureFile(record, {timeoutMs: 2000});
  pending.catch(() => {});
  await writeFile(staging, String(process.pid));
  await rename(staging, record);
  assert.equal(Number(await pending), process.pid);
});

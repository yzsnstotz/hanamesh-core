import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {coreSnapshotSchema} from '../lib/dsh.mjs';
import {INITIAL_CORE_SNAPSHOT} from '../lib/contracts.js';

test('stored core snapshot accepts the server override and still accepts snapshots written before it', () => {
  const schema = coreSnapshotSchema(z);
  const legacy = structuredClone(INITIAL_CORE_SNAPSHOT);
  delete legacy.serverOriginOverride;
  delete legacy.pointsBindPromptShownAt;
  assert.equal(schema.safeParse(legacy).success, true);
  assert.equal(schema.safeParse({...INITIAL_CORE_SNAPSHOT, serverOriginOverride: 'https://api.fixture.invalid'}).success, true);
  assert.equal(schema.safeParse({...INITIAL_CORE_SNAPSHOT, serverOriginOverride: null}).success, true);
  assert.equal(schema.safeParse({...INITIAL_CORE_SNAPSHOT, serverOriginOverride: 42}).success, false);
});

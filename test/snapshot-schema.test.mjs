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


test('website override is optional for old storage and rejects malformed new storage',()=>{
 const schema=coreSnapshotSchema(z),legacy=structuredClone(INITIAL_CORE_SNAPSHOT);
 delete legacy.websiteOriginOverride;assert.equal(schema.safeParse(legacy).success,true);
 for(const websiteOriginOverride of[null,'http://127.0.0.1:48606'])assert.equal(schema.safeParse({...legacy,websiteOriginOverride}).success,true);
 assert.equal(schema.safeParse({...legacy,websiteOriginOverride:42}).success,false);
});

test('first-consent display marker preserves old snapshots and round-trips without touching consent',()=>{
 const schema=coreSnapshotSchema(z),legacy=structuredClone(INITIAL_CORE_SNAPSHOT);
 delete legacy.usageConsentPromptShownAt;
 assert.equal(schema.safeParse(legacy).success,true);
 for(const usageConsentPromptShownAt of [null,'2026-10-17T00:00:00.000Z']){
  const parsed=schema.parse({...legacy,usageConsentPromptShownAt});
  assert.deepEqual(parsed.consent,legacy.consent);
  assert.equal(parsed.usageConsentPromptShownAt,usageConsentPromptShownAt);
 }
 assert.equal(schema.safeParse({...legacy,usageConsentPromptShownAt:true}).success,false);
});

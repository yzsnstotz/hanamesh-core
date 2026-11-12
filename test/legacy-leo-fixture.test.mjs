import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessLegacyInstallation} from '../lib/suite/index.js';
const recorded=JSON.parse(readFileSync(new URL('./fixtures/leo-legacy-public-metadata.json',import.meta.url),'utf8'));
test('DT7 read-only leo public metadata: Core 0.3.24 / AppHost 0.6.16 / Usage rc.7 is installed legacy in disk scope',async()=>{
 const r=await assessLegacyInstallation({scope:'profile',nodeVersion:'24.13.1',components:recorded.components});
 assert.equal(r.status,'installed');assert.equal(r.reason.code,'CORE_LEGACY_COMPONENTS_INSTALLED');assert.deepEqual(r.issues,[]);
});

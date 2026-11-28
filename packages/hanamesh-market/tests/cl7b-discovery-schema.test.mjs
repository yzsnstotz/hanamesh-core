import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {discoveryFixture as fixture,legacyDiscoveryFixture} from './fixtures/discovery-031.mjs';

test('AD27-15: formal 0.31.0 Schema validates localized fixtures with exact 0.27.0 provenance and rejects malformed discovery fields without coercion or mutation',async()=>{
 const {decodeDiscovery}=await import('../lib/discovery.js');
 const manifest=await legacyDiscoveryFixture('SHA256');
 for(const [name,record]of Object.entries(manifest))assert.equal(createHash('sha256').update(await readFile(new URL('./fixtures/discovery-027/'+name,import.meta.url))).digest('hex'),record.sha256);
 for(const [name,kind]of[['list','page'],['search','page'],['detail','detailItem'],['domain-directory','domainDirectory']]){const input=await fixture(name),before=structuredClone(input);assert.equal(decodeDiscovery(kind,input),input);assert.deepEqual(input,before);}
 const featured=await fixture('featured');for(const value of Object.values(featured.byDomain))decodeDiscovery('page',value);
 const stage=await fixture('stage-config');for(const value of Object.values(stage))decodeDiscovery('stageConfig',value);
 const page=await fixture('list');page.items[0].score.displayDecimals=0;assert.throws(()=>decodeDiscovery('page',page),/DISCOVERY_RESPONSE_INVALID/);
 const list=await fixture('list');list.items[0].reasons=[];assert.throws(()=>decodeDiscovery('page',list),/DISCOVERY_RESPONSE_INVALID/);
 const detail=await fixture('detail');delete detail.projection;assert.throws(()=>decodeDiscovery('detailItem',detail),/DISCOVERY_RESPONSE_INVALID/);
 assert.throws(()=>decodeDiscovery('stageConfig',{phase:'growth',showPlatformData:'false'}),/DISCOVERY_RESPONSE_INVALID/);
 const wrong=await fixture('search');wrong.capped=true;wrong.total=42;assert.throws(()=>decodeDiscovery('page',wrong),/DISCOVERY_RESPONSE_INVALID/);
 const legacyCount={...await fixture('list'),hiddenInsufficientCount:1};assert.throws(()=>decodeDiscovery('page',legacyCount),/DISCOVERY_RESPONSE_INVALID/);
});

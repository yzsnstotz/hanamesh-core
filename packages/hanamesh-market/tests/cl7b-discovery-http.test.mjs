import test from 'node:test';
import assert from 'node:assert/strict';
import {discoveryFixture as fixture} from './fixtures/discovery-031.mjs';
import {catalogPage} from './fixtures/catalog-u2.mjs';
const factory=async()=>{const m=await import('../src/discovery.js');assert.equal(typeof m.createDiscoveryHttpClient,'function');return m.createDiscoveryHttpClient;};
const origins={websiteOrigin:'https://website.example',serverOrigin:'https://host.example'};

test('HTTP27-01: real discovery page path belongs to Host, cursor/boolean/limit pass unchanged and DTO is validated',async()=>{
 const create=await factory(),page=await fixture('list'),calls=[];
 const c=create({...origins,fetchImpl:async(url,init)=>{calls.push({url:new URL(url),init});return Response.json(page);}});
 const cursor='opaque+/=%?日本語',actual=await c.list({domain:'office',subdivision:'docs',channel:'dsh',search:'文档',limit:50,after:cursor,includeInsufficient:true});
 assert.deepEqual(actual,page);const {url,init}=calls[0];assert.equal(url.origin,origins.serverOrigin);assert.equal(url.pathname,'/v1/indexer/discovery/items');
 assert.deepEqual(Object.fromEntries(url.searchParams),{domain:'office',subdivision:'docs',channel:'dsh',search:'文档',limit:'50',after:cursor,includeInsufficient:'true'});
 assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');assert.equal(init.method,'GET');
 for(const key of ['q','category','source','page'])await assert.rejects(c.list({[key]:'legacy'}),/INVALID_QUERY/);
 assert.equal(calls.length,1,'invalid legacy filters cannot be silently forwarded or client-filtered');
});

test('HTTP27-02: detail/domain/featured/stage use seven-route contract, no fixture envelopes or invented refresh',async()=>{
 const create=await factory(),list=await fixture('list'),detail=await fixture('detail'),directory=await fixture('domain-directory'),stages=await fixture('stage-config'),seen=[];
 const c=create({...origins,fetchImpl:async(url,init)=>{const u=new URL(url);seen.push([init.method,u.pathname,Object.fromEntries(u.searchParams)]);return Response.json(u.pathname.endsWith('/domains')?directory:u.pathname.endsWith('/stage-config')?stages.early:u.pathname.endsWith('/featured')?list:detail);}});
 assert.deepEqual(await c.detail(detail.hanaId),detail);assert.deepEqual(await c.domains(),directory);assert.deepEqual(await c.featured('office'),list);assert.deepEqual(await c.stage(),stages.early);
 assert.deepEqual(seen,[['GET','/v1/indexer/discovery/hanas/'+encodeURIComponent(detail.hanaId),{}],['GET','/v1/indexer/discovery/domains',{}],['GET','/v1/indexer/discovery/featured',{domain:'office'}],['GET','/v1/indexer/discovery/stage-config',{}]]);
 assert.equal(c.refresh,undefined);assert.equal(c.revalidate,undefined);
});

test('HTTP27-03: selected and fields are bounded read POSTs; fields is not a page, all bytes and null projection survive',async()=>{
 const create=await factory(),page=await fixture('list'),items=page.items.slice(0,2),ids=items.map(x=>x.hanaId),calls=[];
 const fields=items.map(({hanaId,domainIds,subdivisions,taxonomyVersion,overview,score,trustBadges,featured,similarGroup,projection})=>({hanaId,domainIds,subdivisions,taxonomyVersion,overview,score,trustBadges,featured,similarGroup,projection}));
 const c=create({...origins,fetchImpl:async(url,init)=>{calls.push({url:new URL(url),init});return Response.json(String(url).endsWith('/list-fields')?{items:fields}:page);}});
 assert.deepEqual(await c.selected({hanaIds:ids,domain:'office',includeInsufficient:true}),page);assert.deepEqual(await c.listFields(ids),{items:fields});
 assert.deepEqual(calls.map(x=>[x.init.method,x.url.pathname,JSON.parse(x.init.body)]),[['POST','/v1/indexer/discovery/selected',{hanaIds:ids,domain:'office',includeInsufficient:true}],['POST','/v1/indexer/discovery/list-fields',{hanaIds:ids}]]);
 await assert.rejects(c.selected({hanaIds:[...ids,ids[0]]}),/INVALID_QUERY/);await assert.rejects(c.listFields(Array.from({length:201},(_,i)=>String(i))),/INVALID_QUERY/);assert.equal(calls.length,2);
});

test('HTTP27-04: semantic uses one unified catalog read, with no detail N+1 or local ranking',async()=>{
 const create=await factory(),page=await fixture('list'),cards=[page.items[1],page.items[0]],calls=[];
 const c=create({...origins,fetchImpl:async(url,init)=>{
  calls.push({url:new URL(url),init});return Response.json(catalogPage(cards,{searchMode:'hybrid'}));
 }});
 const result=await c.search({query:'x'.repeat(500),domain:'office',includeInsufficient:true});
 assert.deepEqual(result.items.map(x=>x.hanaId),cards.map(card=>card.hanaId));
 assert.deepEqual(result.items.map(x=>x.matchKind),['meaning','meaning']);
 assert.equal(calls.length,1);
 const [{url,init}]=calls;
 assert.equal(url.origin,origins.websiteOrigin);assert.equal(url.pathname,'/hm/v1/host/catalog/query');
 assert.deepEqual(Object.fromEntries(url.searchParams),{domain:'office',includeInsufficient:'true',limit:'50',q:'x'.repeat(500),searchMode:'hybrid',sort:'relevance'});
 assert.equal(init.method,'GET');assert.equal(init.headers.Origin,origins.websiteOrigin);assert.equal(init.body,undefined);
});

test('HTTP27-05: failures are explicit once, malformed/identity-changing DTOs fail, abort and byte budgets remain enforced',async()=>{
 const create=await factory(),detail=await fixture('detail');let calls=0;
 const down=create({...origins,fetchImpl:async()=>{calls++;return Response.json({error:{code:'INDEXER_CATALOG_READ_BUDGET'}},{status:503});}});await assert.rejects(down.list({}),/INDEXER_CATALOG_READ_BUDGET/);assert.equal(calls,1);
 const bad=create({...origins,fetchImpl:async()=>Response.json({...await fixture('list'),capped:'false'})});await assert.rejects(bad.list({}),/DISCOVERY_RESPONSE_INVALID/);
 const mismatch=create({...origins,fetchImpl:async()=>Response.json(detail)});await assert.rejects(mismatch.detail('00000000-0000-4000-8000-000000000099'),/CATALOG_IDENTITY_CHANGED/);
 const bounded=create({...origins,maxBytes:10,fetchImpl:async()=>Response.json(detail)});await assert.rejects(bounded.detail(detail.hanaId),/RESPONSE_TOO_LARGE/);
 const controller=new AbortController();controller.abort();const stopped=create({...origins,fetchImpl:async(_url,{signal})=>{signal.throwIfAborted();assert.fail('aborted read must not start');}});await assert.rejects(stopped.list({},{signal:controller.signal}),{name:'AbortError'});
});

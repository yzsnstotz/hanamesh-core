import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogClient} from '../src/catalog.js';
import {catalogPage} from '../tests/fixtures/catalog-u2.mjs';
import {createNativeMarketListing} from '../src/client-state.js';

const item={hanaId:'11111111-2222-4333-8444-555555555555',displayName:'Fixture plugin',summary:{zh:'公开简介',en:'Public summary'},categories:['tools'],channels:['dsh'],sourceLinks:[],installMethods:[],oneClickInstall:{allowed:false,reason:'no-install-method'}};
const page=catalogPage([item], {facets:{
 categories:[{id:'tools',count:1,capped:false}],channels:[{id:'dsh',count:1,capped:false}],sources:[{id:'awesome',count:1,capped:false}],
}});
const origins={websiteOrigin:'https://catalog.example',serverOrigin:'https://server.example'};

test('public catalog adapter uses the same API and server facets as the website, exactly 50 per page',async()=>{
 const calls=[];
 const reader=createCatalogClient({...origins,fetchImpl:async(url,init)=>{const parsed=new URL(url);assert.equal(parsed.searchParams.get('limit'),'50');calls.push({url:parsed,init});return Response.json(page);}});
 const result=await reader.list({q:'notes',source:'awesome',category:'tools',channel:'dsh',page:1});
 const {url,init}=calls[0];
 assert.equal(url.origin,origins.websiteOrigin);
 assert.equal(url.pathname,'/hm/v1/host/catalog/query');
 assert.deepEqual(Object.fromEntries(url.searchParams),{categories:'tools',channel:'dsh',limit:'50',page:'1',q:'notes',searchMode:'keyword',sort:'relevance',source:'awesome'});
 assert.deepEqual(result.facets,page.page.facets);
 assert.equal(result.items[0].score,undefined);
 assert.equal(result.items[0].searchRank,1);
 assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');
});

test('optional discovery facts remain absent and unknown filters cannot create client-owned ranking',async()=>{
 const reader=createCatalogClient({...origins,fetchImpl:async()=>Response.json(page)});
 await assert.rejects(reader.list({tags:['trusted']}),/INVALID_QUERY/);await assert.rejects(reader.list({kind:'skill'}),/INVALID_QUERY/);
 const result=await reader.list({});assert.equal(result.items[0].trusted,undefined);assert.equal(result.recommendations,undefined);
});

test('semantic search calls the same catalog endpoint and preserves provider order and match kind with one request',async()=>{
 const calls=[];
 const hybrid=catalogPage([item],{searchMode:'hybrid'});
 const reader=createCatalogClient({...origins,fetchImpl:async(url,init)=>{calls.push({url:new URL(url),init});return Response.json(hybrid);}});
 const result=await reader.search({query:'find a note tool'});
 assert.equal(calls.length,1);
 assert.equal(calls[0].url.pathname,'/hm/v1/host/catalog/query');
 assert.equal(calls[0].init.method,'GET');
 assert.equal(calls[0].init.body,undefined);
 assert.equal(calls[0].init.headers.Origin,origins.websiteOrigin);
 assert.deepEqual(Object.fromEntries(calls[0].url.searchParams),{limit:'50',q:'find a note tool',searchMode:'hybrid',sort:'relevance'});
 assert.deepEqual(result.items.map(card=>[card.hanaId,card.matchKind]),[[item.hanaId,'meaning']]);
});

test('catalog failures and malformed pages are errors, never empty-success data or an automatic retry',async()=>{
 let calls=0;
 const reader=createCatalogClient({...origins,fetchImpl:async()=>{calls++;return Response.json({error:{code:'UPSTREAM_UNAVAILABLE'}},{status:503});}});
 await assert.rejects(reader.list({}),/UPSTREAM_UNAVAILABLE/);assert.equal(calls,1);
 for(const invalid of [
  {...page,cards:Array.from({length:51},()=>item)},
  {...page,cards:[{...item,hanaId:'different'}]},
  {...page,cards:[{...item,discovery:{hanaId:'different'}}]},
  {...page,page:{...page.page,items:[{...page.page.items[0],rank:2}]}},
 ]){
  const client=createCatalogClient({...origins,fetchImpl:async()=>Response.json(invalid)});
  await assert.rejects(client.list({}),/CATALOG_PAGE_INVALID/);
 }
});

test('semantic input preserves the existing Host 500-character contract independently of catalog keyword bounds',async()=>{
 let calls=0;
 const client=createCatalogClient({...origins,fetchImpl:async(url)=>{calls++;assert.equal(new URL(url).searchParams.get('q').length,500);return Response.json(catalogPage([],{searchMode:'hybrid'}));}});
 await client.search({query:'x'.repeat(500)});assert.equal(calls,1);
 await assert.rejects(client.search({query:'x'.repeat(501)}),/INVALID_QUERY/);
 await assert.rejects(client.search({query:'日'.repeat(171)}),/INVALID_QUERY/);assert.equal(calls,1);
});

test('numbered navigation and opaque continuation are exclusive and a reset returns the provider first page',async()=>{
 const calls=[];
 const reader=createCatalogClient({...origins,fetchImpl:async(url)=>{
  const params=new URL(url).searchParams;calls.push(params);
  return Response.json(params.has('after')
   ? catalogPage([item],{total:101,paginationReset:true,nextCursor:'reset_cursor'})
   : catalogPage([item],{pageNumber:2,total:101,nextCursor:'opaque_cursor'}));
 }});
 const second=await reader.list({page:2});assert.equal(second.page,2);assert.equal(second.totalPages,3);
 const reset=await reader.list({after:second.nextCursor});assert.equal(reset.page,1);assert.equal(reset.paginationReset,true);
 assert.equal(calls[0].get('page'),'2');assert.equal(calls[0].has('after'),false);
 assert.equal(calls[1].get('after'),'opaque_cursor');assert.equal(calls[1].has('page'),false);
 await assert.rejects(reader.list({after:'opaque_cursor',page:2}),/INVALID_QUERY/);assert.equal(calls.length,2);
});

test('Indexer detail preserves requested identity and canonical alias facts',async()=>{
 const calls=[],alias={...item,listingStatus:'delisted',canonicalHanaId:'11111111-2222-4333-8444-555555555556'};
 const reader=createCatalogClient({...origins,fetchImpl:async(url)=>{
  calls.push(new URL(url));return Response.json(alias);
 }});
 const result=await reader.detail(item.hanaId);
 assert.equal(calls[0].origin,origins.serverOrigin);
 assert.equal(calls[0].pathname,'/v1/indexer/hanas/'+item.hanaId);
 assert.equal(result.hanaId,item.hanaId);assert.equal(result.listingStatus,'delisted');
 assert.equal(result.mergedInto,alias.canonicalHanaId);
 await assert.rejects(reader.detail(alias.canonicalHanaId),/CATALOG_IDENTITY_CHANGED/);
 assert.equal(calls.length,2);
});

test('catalog discovery fields belong to the card identity and retain sparse language',async()=>{
 const overview={does:{byLocale:{ja:'概要'}}};
 const reader=createCatalogClient({...origins,fetchImpl:async()=>Response.json(catalogPage([{...item,discovery:{overview}}]))});
 const result=await reader.list();
 assert.deepEqual(result.items[0].discovery,{hanaId:item.hanaId,overview});
});

test('Market listing replaces stale cards on a cursor reset and continues from the returned cursor',async()=>{
 const pageInputs=[],nativeBundles=[];
 const newItem={...item,hanaId:'11111111-2222-4333-8444-555555555557'};
 const store=createNativeMarketListing({pagination:'catalog',async readPage(input){
  pageInputs.push(input);
  if(!input.after)return {items:[item],page:1,nextCursor:'old_cursor',paginationReset:false,nativeBundles};
  if(input.after==='old_cursor')return {items:[newItem],page:1,nextCursor:'new_cursor',paginationReset:true,nativeBundles};
  return {items:[],page:2,nextCursor:null,paginationReset:false,nativeBundles};
 }});
 await store.load({q:'notes'});await store.more();
 assert.deepEqual(store.snapshot().items,[newItem]);
 assert.equal(store.snapshot().page,1);assert.equal(store.snapshot().hasMore,true);
 await store.more();
 assert.deepEqual(pageInputs,[{q:'notes',limit:50},{q:'notes',after:'old_cursor',limit:50},{q:'notes',after:'new_cursor',limit:50}]);
 assert.equal(store.snapshot().page,2);assert.equal(store.snapshot().hasMore,false);
 store.dispose();
});

import test from 'node:test';
import assert from 'node:assert/strict';
async function api(){let module;try{module=await import('../src/catalog.js');}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}assert.equal(typeof module?.createCatalogClient,'function','independent market must own its bounded public catalog adapter');return module;}
const item={hanaId:'11111111-2222-4333-8444-555555555555',displayName:'Fixture plugin',summary:{zh:'公开简介',en:'Public summary'},categories:['tools'],channels:['dsh'],sourceLinks:[],installMethods:[],oneClickInstall:{allowed:false,reason:'no-install-method'}};
const page={items:[item],page:1,limit:50,total:1,totalPages:1,facets:{categories:[{id:'tools',count:1}],channels:[{id:'dsh',count:1}],sources:[{id:'awesome',count:1}]}};
test('public catalog adapter uses the same API and server facets as the website, exactly 50 per page',async()=>{
 const{createCatalogClient}=await api(),calls=[];
 const reader=createCatalogClient({websiteOrigin:'https://catalog.example',serverOrigin:'https://server.example',fetchImpl:async(url,init)=>{calls.push({url:String(url),init});return Response.json(page);}});
 const result=await reader.list({q:'notes',source:'awesome',category:'tools',channel:'dsh',page:1});
 const request=new URL(calls[0].url);assert.equal(request.pathname,'/api/v2/hanas');assert.equal(request.searchParams.get('limit'),'50');assert.equal(request.searchParams.get('source'),'awesome');assert.equal(request.searchParams.get('q'),'notes');assert.equal(request.searchParams.get('channel'),'dsh');assert.deepEqual(result.facets,page.facets);assert.equal(result.items[0].score,undefined);assert.equal(calls[0].init.credentials,'omit');assert.equal(calls[0].init.redirect,'error');
});
test('optional discovery facts remain absent and unknown filters cannot create client-owned ranking',async()=>{
 const{createCatalogClient}=await api(),reader=createCatalogClient({websiteOrigin:'https://catalog.example',serverOrigin:'https://server.example',fetchImpl:async()=>Response.json(page)});
 await assert.rejects(reader.list({tags:['trusted']}),/INVALID_QUERY/);await assert.rejects(reader.list({kind:'skill'}),/INVALID_QUERY/);
 const result=await reader.list({});assert.equal(result.items[0].trusted,undefined);assert.equal(result.recommendations,undefined);
});
test('semantic search calls the existing Host read endpoint and preserves identity, without invoking recommendations/decision',async()=>{
 const{createCatalogClient}=await api(),calls=[];
 const reader=createCatalogClient({websiteOrigin:'https://catalog.example',serverOrigin:'https://server.example',fetchImpl:async(url,init)=>{calls.push({url:String(url),init});return Response.json({requestId:'r',retrieval:{mode:'real',topK:50},candidates:[{hanaId:item.hanaId,objectId:'obj',name:item.displayName,summary:'result',score:0.8}]});}});
 await reader.search({query:'find a note tool'});assert.equal(new URL(calls[0].url).pathname,'/v1/capabilities/search');assert.equal(calls[0].init.method,'POST');assert.deepEqual(JSON.parse(calls[0].init.body),{query:'find a note tool',topK:50,telemetry:false});assert.equal(calls.length,1);
});
test('catalog failures and malformed pages are errors, never empty-success data or an automatic retry',async()=>{
 const{createCatalogClient}=await api();let calls=0;
 const reader=createCatalogClient({websiteOrigin:'https://catalog.example',serverOrigin:'https://server.example',fetchImpl:async()=>{calls++;return Response.json({error:{code:'UPSTREAM_UNAVAILABLE'}},{status:503});}});
 await assert.rejects(reader.list({}),/UPSTREAM_UNAVAILABLE/);assert.equal(calls,1);
 const invalid=createCatalogClient({websiteOrigin:'https://catalog.example',serverOrigin:'https://server.example',fetchImpl:async()=>Response.json({...page,items:Array.from({length:51},()=>item)})});await assert.rejects(invalid.list({}),/CATALOG_PAGE_INVALID/);
});

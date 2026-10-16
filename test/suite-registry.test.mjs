import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';
import {RegistryMetadataReader} from '../lib/suite/registry.js';
import {SuiteDeclarationService} from '../lib/suite/service.js';
async function server(t,handler){const s=createServer(handler);for (;;) { const port = 20000 + Math.floor(Math.random()*10001); try { await new Promise((r,j)=>{s.once("error",j);s.listen(port,"127.0.0.1",r);}); break; } catch(e) { if(e.code!=="EADDRINUSE")throw e; } }t.after(()=>new Promise(r=>s.close(r)));return `http://127.0.0.1:${s.address().port}/`;}
test('real registry adapter reads full npm metadata and the custom manifest without side effects',async t=>{
 const url=await server(t,(req,res)=>{assert.equal(req.headers.accept,'application/json');res.setHeader('content-type','application/json');res.end(JSON.stringify({name:'hanamesh-core',versions:{'0.3.12':{name:'hanamesh-core',version:'0.3.12',hanameshSuite:{schemaVersion:1}}}}));});
 const reader=new RegistryMetadataReader({timeoutMs:1000,maxResponseBytes:1048576,localTestRegistries:[url]});
 const result=await reader.read(url,'hanamesh-core');assert.equal(result.registry,url);assert.equal(result.versions['0.3.12'].hanameshSuite.schemaVersion,1);
});
test('registry redirect, source-name mismatch and response limit are named failures',async t=>{
 const url=await server(t,(req,res)=>{if(req.url.includes('redirect')){res.writeHead(302,{location:'/other'});res.end();}else if(req.url.includes('wrong'))res.end(JSON.stringify({name:'different',versions:{}}));else res.end('x'.repeat(500));});
 const reader=new RegistryMetadataReader({timeoutMs:1000,maxResponseBytes:100,localTestRegistries:[url]});
 for(const [name,code]of [['redirect','CORE_SUITE_SOURCE_MISMATCH'],['wrong','CORE_SUITE_SOURCE_MISMATCH'],['large','CORE_SUITE_METADATA_LIMIT']])await assert.rejects(reader.read(url,name),e=>e.code===code);
 await assert.rejects(new RegistryMetadataReader({timeoutMs:100,maxResponseBytes:100}).read(url,'x'),e=>e.code==='CORE_SUITE_SOURCE_UNSUPPORTED');
});
test('production GET adapter feeds exact registry-bound compatible tuples and changed metadata invalidates confirmation', async t => {
 const repository = name => `https://github.com/fixture/${name}`;
 const component = name => ({id:name,moduleName:name,repository:repository(name),label:name,versionRange:'^1.0.0',onFailure:'notice',impact:''});
 const profile = {schemaVersion:1,id:'fixture',version:'1.0.0',label:'fixture',runningTaskPolicy:'preserve-and-pause',components:[component('usage'),component('apps')]};
 const manifest = version => ({schemaVersion:1,id:'fixture',core:{name:'core',version,repository:repository('core')},components:profile.components.map(({id,moduleName,versionRange,repository})=>({id,moduleName,versionRange,repository}))});
 const record = (name,version) => ({name,version,repository:{url:`git+${repository(name)}.git`},engines:{node:'>=24 <25'},dsh:{bundle:{patch:'./profile/cordis.patch.yml'}},peerDependencies:{}});
 const core = record('core','1.0.0');
 const data = {core:{'1.0.0':{...core,hanameshSuite:manifest('1.0.0')},'1.1.0':{...record('core','1.1.0'),hanameshSuite:manifest('1.1.0')}},usage:{'1.0.0':record('usage','1.0.0')},apps:{'1.0.0':record('apps','1.0.0')}};
 let gets=0;
 const url = await server(t,(req,res)=>{gets++;const name=decodeURIComponent(req.url.slice(1));res.end(JSON.stringify({name,versions:data[name]}));});
 const observed = name => ({kind:'present',phase:'active',version:'1.0.0',repository:repository(name),metadata:record(name,'1.0.0')});
 const service = new SuiteDeclarationService({core,profile,manifest:manifest('1.0.0'),inventory:{observe:async()=>[observed('usage'),observed('apps')]},coreInventory:async()=>observed('core'),nodeVersion:process.versions.node,peerVersion:async()=>null,registry:new RegistryMetadataReader({localTestRegistries:[url]})});
 assert.equal((await service.read()).completeness,'complete');assert.equal(gets,0);
 const first=await service.read({registry:url});assert.equal(gets,3);assert.equal(first.upgrades.length,1);assert.equal(first.upgrades[0].registry,url);assert.deepEqual(first.upgrades[0].targets.map(row=>row.version),['1.1.0','1.0.0','1.0.0']);
 data.core['1.1.0'].peerDependencies={unknown:'*'};
 const second=await service.read({registry:url});assert.notEqual(first.declarationId,second.declarationId);assert.deepEqual(second.upgrades,[]);assert.ok(second.blocked.some(row=>row.code==='CORE_SUITE_PEER_UNKNOWN'));
});
test('metadata timeout is named and does not become an empty upgrade list',async t=>{
 const url=await server(t,(_req,_res)=>{});
 await assert.rejects(new RegistryMetadataReader({timeoutMs:20,localTestRegistries:[url]}).read(url,'core'),error=>error.code==='CORE_SUITE_METADATA_TIMEOUT');
});

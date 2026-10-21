import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {apply} from '../../lib/dsh.mjs';
import {SUITE_MANIFEST} from 'hanamesh-core/suite';

test('actual apply exposes a read-only getter that reads an explicitly configured loopback registry', async t => {
 const root = await mkdtemp(join(tmpdir(), 'core-suite-adapter-'));
 t.after(() => rm(root, {recursive:true,force:true}));
 const core = JSON.parse(await readFile('package.json','utf8'));
 const versions = ['0.2.0-rc.26','0.6.0'];
 const data = {[core.name]:{[core.version]:core}};
 for(const [i,row]of SUITE_MANIFEST.components.entries()) {
   const metadata = {name:row.moduleName,version:versions[i],repository:row.repository,engines:{node:'>=24 <25'},dsh:{bundle:{patch:'./profile/cordis.patch.yml'}},exports:{'.':'./index.mjs','./package.json':'./package.json'}};
   const dir=join(root,'node_modules',row.moduleName);await mkdir(dir,{recursive:true});
   await writeFile(join(dir,'package.json'),JSON.stringify(metadata));await writeFile(join(dir,'index.mjs'),'throw Error("DO_NOT_EXECUTE_PLUGIN");');
   data[row.moduleName]={[versions[i]]:metadata};
 }
 const usage=SUITE_MANIFEST.components[0].moduleName;
 data[usage]['0.2.0-rc.27']={...data[usage][versions[0]],version:'0.2.0-rc.27'};
 let gets=0;const server=createServer((req,res)=>{gets++;const name=decodeURIComponent(req.url.slice(1));assert.equal(req.headers.accept,'application/json');res.end(JSON.stringify({name,versions:data[name]}));});
 for(;;){try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(20000+Math.floor(Math.random()*10001),'127.0.0.1',resolve);});break;}catch(error){if(error.code!=='EADDRINUSE')throw error;}}
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const registry=`http://127.0.0.1:${server.address().port}/`;
 let writes=0,service,dispose,leaseHandler,throwOnDispose=false,disposed=false;
 const baseUrl=pathToFileURL(join(root,'consumer.mjs')).href;
 const entries=[{id:'hanamesh-core',options:{name:'hanamesh-core'},fiber:{state:2}},...SUITE_MANIFEST.components.map((row,i)=>({id:i===0?'hanamesh-usage':'hanamesh-app-host',options:{name:row.moduleName},fiber:{state:2},parent:{tree:{ctx:{baseUrl}}}}))];
 const ctx={loader:{entries:()=>entries},storageDomain:{open:async spec=>{let value=structuredClone(spec.global.initial);return {global:{get:()=>value,set:async next=>{value=next;writes++;}},close:async()=>{}};}},connection:{rpc:{intercept:()=>{throw Error('GATEWAY_ALREADY_OWNS_INTERCEPTOR');}},fetch:{register:route=>{if(route.path==='/api/hanamesh/core/client-peer-lease')leaseHandler=route.fetch;return async()=>{if(throwOnDispose)throw Error('FIXTURE_UNREGISTER_FAILED');};}},requestRejection:()=>undefined},provide:(name,value)=>{if(name==='hanameshCore')service=value;return()=>{};},on:()=>()=>{},effect:fn=>{dispose=fn();}};
 await apply(ctx,{serverOrigin:null,websiteOrigin:null,sharedIdentityDir:join(root,'identity-root'),suiteLocalTestRegistries:[registry]});
 t.after(()=>disposed?undefined:dispose());
 const absent=await service.getSuiteDeclaration();assert.equal(absent.completeness,'unknown');assert.equal(absent.peerFacts.react,'unknown');assert.equal(absent.clientPeerFacts.reason,'CORE_SUITE_CLIENT_PEER_NOT_CONNECTED');assert.equal(service.getConsent(),'withheld');
 const leaseRequest=(payload,signal,origin='http://127.0.0.1:20123')=>new Request('http://127.0.0.1:20123/api/hanamesh/core/client-peer-lease',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(payload),signal});
 assert.equal((await leaseHandler(leaseRequest({},new AbortController().signal,'https://untrusted.invalid'))).status,403);
 assert.equal((await leaseHandler(leaseRequest({},new AbortController().signal))).status,400);
 const lease=new AbortController();const pending=leaseHandler(leaseRequest({protocol:1,pageId:'fixture-page-0001',activationId:'fixture-active-01',generation:1,reactVersion:'18.3.1'},lease.signal));await new Promise(r=>setImmediate(r));t.after(async()=>{lease.abort();await pending;});
 const before=writes;
 const current=await service.getSuiteDeclaration();assert.equal(current.completeness,'complete');assert.equal(gets,0);
 const declaration=await service.getSuiteDeclaration({registry});assert.equal(declaration.completeness,'complete');assert.equal(declaration.upgrades.length,1,JSON.stringify(declaration.blocked));assert.equal(declaration.upgrades[0].targets[1].version,'0.2.0-rc.27');assert.equal(declaration.registry,registry);assert.equal(gets,3);assert.equal(writes,before);lease.abort();await pending;const disconnected=await service.getSuiteDeclaration({registry});assert.equal(disconnected.completeness,'unknown');assert.deepEqual(disconnected.upgrades,[]);const live=new AbortController();let settled=false;const held=leaseHandler(leaseRequest({protocol:1,pageId:'fixture-page-0002',activationId:'fixture-active-02',generation:2,reactVersion:'18.3.1'},live.signal)).then(response=>response.text()).then(()=>{settled=true;});await new Promise(r=>setImmediate(r));throwOnDispose=true;disposed=true;await assert.rejects(dispose(),e=>e.code==='CORE_PLUGIN_CLEANUP_FAILED'&&e instanceof AggregateError&&e.errors.some(cause=>cause.message==='FIXTURE_UNREGISTER_FAILED'));await new Promise(r=>setImmediate(r));assert.equal(settled,true,'even a failed unregister must withdraw every live renderer lease');await held;
});

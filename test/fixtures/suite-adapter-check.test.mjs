import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {cp, readFile, mkdtemp, mkdir, writeFile, rename, realpath, rm, symlink, unlink} from 'node:fs/promises';
import {existsSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {apply} from '../../lib/dsh.mjs';
import {SUITE_MANIFEST} from '@hanamesh/core/suite';

test('actual apply consumes public DSH metadata and compatibility without private Loader access', async t => {
 const root = await mkdtemp(join(tmpdir(), 'core-suite-adapter-'));
 t.after(() => rm(root, {recursive:true,force:true}));
 const core = JSON.parse(await readFile('package.json','utf8'));
 const versions = ['0.2.0-rc.26','0.1.2','0.1.0'];
 const data = {[core.name]:{[core.version]:core}};
 const peerName = '@deepseek-ai/schemastery';
 const market = SUITE_MANIFEST.components.find(row => row.id === 'market').moduleName;
 const marketLink = join(root, 'node_modules', market);
 const marketDir = join(root, 'desktop-resources', 'node_modules', market);
 for(const [i,row]of SUITE_MANIFEST.components.entries()) {
   const metadata = {name:row.moduleName,version:versions[i],repository:row.repository,engines:{node:'>=24 <25'},dsh:{bundle:{patch:'./profile/cordis.patch.yml'}},exports:{'.':'./index.mjs','./package.json':'./package.json'}};
   const dir = row.moduleName === market ? marketDir : join(root, 'node_modules', row.moduleName);
   await mkdir(dir, {recursive:true});
   const physical = row.moduleName === market ? {
     ...metadata,
     peerDependencies:{[peerName]:'>=3.19.0 <3.20.0-0'},
     exports:{...metadata.exports, '.':{import:'./lib/index.mjs',require:'./index.mjs'}, './dsh':{import:null,require:'./index.mjs'}},
   } : metadata;
   await writeFile(join(dir,'package.json'),JSON.stringify(physical));await writeFile(join(dir,'index.mjs'),'throw Error("DO_NOT_EXECUTE_PLUGIN");');
   data[row.moduleName]={[versions[i]]:metadata};
 }
 await mkdir(dirname(marketLink), {recursive:true});
 await symlink(marketDir, marketLink, 'dir');
 await mkdir(join(marketDir, 'lib'));
 await writeFile(join(marketDir, 'lib/index.mjs'), 'throw Error("DO_NOT_EXECUTE_PLUGIN");');
 const marketEntry = pathToFileURL(await realpath(join(marketDir, 'lib/index.mjs'))).href;
 const peerManifest = async (dir, version) => {
   await mkdir(dir, {recursive:true});
   const file = join(dir, 'package.json');
   await writeFile(file, JSON.stringify({name:peerName, version}));
   return file;
 };
 const asarPeer = await peerManifest(join(root, 'harness.asar/node_modules', peerName), '3.19.0');
 const peerCalls = [];
 const bundleDir=join(root,'node_modules',SUITE_MANIFEST.bundle.name);await mkdir(bundleDir,{recursive:true});
 const bundle={...SUITE_MANIFEST.bundle,version:'0.1.0',exports:{'./package.json':'./package.json'},dsh:{bundle:{patch:'./cordis.patch.yml'}},dependencies:{[core.name]:core.version,...Object.fromEntries(SUITE_MANIFEST.components.map((r,i)=>[r.moduleName,versions[i]]))}};
 await writeFile(join(bundleDir,'package.json'),JSON.stringify(bundle));
 await symlink(process.cwd(),join(root,'node_modules',core.name),'dir');
 data[bundle.name]={'0.1.0':bundle,'0.1.1':{...bundle,version:'0.1.1',dependencies:{...bundle.dependencies,[SUITE_MANIFEST.components[0].moduleName]:'0.2.0-rc.27'}}};
 const usage=SUITE_MANIFEST.components[0].moduleName;
 data[usage]['0.2.0-rc.27']={...data[usage][versions[0]],version:'0.2.0-rc.27'};
 let gets=0;const server=createServer((req,res)=>{gets++;const name=decodeURIComponent(req.url.slice(1));assert.equal(req.headers.accept,'application/json');res.end(JSON.stringify({name,versions:data[name]}));});
 for(;;){try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(20000+Math.floor(Math.random()*10001),'127.0.0.1',resolve);});break;}catch(error){if(error.code!=='EADDRINUSE')throw error;}}
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const registry=`http://127.0.0.1:${server.address().port}/`;
 let writes=0,service,dispose,leaseHandler,throwOnDispose=false,disposed=false;
 const baseUrl=pathToFileURL(join(root,'consumer.mjs')).href;
 const entries=[{id:'hanamesh-core',options:{name:'@hanamesh/core'},fiber:{state:2},parent:{tree:{ctx:{baseUrl}}}},...SUITE_MANIFEST.components.map(row=>({id:'hanamesh-'+row.id,options:{name:row.moduleName},fiber:{state:2},parent:{tree:{ctx:{baseUrl}}}}))];
 const marketLoaderEntry = entries.find(entry => entry.options.name === market);
 const originalMarketParent = marketLoaderEntry.parent;
 const hostPeerDir=join(root,'host-cordis');await mkdir(hostPeerDir);
 await writeFile(join(hostPeerDir,'package.json'),JSON.stringify({name:'@deepseek-ai/cordis',version:'4.0.5-alpha.2'}));
 const bootDir=join(root,'host-app-boot');await mkdir(bootDir);await writeFile(join(bootDir,'package.json'),JSON.stringify({name:'@deepseek-ai/dsh-app-boot',version:'0.2.1-rc.3'}));
 process.env.HM_TEST_DSH_BOOT_METADATA=join(bootDir,'package.json');process.env.HM_TEST_DSH_CORDIS_METADATA=join(hostPeerDir,'package.json');
 let runtimePeer = asarPeer;
 function packageOf(name, parentURL) {
   let path;
   if (name === '@deepseek-ai/cordis') path = process.env.HM_TEST_DSH_CORDIS_METADATA;
   else if (name === peerName) {
     peerCalls.push(parentURL);
     try { path = createRequire(parentURL).resolve(name + '/package.json'); }
     catch (error) {
       if (error.code !== 'MODULE_NOT_FOUND') throw error;
     }
     if (!path || !existsSync(path)) {
       if (parentURL !== marketEntry || !runtimePeer) return undefined;
       path = runtimePeer;
     }
   } else path = createRequire(parentURL).resolve(name + '/package.json');
   const manifest = JSON.parse(readFileSync(path, 'utf8'));
   return {name:manifest.name,version:manifest.version,manifest,manifestPath:path,dir:dirname(path)};
 }
 const ctx={loader:{entries:()=>entries},pluginPackages:{packageOf},storageDomain:{open:async spec=>{let value=structuredClone(spec.global.initial);return {global:{get:()=>value,set:async next=>{value=next;writes++;}},close:async()=>{}};}},connection:{rpc:{intercept:()=>{throw Error('GATEWAY_ALREADY_OWNS_INTERCEPTOR');}},fetch:{register:route=>{if(route.path==='/api/hanamesh/core/client-peer-lease')leaseHandler=route.fetch;return async()=>{if(throwOnDispose)throw Error('FIXTURE_UNREGISTER_FAILED');};}},requestRejection:()=>undefined},provide:(name,value)=>{if(name==='hanameshCore')service=value;return()=>{};},on:()=>()=>{},effect:fn=>{dispose=fn();}};
 await apply(ctx,{serverOrigin:null,websiteOrigin:null,sharedIdentityDir:join(root,'identity-root'),suiteLocalTestRegistries:[registry]});
 t.after(()=>disposed?undefined:dispose());
 const absent=await service.getSuiteDeclaration();assert.equal(absent.completeness,'unknown');assert.equal(absent.peerFacts.react,'unknown');assert.equal(absent.clientPeerFacts.reason,'CORE_SUITE_CLIENT_PEER_NOT_CONNECTED');assert.equal(service.getConsent(),'withheld');
 const leaseRequest=(payload,signal,origin='http://127.0.0.1:20123')=>new Request('http://127.0.0.1:20123/api/hanamesh/core/client-peer-lease',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(payload),signal});
 assert.equal((await leaseHandler(leaseRequest({},new AbortController().signal,'https://untrusted.invalid'))).status,403);
 assert.equal((await leaseHandler(leaseRequest({},new AbortController().signal))).status,400);
 const lease = new AbortController();
 const openRequest = leaseRequest({protocol:2,pageId:'fixture-page-0001',activationId:'fixture-active-01',generation:1,reactVersion:'18.3.1'}, lease.signal);
 const pending = leaseHandler(openRequest);
 await new Promise(r=>setImmediate(r));
 t.after(async()=>{lease.abort();await pending;});
 const before=writes;
 peerCalls.length = 0;
 const current=await service.getSuiteDeclaration();
 assert.equal(current.peerFacts[peerName], '3.19.0');
 assert.deepEqual(peerCalls, [marketEntry], 'use Market’s resolved ESM entry for its declared peer');
 assert.equal(current.completeness,'complete');assert.equal(current.peerFacts['@deepseek-ai/cordis'],'4.0.5-alpha.2','use the runtime resolver, not this checkout’s Node dependencies');assert.equal(current.peerFacts['@deepseek-ai/dsh-client-ui-primitives'],'0.2.1-rc.3','DSH checks its peer API against the running runtime, including client-only packages');assert.equal(gets,0);assert.deepEqual(current.blocked,[{code:'CORE_SUITE_SOURCE_MISSING'}],'offline source omission must not make an installed suite unknown');const publicAPI=await import('@deepseek-ai/dsh-app-boot');assert.ok(publicAPI.compatibilityCalls.some(call=>call.runtimeVersion==='0.2.1-rc.3'),'the public SDK must own DSH compatibility');
 const usageDir = join(root, 'node_modules', usage);
 const usageManifest = join(usageDir, 'package.json');
 const originalUsage = data[usage][versions[0]];
 await writeFile(usageManifest, JSON.stringify({...originalUsage, peerDependencies:{[peerName]:'~3.18.0'}}));
 await peerManifest(join(usageDir, 'node_modules', peerName), '3.18.0');
 await rename(bundleDir, bundleDir + '.held');
 peerCalls.length = 0;
 const legacy = await service.getSuiteDeclaration();
 assert.equal(legacy.completeness, 'complete');
 assert.equal(legacy.legacy.status, 'installed');
 assert.equal(legacy.peerFacts[peerName], 'unknown', 'different compatible component versions cannot become one global version');
 assert.deepEqual(peerCalls, [pathToFileURL(await realpath(join(usageDir,'index.mjs'))).href, marketEntry]);
 await rename(bundleDir + '.held', bundleDir);
 await writeFile(usageManifest, JSON.stringify(originalUsage));
 const localPeerDir = join(marketDir, 'lib/node_modules', peerName);
 await peerManifest(localPeerDir, '3.19.1');
 assert.equal((await service.getSuiteDeclaration()).peerFacts[peerName], '3.19.1');
 const localManifest = await peerManifest(localPeerDir, '3.20.0');
 const incompatible = await service.getSuiteDeclaration();
 assert.equal(incompatible.completeness, 'incomplete');
 assert.ok(incompatible.blocked.some(row => row.code === 'CORE_SUITE_PEER_INCOMPATIBLE'));
 await unlink(localManifest);
 runtimePeer = undefined;
 const missingPeer = await service.getSuiteDeclaration();
 assert.equal(missingPeer.completeness, 'unknown');
 assert.ok(missingPeer.blocked.some(row => row.code === 'CORE_SUITE_PEER_UNKNOWN'));
 runtimePeer = asarPeer;
 entries.push({...marketLoaderEntry});
 peerCalls.length = 0;
 assert.notEqual((await service.getSuiteDeclaration()).completeness, 'complete');
 assert.deepEqual(peerCalls, []);
 entries.pop();
 marketLoaderEntry.options.name = market + '/dsh';
 const missingEntry = await service.getSuiteDeclaration();
 assert.equal(missingEntry.completeness, 'unknown');
 assert.equal(missingEntry.peerFacts[peerName], 'unknown');
 assert.deepEqual(peerCalls, [], 'an unresolved ESM entry must never fall back to Core');
 marketLoaderEntry.options.name = market;
 const profileRoot = join(root, 'older-profile/node_modules/.pnpm/market/node_modules');
 const profileMarketDir = join(profileRoot, market);
 const profileFile = join(root, 'older-profile', 'cordis.yml');
 const profileMarketLink = join(root, 'older-profile/node_modules', market);
 await mkdir(dirname(profileMarketDir), {recursive:true});
 await mkdir(dirname(profileMarketLink), {recursive:true});
 await cp(marketDir, profileMarketDir, {recursive:true});
 await symlink(profileMarketDir, profileMarketLink, 'dir');
 await peerManifest(join(profileRoot, peerName), '3.19.0');
 marketLoaderEntry.parent = {tree:{ctx:{baseUrl:pathToFileURL(profileFile).href}}};
 const profile = await service.getSuiteDeclaration();
 assert.equal(profile.peerFacts[peerName], '3.19.0', 'read the peer in the pnpm profile’s physical layout');
 assert.equal(profile.completeness, 'complete');
 marketLoaderEntry.parent = originalMarketParent;
 await writeFile(join(bootDir,'package.json'),JSON.stringify({name:'@deepseek-ai/dsh-app-boot',version:'0.2.2-rc.1'}));assert.equal((await service.getSuiteDeclaration()).completeness,'complete');assert.ok(publicAPI.compatibilityCalls.some(call=>call.runtimeVersion==='0.2.2-rc.1'));
 await writeFile(join(bootDir,'package.json'),JSON.stringify({name:'@deepseek-ai/dsh-app-boot',version:'0.3.0'}));const incompatibleRuntime=await service.getSuiteDeclaration();assert.equal(incompatibleRuntime.completeness,'incomplete');assert.ok(incompatibleRuntime.blocked.some(row=>row.code==='CORE_SUITE_PEER_INCOMPATIBLE'));
 await writeFile(join(bootDir,'package.json'),JSON.stringify({name:'@deepseek-ai/dsh-app-boot',version:'0.2.1-rc.3'}));
 const metadata=process.env.HM_TEST_DSH_CORDIS_METADATA;process.env.HM_TEST_DSH_CORDIS_METADATA=join(root,'missing-package.json');const unobservable=await service.getSuiteDeclaration();assert.equal(unobservable.completeness,'unknown');assert.ok(unobservable.blocked.some(row=>row.code==='CORE_SUITE_PEER_UNKNOWN'));process.env.HM_TEST_DSH_CORDIS_METADATA=metadata;
 const declaration=await service.getSuiteDeclaration({registry});assert.equal(declaration.completeness,'complete');assert.equal(declaration.upgrades.length,1,JSON.stringify(declaration.blocked));assert.equal(declaration.upgrades[0].targets[1].version,'0.2.0-rc.27');assert.equal(declaration.registry,registry);assert.equal(gets,SUITE_MANIFEST.components.length+2);assert.equal(writes,before);
 const currentMarket = Object.values(data[market])[0];
 data[market][currentMarket.version] = {...currentMarket, peerDependencies:{[peerName]:'>=3.19.0 <3.20.0-0'}};
 peerCalls.length = 0;
 const prospective = await service.getSuiteDeclaration({registry});
 assert.equal(prospective.completeness, 'complete');
 assert.equal(prospective.peerFacts[peerName], '3.19.0');
 assert.deepEqual(prospective.upgrades, []);
 assert.ok(prospective.blocked.some(row => row.bundleVersion === '0.1.1' && row.code === 'CORE_SUITE_PEER_UNKNOWN'));
 assert.deepEqual(peerCalls, [marketEntry, pathToFileURL(await realpath('lib/dsh.mjs')).href]);
 data[market][currentMarket.version] = currentMarket;
 lease.abort();
 assert.equal(openRequest.signal.aborted, true);
 await (await pending).text();
 const disconnected=await service.getSuiteDeclaration({registry});assert.equal(disconnected.completeness,'unknown');assert.deepEqual(disconnected.upgrades,[]);const live=new AbortController();let settled=false;const held=leaseHandler(leaseRequest({protocol:2,pageId:'fixture-page-0002',activationId:'fixture-active-02',generation:2,reactVersion:'18.3.1'},live.signal)).then(response=>response.text()).then(()=>{settled=true;});await new Promise(r=>setImmediate(r));throwOnDispose=true;disposed=true;await assert.rejects(dispose(),e=>e.code==='CORE_PLUGIN_CLEANUP_FAILED'&&e instanceof AggregateError&&e.errors.some(cause=>cause.message==='FIXTURE_UNREGISTER_FAILED'));await new Promise(r=>setImmediate(r));assert.equal(settled,true,'even a failed unregister must withdraw every live renderer lease');await held;
});

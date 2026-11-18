// CD2: widen read-only coverage to the common install methods without guessing absence from read failures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,chmod,rm,symlink} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {scratch} from './helpers.mjs';
import {declaration,core} from './fixtures/core-suite-declaration.mjs';
import {createInstallationStatusReader,officialDshDesktopProfile} from '../src/library/installation-status.js';
import {discoverOfficialReader} from '../src/library/installation-discovery.js';
import {readerVersionFailure} from '../src/library/installation-cli.js';
async function home(t){const dir=await scratch('cd2-coverage-');t.after(()=>rm(dir,{recursive:true,force:true}));return dir}
async function executable(file){await mkdir(dirname(file),{recursive:true});await writeFile(file,`#!${process.execPath}\nprocess.stdout.write("codex-cli 0.167.0-alpha.3.2")\n`);await chmod(file,0o755);return file}
const row=(result,channel,scope)=>result.observations.find(x=>x.channel===channel&&x.scope.id===scope);
const unavailable=async()=>{throw Object.assign(new Error('not found'),{code:'AGENT_READER_UNAVAILABLE'})};

test('desktop-app bundled and prerelease official CLI versions satisfy the minimum-version format check',()=>{
 assert.equal(readerVersionFailure('codex','codex-cli 0.167.0-alpha.3.2'),null,'ChatGPT.app bundles a prerelease Codex CLI');
 assert.equal(readerVersionFailure('claude','2.1.330-beta.1 (Claude Code)'),null);
 assert.equal(readerVersionFailure('codex','codex-cli 0.162.1-alpha.1'),'AGENT_READER_VERSION_UNSUPPORTED','a prerelease of the minimum is still older');
 assert.equal(readerVersionFailure('codex','codex-cli 0.167'),'AGENT_READER_VERSION_INVALID');
});

test('Codex CLI bundled inside the ChatGPT desktop app is discovered after standalone layouts',async t=>{
 const root=await home(t),apps=join(root,'Applications');
 const bundled=await executable(join(apps,'ChatGPT.app','Contents','Resources','codex-cli','bin','codex'));
 const reader=await discoverOfficialReader({channel:'codex',home:root,env:{HOME:root,PATH:''},platform:'darwin',systemBinDirs:[],applicationDirs:[apps],loginPath:async()=>''}).catch(error=>({error:error.code}));
 assert.equal(reader.executable,bundled,'the ChatGPT.app bundled Codex CLI must be found');
 const standalone=await executable(join(root,'.local','bin','codex'));
 assert.equal((await discoverOfficialReader({channel:'codex',home:root,env:{HOME:root,PATH:''},platform:'darwin',systemBinDirs:[],applicationDirs:[apps],loginPath:async()=>''})).executable,standalone);
 await assert.rejects(discoverOfficialReader({channel:'claude',home:root,env:{HOME:root,PATH:''},platform:'darwin',systemBinDirs:[],applicationDirs:[apps],loginPath:async()=>''}),{code:'AGENT_READER_UNAVAILABLE'},'the bundle carries no Claude Code');
});

test('an absent official user profile is authoritative not-installed, with or without the CLI; unreadable stays unknown',async()=>{
 for(const discoverReader of [unavailable,async()=>assert.fail('absent profile needs no CLI execution')]){
  const result=await createInstallationStatusReader({discoverReader,profileState:async()=>'absent',runCommand:async()=>assert.fail('no command')})();
  for(const channel of ['claude','codex']){
   const value=row(result,channel,'agent-cli');
   assert.equal(value.status,'not-installed');assert.equal(value.reason,null);assert.equal(value.version,null);
   assert.deepEqual(value.identity,{pluginName:'hanamesh',marketplace:'hanamesh'},'the website compares the registered identity');
  }
 }
 const denied=await createInstallationStatusReader({discoverReader:unavailable,profileState:async()=>{throw Object.assign(new Error('EACCES'),{code:'AGENT_PROFILE_UNAVAILABLE'})}})();
 assert.equal(row(denied,'claude','agent-cli').status,'unknown');assert.equal(row(denied,'claude','agent-cli').reason.code,'AGENT_PROFILE_UNAVAILABLE');
 const present=await createInstallationStatusReader({discoverReader:unavailable,profileState:async()=>'present'})();
 assert.equal(row(present,'codex','agent-cli').reason.code,'AGENT_READER_UNAVAILABLE','a profile without a readable CLI is never guessed absent');
});

async function profile(dir,{dependency=true,bundle='0.1.6',members={'@hanamesh/core':'0.3.35','@hanamesh/usage':'0.3.0-rc.19','@hanamesh/dsh-app-host':'0.6.25'}}={}){
 await mkdir(dir,{recursive:true});
 await writeFile(join(dir,'package.json'),JSON.stringify({name:'desktop',dependencies:dependency?{'@hanamesh/hanamesh':bundle}:{'other':'1.0.0'},dsh:{profile:{bundles:dependency?['@hanamesh/hanamesh']:[]}}}));
 if(!dependency)return;
 const bundleDir=join(dir,'node_modules','@hanamesh','hanamesh');await mkdir(bundleDir,{recursive:true});
 await writeFile(join(bundleDir,'package.json'),JSON.stringify({name:'@hanamesh/hanamesh',version:bundle,dependencies:members}));
 for(const [name,version]of Object.entries(members)){const memberDir=join(dir,'node_modules',...name.split('/'));await mkdir(memberDir,{recursive:true});await writeFile(join(memberDir,'package.json'),JSON.stringify({name,version}))}
}
test('the HanaMesh client reads the official DSH desktop profile on disk for the DSH channel',async t=>{
 const root=await home(t),dsh=join(root,'.dsh','profiles','desktop'),service={...core(declaration()),assessLegacyInstallation:async facts=>{assert.ok(facts.components.every(row=>row.observation.kind==='missing'));return{status:'not-installed',components:facts.components.map(row=>({name:row.moduleName,version:null,status:'missing'})),issues:[],reason:null}}};
 const read=dir=>createInstallationStatusReader({client:'hanamesh',core:()=>service,discoverReader:unavailable,profileState:async()=>'absent',otherProfileDir:dir})();
 let value=row(await read(dsh),'dsh','other-runtime');
 assert.equal(value.status,'not-installed','no DSH desktop profile means the suite is not installed there');assert.equal(value.reason,null);
 await profile(dsh,{dependency:false});assert.equal(row(await read(dsh),'dsh','other-runtime').status,'not-installed');
 await rm(dsh,{recursive:true});await profile(dsh);value=row(await read(dsh),'dsh','other-runtime');
 assert.equal(value.status,'installed');assert.equal(value.version,'0.1.6');assert.equal(value.versionKind,'suite-bundle');
 assert.deepEqual(value.components.map(c=>[c.name,c.version]),[['@hanamesh/core','0.3.35'],['@hanamesh/usage','0.3.0-rc.19'],['@hanamesh/dsh-app-host','0.6.25']]);
 await rm(join(dsh,'node_modules','@hanamesh','usage'),{recursive:true});value=row(await read(dsh),'dsh','other-runtime');
 assert.equal(value.status,'incomplete');assert.equal(value.reason.code,'DSH_PROFILE_SUITE_INCOMPLETE');
 await writeFile(join(dsh,'package.json'),'{');value=row(await read(dsh),'dsh','other-runtime');
 assert.equal(value.status,'unknown');assert.equal(value.reason.code,'DSH_PROFILE_UNREADABLE');
 value=row(await read(null),'dsh','other-runtime');
 assert.equal(value.status,'unknown','sharing the same home cannot separate the two clients');assert.equal(value.reason.code,'OTHER_RUNTIME_NOT_OBSERVED');
 const fromDsh=row(await createInstallationStatusReader({client:'dsh',core:()=>service,discoverReader:unavailable,profileState:async()=>'absent',otherProfileDir:dsh})(),'hanamesh','other-runtime');
 assert.equal(fromDsh.status,'unknown','the HanaMesh client answers for itself');
});

// Exercise the production selector, never substitute null for the identity guard.
for(const alias of ['direct','target-symlink','own-symlink'])test(`same physical profile stays unknown (${alias})`,async t=>{
 const root=await home(t),target=join(root,'.dsh','profiles','desktop'),physical=join(root,'physical');
 await mkdir(dirname(target),{recursive:true});
 let own=target;
 if(alias==='target-symlink'){await profile(physical);await symlink(physical,target,'dir');own=physical}
 else{await profile(target);if(alias==='own-symlink'){own=join(root,'own-alias');await symlink(target,own,'dir')}}
 const selected=officialDshDesktopProfile(own,root);
 const result=await createInstallationStatusReader({client:'hanamesh',otherProfileDir:selected,profileState:async()=>'absent'})();
 const value=row(result,'dsh','other-runtime');
 assert.equal(value.status,'unknown');assert.equal(value.reason.code,'OTHER_RUNTIME_NOT_OBSERVED');
 assert.equal(selected,null);
});
test('profile identity failures never authorize reading another client',async t=>{
 const root=await home(t),target=join(root,'.dsh','profiles','desktop');await profile(target);
 const loop=join(root,'loop');await symlink(loop,loop);
 for(const own of [undefined,'',join(root,'missing'),loop]){
  const selected=officialDshDesktopProfile(own,root);
  const value=row(await createInstallationStatusReader({client:'hanamesh',otherProfileDir:selected,profileState:async()=>'absent'})(),'dsh','other-runtime');
  assert.equal(value.status,'unknown');assert.equal(value.reason.code,'OTHER_RUNTIME_NOT_OBSERVED');assert.equal(selected,null);
 }
 const own=join(root,'own');await mkdir(own);await rm(target,{recursive:true});await symlink(loop,target);
 assert.equal(officialDshDesktopProfile(own,root),null,'unresolvable target identity is unknown');
});
test('distinct physical profiles permit the official DSH disk observation',async t=>{
 const root=await home(t),own=join(root,'own'),target=join(root,'.dsh','profiles','desktop');await mkdir(own);await profile(target);
 const selected=officialDshDesktopProfile(own,root);assert.equal(selected,target);
 const value=row(await createInstallationStatusReader({client:'hanamesh',otherProfileDir:selected,profileState:async()=>'absent'})(),'dsh','other-runtime');
 assert.equal(value.status,'installed');assert.equal(value.version,'0.1.6');
});

test('profile identity is rechecked before every explicit read on a reused reader',async t=>{
 const root=await home(t),own=join(root,'own'),other=join(root,'other'),target=join(root,'.dsh','profiles','desktop');
 await profile(own);await profile(other);await mkdir(dirname(target),{recursive:true});await symlink(other,target,'dir');
 const read=createInstallationStatusReader({client:'hanamesh',otherProfileDir:()=>officialDshDesktopProfile(own,root),profileState:async()=>'absent'});
 t.after(()=>read.close());assert.equal(row(await read(),'dsh','other-runtime').status,'installed');
 await rm(target);await symlink(own,target,'dir');
 const value=row(await read(),'dsh','other-runtime');assert.equal(value.status,'unknown','a cached reader must not retain an earlier distinct-profile decision');assert.equal(value.reason.code,'OTHER_RUNTIME_NOT_OBSERVED');
});

test('a later explicit read can resolve a previously missing target profile',async t=>{
 const root=await home(t),own=join(root,'own'),target=join(root,'.dsh','profiles','desktop');await profile(own);
 const read=createInstallationStatusReader({client:'hanamesh',otherProfileDir:()=>officialDshDesktopProfile(own,root),profileState:async()=>'absent'});t.after(()=>read.close());
 assert.equal(row(await read(),'dsh','other-runtime').reason.code,'OTHER_RUNTIME_NOT_OBSERVED');
 await profile(target);assert.equal(row(await read(),'dsh','other-runtime').status,'installed');
});

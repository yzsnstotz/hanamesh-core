import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,rm,symlink,realpath} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {scratch} from './helpers.mjs';
import {createInstallationStatusReader} from '../src/library/installation-status.js';
import {declaration,core,names} from './fixtures/core-suite-declaration.mjs';
const versions=['0.3.24','0.3.0-rc.7','0.6.16'];
const verdict=status=>({status,components:names.map((name,i)=>({name,version:versions[i],active:true,status:'present'})),issues:status==='incomplete'?[{moduleName:names[1],code:'CORE_LEGACY_COMPONENT_VERSION',message:names[1]+'：版本低于现有要求。'}]:[],reason:status==='not-installed'?null:{code:status==='installed'?'CORE_LEGACY_COMPONENTS_INSTALLED':status==='incomplete'?'CORE_LEGACY_COMPONENTS_UNUSABLE':'CORE_LEGACY_COMPONENTS_UNKNOWN',message:status==='installed'?'已安装（旧版组件），建议升级。':names[1]+'：版本低于现有要求。',action:'按 DSH 安装说明升级。'}});
async function profile(t){const root=await scratch('dt7-legacy-');t.after(()=>rm(root,{recursive:true,force:true}));await writeFile(join(root,'package.json'),JSON.stringify({dependencies:Object.fromEntries(names.map((n,i)=>[n,versions[i]])),dsh:{profile:{bundles:names}}}));for(const [i,name]of names.entries()){const dir=join(root,'node_modules',name);await mkdir(dir,{recursive:true});await writeFile(join(dir,'package.json'),JSON.stringify({name,version:versions[i],main:'index.js',peerDependencies:{external:'*'}}));await writeFile(join(dir,'index.js'),'throw new Error("must not execute")');const peer=join(root,'node_modules','external');await mkdir(peer,{recursive:true});await writeFile(join(peer,'package.json'),JSON.stringify({name:'external',version:'1.2.3'}))}return root}
for(const status of ['installed','incomplete','not-installed','unknown'])test(`DT7 disk facts delegate ${status} to Core without AppHost compatibility calculation`,async t=>{
 const dir=await profile(t);let called=0;
 const provider={...core(declaration()),assessLegacyInstallation:async facts=>{called++;assert.deepEqual(facts.components.map(c=>c.observation.version),versions);assert.ok(facts.components.every(c=>c.observation.phase==='active'));assert.equal(facts.components[0].peers.external,'1.2.3');return verdict(status)}};
 const read=createInstallationStatusReader({client:'hanamesh',core:()=>provider,profileState:async()=>'absent',otherProfileDir:dir});t.after(()=>read.close());
 const result=(await read()).observations.find(r=>r.scope.id==='other-runtime');assert.equal(called,1);assert.equal(result.status,status);assert.deepEqual(result.reason,verdict(status).reason);assert.equal(result.version,null,'never invent a bundle version');
});
test('DT7 no total bundle and no assessor remains unknown, never guessed not-installed',async t=>{const dir=await profile(t);const read=createInstallationStatusReader({client:'hanamesh',core:()=>core(declaration()),profileState:async()=>'absent',otherProfileDir:dir});t.after(()=>read.close());const result=(await read()).observations.find(r=>r.scope.id==='other-runtime');assert.equal(result.status,'unknown');assert.equal(result.reason.code,'CORE_LEGACY_ASSESSOR_MISSING')});
test('DT7 current runtime forwards the Core legacy verdict instead of bundle completeness',async()=>{
 const value={...declaration(),bundleVersion:null,completeness:'unknown',legacy:verdict('installed')};const provider=core(value);const read=createInstallationStatusReader({core:()=>provider,profileState:async()=>'absent'});try{const result=(await read()).observations[0];assert.equal(result.status,'installed');assert.equal(result.reason.code,'CORE_LEGACY_COMPONENTS_INSTALLED');assert.equal(result.version,null)}finally{read.close()}
});
test('DT7 incomplete/invalid verdict and service replacement never become a guessed success',async t=>{
 const dir=await profile(t);
 for(const change of [false,true]){
  let provider={...core(declaration()),assessLegacyInstallation:async()=>{if(change)provider={...provider};return change?verdict('installed'):{status:'installed',components:[],issues:[],reason:null}}};
  const read=createInstallationStatusReader({client:'hanamesh',core:()=>provider,profileState:async()=>'absent',otherProfileDir:dir});t.after(()=>read.close());
  const result=(await read()).observations.find(r=>r.scope.id==='other-runtime');assert.equal(result.status,'unknown');
 }
});
test('DT7 current legacy unknown keeps Core startup blocked codes for bounded follow-up',async()=>{
 const value={...declaration(),bundleVersion:null,completeness:'unknown',legacy:verdict('unknown'),blocked:[{code:'CORE_SUITE_CLIENT_PEER_NOT_CONNECTED'}]};const provider=core(value),read=createInstallationStatusReader({core:()=>provider,profileState:async()=>'absent'});
 try{assert.ok((await read()).observations[0].blocked.some(r=>r.code==='CORE_SUITE_CLIENT_PEER_NOT_CONNECTED'))}finally{read.close()}
});

test('DT8 A01 unexported metadata with broken entries is installed damaged, never absent',async t=>{
 const dir=await profile(t);
 for(const [i,name] of names.entries())await writeFile(join(dir,'node_modules',name,'package.json'),JSON.stringify({name,version:versions[i],exports:{'.':'./missing-entry.js'}}));
 const {readLegacyProfileFacts}=await import('../src/library/installation-profile.js');
 const collected=await readLegacyProfileFacts(dir,JSON.parse(await (await import('node:fs/promises')).readFile(join(dir,'package.json'),'utf8')));
 assert.deepEqual(collected.components.map(c=>c.observation.kind),names.map(()=>'damaged'));
 let calls=0;
 const provider={...core(declaration()),assessLegacyInstallation:async facts=>{
  calls++;assert.deepEqual(facts.components.map(c=>c.observation.kind),names.map(()=>'damaged'));
  assert.deepEqual(facts.components.map(c=>c.observation.version),versions);
  return verdict('incomplete');
 }};
 const read=createInstallationStatusReader({client:'hanamesh',core:()=>provider,profileState:async()=>'absent',otherProfileDir:dir});t.after(()=>read.close());
 const result=(await read()).observations.find(r=>r.scope.id==='other-runtime');assert.equal(calls,1);assert.equal(result.status,'incomplete');
});
test('DT8 C02 collector preserves a corrupt peer as explicit unknown',async t=>{
 const dir=await profile(t);await writeFile(join(dir,'node_modules','external','package.json'),'{');
 const {readLegacyProfileFacts}=await import('../src/library/installation-profile.js');
 const facts=await readLegacyProfileFacts(dir,JSON.parse(await (await import('node:fs/promises')).readFile(join(dir,'package.json'),'utf8')));
 assert.ok(facts.components.every(c=>c.peers.external==='unknown'));
});

test('DT8 A01 hidden metadata resolves without executing healthy entries; existing roots with lost metadata stay unreadable',async t=>{
 const dir=await profile(t),fs=await import('node:fs/promises'),{readLegacyProfileFacts}=await import('../src/library/installation-profile.js');
 const manifest=JSON.parse(await fs.readFile(join(dir,'package.json'),'utf8'));
 for(const [i,name]of names.entries())await writeFile(join(dir,'node_modules',name,'package.json'),JSON.stringify({name,version:versions[i],exports:{'.':'./index.js'}}));
 assert.ok((await readLegacyProfileFacts(dir,manifest)).components.every(c=>c.observation.kind==='present'));
 await rm(join(dir,'node_modules',names[0],'package.json'));
 assert.equal((await readLegacyProfileFacts(dir,manifest)).components[0].observation.kind,'unreadable');
 for(const name of names)await rm(join(dir,'node_modules',name),{recursive:true});
 assert.ok((await readLegacyProfileFacts(dir,manifest)).components.every(c=>c.observation.kind==='missing'));
});

for(const [label,content,expectedPeer,status]of [
 ['compatible',JSON.stringify({name:'external',version:'1.2.3'}),'1.2.3','installed'],
 ['incompatible',JSON.stringify({name:'external',version:'0.9.0'}),'0.9.0','incomplete'],
 ['unreadable','{','unknown','unknown'],
])test(`DT9 pnpm hidden metadata preserves ${label} physical peer facts`,async t=>{
 const dir=await profile(t),manifest=JSON.parse(await readFile(join(dir,'package.json'),'utf8'));
 await rm(join(dir,'node_modules'),{recursive:true});
 for(const [i,name]of names.entries()){
  const physical=join(dir,'node_modules/.pnpm',`member${i}`,'node_modules',name);
  await mkdir(physical,{recursive:true});
  await writeFile(join(physical,'package.json'),JSON.stringify({name,version:versions[i],exports:{'.':'./index.js'},peerDependencies:i===0?{external:'^1.0.0'}:{}}));
  await writeFile(join(physical,'index.js'),'throw new Error("plugin code must not execute")');
  await mkdir(join(dir,'node_modules/@hanamesh'),{recursive:true});
  await symlink(physical,join(dir,'node_modules',name),'dir');
 }
 const peer=join(dir,'node_modules/.pnpm/member0/node_modules/external');
 await mkdir(peer,{recursive:true});await writeFile(join(peer,'package.json'),content);
 const resolver=createRequire(pathToFileURL(join(dir,'package.json')));
 const physicalResolver=createRequire(resolver.resolve(names[0]));
 if(label==='unreadable')assert.throws(()=>physicalResolver.resolve('external/package.json'),{code:'ERR_INVALID_PACKAGE_CONFIG'});
 else assert.equal(physicalResolver.resolve('external/package.json'),await realpath(join(peer,'package.json')),'Node resolves the peer from the physical member binding');
 const {readLegacyProfileFacts}=await import('../src/library/installation-profile.js');
 const facts=await readLegacyProfileFacts(dir,manifest);
 assert.ok(facts.components.every(c=>c.observation.kind==='present'));
 assert.deepEqual(facts.components.map(c=>c.observation.version),versions);
 assert.equal(facts.components[0].peers.external,expectedPeer,'hidden metadata must retain the physical peer observation');
 let calls=0;
 const provider={...core(declaration()),assessLegacyInstallation:async observed=>{
  calls++;assert.equal(observed.components[0].peers.external,expectedPeer);
  return verdict(status);
 }};
 const read=createInstallationStatusReader({client:'hanamesh',core:()=>provider,profileState:async()=>'absent',otherProfileDir:dir});t.after(()=>read.close());
 const result=(await read()).observations.find(r=>r.scope.id==='other-runtime');
 assert.equal(calls,1);assert.equal(result.status,status);assert.deepEqual(result.reason,verdict(status).reason);
});

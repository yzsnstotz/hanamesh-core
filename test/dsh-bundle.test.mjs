import {win32} from 'node:path';
const tarBinary=process.platform==='win32'?win32.join(process.env.SystemRoot??process.env.SYSTEMROOT??process.env.WINDIR,'System32','tar.exe'):'/usr/bin/tar';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSuiteInstallRelease} from '../lib/suite/index.js';
import {mergeBundles,readBundle,components,parseArguments,buildHanaMesh} from '../packages/hanamesh/build.mjs';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const sources=()=>components.map(([role,name],i)=>({pkg:{name,version:`1.0.${i}`,peerDependencies:{'@deepseek-ai/cordis':'^4.0.4',react:'^18.3.1',...(i<2?{zod:'^4.5.4'}:{})}},patch:[{insert:[{id:role,name,config:{ownedBy:role}}]}]}));
test('bundle locks exact identities, merges only DSH peers and keeps the original entries and configuration',()=>{
 const input=sources(),result=mergeBundles('0.1.0',input);assert.deepEqual(result.manifest.hanameshSuiteInstall,createSuiteInstallRelease('0.1.0'));assert.deepEqual(result.manifest.dependencies,Object.fromEntries(input.map(r=>[r.pkg.name,r.pkg.version])));assert.deepEqual(result.manifest.peerDependencies,{'@deepseek-ai/cordis':'^4.0.4'});assert.equal(Object.hasOwn(result.manifest,'exports'),false);assert.deepEqual(result.patch,input.flatMap(r=>r.patch));assert.equal(result.manifest.dsh.bundle.patch,'./cordis.patch.yml');result.patch[0].insert[0].config.ownedBy='changed';assert.equal(input[0].patch[0].insert[0].config.ownedBy,'core');
});
test('bundle refuses duplicate entries, unsupported patches, relative entrypoints, ranges and differing peers',()=>{
 for(const change of [s=>s[1].patch[0].insert[0].id='core',s=>s[0].patch=[{id:'core',disabled:true}],s=>s[0].patch[0].insert[0].name='./private.js',s=>s[0].pkg.version='^1.0.0',s=>s[1].pkg.peerDependencies['@deepseek-ai/cordis']='^5.0.0']){const input=sources();change(input);assert.throws(()=>mergeBundles('0.1.0',input));}
});
test('normal archive reader binds identity/version and public bundle metadata before merging',async t=>{
 const root=await mkdtemp(join(tmpdir(),'hm-bundle-'));t.after(()=>rm(root,{recursive:true,force:true}));const directory=join(root,'package');await mkdir(directory);await writeFile(join(directory,'package.json'),JSON.stringify({name:'@hanamesh/core',version:'1.0.0',dsh:{bundle:{patch:'./patch.yml'}}}));await writeFile(join(directory,'patch.yml'),'- insert:\n  - id: core\n    name: "@hanamesh/core"\n');const file=join(root,'core.tgz');execFileSync(tarBinary,['-czf',file,'-C',root,'package']);assert.equal((await readBundle(file,'@hanamesh/core','1.0.0')).patch[0].insert[0].id,'core');await assert.rejects(readBundle(file,'@hanamesh/usage','1.0.0'),/SOURCE_IDENTITY_MISMATCH/);await assert.rejects(readBundle(file,'@hanamesh/core','1.0.1'),/SOURCE_IDENTITY_MISMATCH/);
});

test('PK4 bundle contains the four exact providers and preserves the stricter reviewed theme peer',()=>{
 assert.deepEqual(components.map(row=>row[1]),['@hanamesh/core','@hanamesh/usage','@hanamesh/dsh-app-host','@hanamesh/theme']);
 const input=sources(),wide='>=4.0.4 <4.2.0-0 || >=4.0.5-alpha.1 <4.2.0-0',narrow='>=4.1.0 <4.2.0-0';
 for(const row of input)row.pkg.peerDependencies['@deepseek-ai/cordis']=wide;
 input[3].pkg.peerDependencies['@deepseek-ai/cordis']=narrow;
 input[3].pkg.peerDependencies['@deepseek-ai/dsh-client-ui-theme']='>=0.2.2-rc.1 <0.3.0-0';
 const result=mergeBundles('0.1.5',input);
 assert.equal(result.manifest.peerDependencies['@deepseek-ai/cordis'],narrow);
 assert.equal(result.manifest.dependencies['@hanamesh/theme'],'1.0.3');
 assert.equal(result.patch.length,4);
 input.reverse();assert.throws(()=>mergeBundles('0.1.5',input),/SOURCE_ORDER/);
});

test('PK4 command accepts a required exact theme version and rejects missing theme at build input',async()=>{
 const input=parseArguments(['--version','0.1.5','--core','0.3.34','--usage','0.3.0-rc.19','--app-host','0.6.25','--theme','0.1.0','--output','/new/output']);
 assert.equal(input.theme,'0.1.0');
 const missing={...input};delete missing.theme;
 await assert.rejects(buildHanaMesh(missing),/RELEASE_INPUT_REQUIRES_EXACT_VERSIONS/);
 await assert.rejects(buildHanaMesh({...input,theme:'^0.1.0'}),/RELEASE_INPUT_REQUIRES_EXACT_VERSIONS/);
 assert.throws(()=>parseArguments(['--theme','0.1.0','--theme','0.1.1']),/USAGE/);
});
test('PK4 nested peers cannot widen an earlier narrower declaration',()=>{
 const input=sources();
 input[0].pkg.peerDependencies['@deepseek-ai/cordis']='>=4.1.0 <4.2.0-0';
 for(const row of input.slice(1))row.pkg.peerDependencies['@deepseek-ai/cordis']='>=4.0.4 <4.2.0-0';
 assert.equal(mergeBundles('0.1.5',input).manifest.peerDependencies['@deepseek-ai/cordis'],'>=4.1.0 <4.2.0-0');
 input[3].pkg.peerDependencies['@deepseek-ai/cordis']='>=4.1.5 <4.3.0-0';
 assert.throws(()=>mergeBundles('0.1.5',input),/PEER_DECLARATIONS_DIFFER/);
});

test('PK4 normal bundle generation rejects a stale Core repair release before producing a distribution',async t=>{
 const root=await mkdtemp(join(tmpdir(),'hm-bundle-release-'));t.after(()=>rm(root,{recursive:true,force:true}));const files=new Map();
 for(const [i,row] of sources().entries()){
  const dir=join(root,String(i));await mkdir(join(dir,'package'),{recursive:true});
  const pkg={...row.pkg,dsh:{bundle:{patch:'./patch.yml'}},...(i===0?{hanameshSuiteInstall:createSuiteInstallRelease('0.1.4')}:{})};
  await writeFile(join(dir,'package/package.json'),JSON.stringify(pkg));await writeFile(join(dir,'package/patch.yml'),JSON.stringify(row.patch));
  const file=join(root,i+'.tgz');execFileSync(tarBinary,['-czf',file,'-C',dir,'package']);files.set(pkg.name,file);
 }
 const input={version:'0.1.5',core:'1.0.0',usage:'1.0.1',appHost:'1.0.2',theme:'1.0.3',outputDir:join(root,'output')};
 await assert.rejects(buildHanaMesh(input,async name=>files.get(name)),/CORE_RELEASE_PIN_MISMATCH/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeBundles,readBundle,components} from '../packages/hanamesh/build.mjs';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const sources=()=>components.map(([role,name],i)=>({pkg:{name,version:`1.0.${i}`,peerDependencies:{'@deepseek-ai/cordis':'^4.0.4',react:'^18.3.1',...(i<2?{zod:'^4.5.4'}:{})}},patch:[{insert:[{id:role,name,config:{ownedBy:role}}]}]}));
test('bundle locks exact identities, merges all peers and keeps the original entries and configuration',()=>{
 const input=sources(),result=mergeBundles('0.1.0',input);assert.deepEqual(result.manifest.dependencies,Object.fromEntries(input.map(r=>[r.pkg.name,r.pkg.version])));assert.equal(result.manifest.peerDependencies.zod,'^4.5.4');assert.equal(result.manifest.peerDependencies.react,'^18.3.1');assert.deepEqual(result.patch,input.flatMap(r=>r.patch));assert.equal(result.manifest.dsh.bundle.patch,'./cordis.patch.yml');result.patch[0].insert[0].config.ownedBy='changed';assert.equal(input[0].patch[0].insert[0].config.ownedBy,'core');
});
test('bundle refuses duplicate entries, unsupported patches, relative entrypoints, ranges and differing peers',()=>{
 for(const change of [s=>s[1].patch[0].insert[0].id='core',s=>s[0].patch=[{id:'core',disabled:true}],s=>s[0].patch[0].insert[0].name='./private.js',s=>s[0].pkg.version='^1.0.0',s=>s[1].pkg.peerDependencies.zod='^5.0.0']){const input=sources();change(input);assert.throws(()=>mergeBundles('0.1.0',input));}
});
test('normal archive reader binds identity/version and public bundle metadata before merging',async t=>{
 const root=await mkdtemp(join(tmpdir(),'hm-bundle-'));t.after(()=>rm(root,{recursive:true,force:true}));const directory=join(root,'package');await mkdir(directory);await writeFile(join(directory,'package.json'),JSON.stringify({name:'@hanamesh/core',version:'1.0.0',dsh:{bundle:{patch:'./patch.yml'}}}));await writeFile(join(directory,'patch.yml'),'- insert:\n  - id: core\n    name: "@hanamesh/core"\n');const file=join(root,'core.tgz');execFileSync('tar',['-czf',file,'-C',root,'package']);assert.equal((await readBundle(file,'@hanamesh/core','1.0.0')).patch[0].insert[0].id,'core');await assert.rejects(readBundle(file,'@hanamesh/usage','1.0.0'),/SOURCE_IDENTITY_MISMATCH/);await assert.rejects(readBundle(file,'@hanamesh/core','1.0.1'),/SOURCE_IDENTITY_MISMATCH/);
});

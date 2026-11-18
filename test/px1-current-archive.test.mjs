import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,copyFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {spawn} from 'node:child_process';

for(const manifest of [{name:'@hanamesh/core',version:'0.3.38'},{name:'@fixture/renamed-core',version:'0.4.0-rc.7'}]){
 test(`PX1 normal pack finds the actual npm archive for ${manifest.name}@${manifest.version}`,async t=>{
  const root=await mkdtemp(join(tmpdir(),'cl5-px1-pack-'));
  const state=state=>writeFile(join(root,'.run-state.json'),JSON.stringify({state,by:'CL5',why:'PX1 archive-name regression fixture',updatedAt:new Date().toISOString()})+'\n');
  await state('active');t.after(async()=>{await state('done');await rm(root,{recursive:true});});
  const repo=join(root,'repo'),scripts=join(repo,'scripts/px1'),theme=join(repo,'packages/hanamesh-theme');
  await mkdir(scripts,{recursive:true});await mkdir(theme,{recursive:true});
  await copyFile('scripts/px1/run.mjs',join(scripts,'run.mjs'));
  await copyFile('scripts/px1/theme-fixture-registry.mjs',join(scripts,'theme-fixture-registry.mjs'));
  // Helpers added by the implementation remain part of the real runner input.
  const {readdir}=await import('node:fs/promises');
  for(const file of await readdir('scripts/px1'))if(file.endsWith('.mjs')&&!['run.mjs','theme-fixture-registry.mjs','native-case.mjs'].includes(file))await copyFile(join('scripts/px1',file),join(scripts,file));
  await writeFile(join(repo,'package.json'),JSON.stringify({...manifest,files:['index.js']}));await writeFile(join(repo,'index.js'),'export const fixture=true;\n');
  await writeFile(join(theme,'package.json'),JSON.stringify({name:'@hanamesh/theme',version:'0.1.0',files:['index.js']}));await writeFile(join(theme,'index.js'),'export const fixture=true;\n');
  const env={PATH:[dirname(process.execPath),process.env.PATH].join(process.platform==='win32'?';':':'),PX1_ROLE:'core',RUNNER_TEMP:join(root,'runner'),SystemRoot:process.env.SystemRoot};
  const child=spawn(process.execPath,[join(scripts,'run.mjs'),'pack'],{cwd:repo,env,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',s=>output+=s);child.stderr.on('data',s=>output+=s);
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)});
  assert.equal(code,0,output);
  const filename=manifest.name.replace(/^@/,'').replaceAll('/','-')+'-'+manifest.version+'.tgz';
  const archive=join(root,'runner/px1-core/artifacts',filename);assert((await stat(archive)).size>0);
  const receipt=JSON.parse(await readFile(join(root,'runner/px1-core/evidence/pack.json'),'utf8'));assert.equal(receipt.status,'PASS');
  assert.doesNotMatch(output,/ENOENT|BASELINE_ONLY_LOCAL_PACK_FAILED/);
 });
}

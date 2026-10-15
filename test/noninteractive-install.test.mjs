import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {resolvePinnedPnpm,runProcessGroup} from './support/pnpm-process.mjs';

test('Core reinstalls modules from a different store without CI or a TTY',{skip:process.platform==='win32'},async t=>{
 const root=await mkdtemp(join(tmpdir(),'hm-core-install-'));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const name of['home','dsh-home','dependency'])await mkdir(join(root,name));
 // Validate the tool before writing a packageManager field that could trigger an ambient pnpm self-install.
 const pnpm=await resolvePinnedPnpm({root});
 await writeFile(join(root,'package.json'),JSON.stringify({name:'core-install-probe',private:true,packageManager:'pnpm@10.33.0',dependencies:{'local-probe':'file:./dependency'}}));
 await writeFile(join(root,'dependency/package.json'),JSON.stringify({name:'local-probe',version:'1.0.0',main:'index.js'}));
 await writeFile(join(root,'dependency/index.js'),'module.exports = 42;\n');
 await writeFile(join(root,'pnpm-workspace.yaml'),await readFile(new URL('../pnpm-workspace.yaml',import.meta.url),'utf8'));
 const env={...pnpm.env,DSH_HOME:join(root,'dsh-home')};
 const install=(store,frozen=false)=>runProcessGroup(process.execPath,[pnpm.path,'--config.manage-package-manager-versions=false','install','--offline','--store-dir',join(root,store),...(frozen?['--frozen-lockfile']:[])],{cwd:root,env,timeoutMs:30000});
 for(const [store,frozen] of [['store-a',false],['store-b',true]]){
  const result=await install(store,frozen);assert.equal(result.timedOut,false);assert.equal(result.status,0,result.stdout+result.stderr);assert.equal(result.groupCleaned,true);assert.doesNotMatch(result.stdout+result.stderr,/ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY/);
 }
 const value=await runProcessGroup(process.execPath,['-e','process.stdout.write(String(require("local-probe")))'],{cwd:root,env,timeoutMs:5000});assert.equal(value.status,0,value.stderr);assert.equal(value.stdout,'42');
});

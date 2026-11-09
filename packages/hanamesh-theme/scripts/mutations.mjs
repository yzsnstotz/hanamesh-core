import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const mutations=[
 ['tokens-pair',s=>s.replace("dark = light","dark = undefined")],
 ['dispose-layer',s=>s.replace("ctx.theme.overrideTokens('@hanamesh/theme', tokens)","(ctx.theme.overrideTokens('@hanamesh/theme', tokens), () => {})")],
 ['api-guard',s=>s.replace("typeof ctx.theme?.overrideTokens !== 'function'","false")],
];
for(const [id,mutate] of mutations){
 const root=await mkdtemp(join(tmpdir(),'hm-theme-mutation-'));
 try{
  for(const dir of ['src','test','lib'])await cp(new URL('../'+dir,import.meta.url),join(root,dir),{recursive:true});
  await writeFile(join(root,'package.json'),'{"type":"module"}');
  const file=join(root,'src/client.js'),before=await readFile(file,'utf8'),after=mutate(before);
  assert.notEqual(after,before,'MUTATION_NOT_APPLIED '+id);await writeFile(file,after);
  const result=spawnSync(process.execPath,['--test','--test-reporter=tap','test/theme.test.mjs'],{cwd:root,encoding:'utf8'});
  assert.notEqual(result.status,0,'MUTATION_SURVIVED '+id);
  assert.match(result.stdout,/not ok /,'MUTATION_NO_ASSERTION_FAILURE '+id);
  assert.match(result.stdout,/ERR_ASSERTION/,'MUTATION_FAILED_WITHOUT_ASSERTION '+id);
  console.log(JSON.stringify({id,detected:true,exitCode:result.status}));
 }finally{await rm(root,{recursive:true,force:true});}
}

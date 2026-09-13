import {mkdtemp,cp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';import {join,resolve} from 'node:path';import {tmpdir} from 'node:os';import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const evidence=resolve('docs/acceptance/mutations');await mkdir(evidence,{recursive:true});
const production=await readFile('lib/controller.js','utf8');const digest=s=>createHash('sha256').update(s).digest('hex');
const mutants=[
  {name:'remove-local-guard',apply:s=>s.replace(/        if \(this\.#state\.status !== 'signed_in'\)[\s\S]*?\/\/ MUTATION: local-guard/, '        // local guard removed by test-only mutation')},
  {name:'accept-resource-403',apply:s=>s.replace(/if \(response\.status === 403\)\s*throw responseError\(403\); \/\/ MUTATION: resource-denial/,"if (response.status === 403) return Object.freeze({status:200,data:null}); // broken denial mapping")},
];
const run=(lib)=>spawnSync(process.execPath,['--test','--test-reporter=tap','test/controller.test.mjs','test/edges.test.mjs'],{env:{...process.env,HM_TEST_LIB:lib},encoding:'utf8',timeout:20000});
const baseline=run(resolve('lib'));const base=(baseline.stdout||'')+(baseline.stderr||'');await writeFile(join(evidence,'baseline.tap'),base);assert.equal(baseline.status,0,base);assert.match(base,/# tests 39/);
for(const mutant of mutants){
  const root=await mkdtemp(join(tmpdir(),'hm-identity-mutation-'));
  try{
    const lib=join(root,'lib');await cp('lib',lib,{recursive:true});await writeFile(join(root,'package.json'),'{"type":"module"}');
    const mutated=mutant.apply(production);assert.notEqual(mutated,production,'mutation must apply');await writeFile(join(lib,'controller.js'),mutated);
    const result=run(lib);const output=(result.stdout||'')+(result.stderr||'');await writeFile(join(evidence,mutant.name+'.tap'),output);
    assert.notEqual(result.status,0,'mutant must fail');assert.match(output,/ERR_ASSERTION/);assert.match(output,/not ok/);assert.doesNotMatch(output,/ERR_MODULE_NOT_FOUND|SyntaxError/);
    console.log(JSON.stringify({mutant:mutant.name,evidence:'CONTRACT_FIXTURE',baselineExit:baseline.status,mutantExit:result.status,assertionFailure:true,productionSha256:digest(production),mutantSha256:digest(mutated)}));
  }finally{await rm(root,{recursive:true,force:true});}
}
assert.equal(await readFile('lib/controller.js','utf8'),production,'production copy untouched');

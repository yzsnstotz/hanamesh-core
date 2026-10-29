import {runMutations} from '@hanamesh/devkit';
import {mutationConfig,cases,validateMutationEvidence} from '../devkit.mutations.mjs';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
delete process.env.HM_TEST_LIB;delete process.env.HM_ADAPTER_EVIDENCE;
const results=[];await mkdir(mutationConfig.evidenceDir,{recursive:true});
for(const item of cases){
 const evidenceDir=join(mutationConfig.evidenceDir,item.id);let row={id:item.id};
 try{
  const receipts=await runMutations({...mutationConfig,cases:[item],baselineTests:[...new Set(['test/device.test.mjs','test/adapter.test.mjs',...(item.tests??[item.test])])],evidenceDir});
  const baseline=await readFile(join(evidenceDir,'baseline.tap'),'utf8'),mutant=await readFile(join(evidenceDir,item.id+'.tap'),'utf8');
  const count=key=>{const values=[...baseline.matchAll(new RegExp('^# '+key+' ([0-9]+)$','gm'))];assert.equal(values.length,1);return Number(values[0][1]);};
  assert.ok(count('tests')>0);assert.equal(count('fail'),0);assert.equal(count('skipped'),0);assert.equal(count('cancelled'),0);
  assert.doesNotMatch(baseline+mutant,/ERR_MODULE_NOT_FOUND|SyntaxError|called recursively|recursive call/);assert.match(mutant,/ERR_ASSERTION/);
  row={...receipts[0],status:'PASS',baselineTests:count('tests'),evidenceDir};
 }catch(error){row={...row,status:'FAIL',error:String(error),evidenceDir};}
 try{await copyFile(join(evidenceDir,item.id+'.tap'),join(mutationConfig.evidenceDir,item.id+'.tap'));}catch(error){if(error.code!=='ENOENT')throw error;}
 results.push(row);await writeFile(join(mutationConfig.evidenceDir,'results.json'),JSON.stringify({expected:cases.length,results},null,2)+String.fromCharCode(10));console.log(JSON.stringify(row));
}
let evidenceError=null;try{await validateMutationEvidence();}catch(error){evidenceError=String(error);}
await writeFile(join(mutationConfig.evidenceDir,'results.json'),JSON.stringify({expected:cases.length,results,evidenceError},null,2)+String.fromCharCode(10));
assert.equal(results.length,cases.length);assert.equal(results.filter(x=>x.status!=='PASS').length,0,'every mutation must have a passing baseline and actual assertion kill');assert.equal(evidenceError,null);

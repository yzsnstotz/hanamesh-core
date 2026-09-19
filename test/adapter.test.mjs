import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {writeFile,mkdir} from 'node:fs/promises';
test('DSH adapter registration and disposal contract fixture (not real DSH)',async()=>{
  const env={...process.env};delete env.NODE_TEST_CONTEXT;delete env.NODE_TEST_WORKER_ID;
  const args=['--experimental-loader','./test/fixtures/host-loader.mjs','--test','--test-reporter=tap','test/fixtures/adapter-check.test.mjs'];
  const result=spawnSync(process.execPath,args,{encoding:'utf8',env,timeout:10000});
  const output=(result.stdout||'')+(result.stderr||'');
  if(process.env.HM_ADAPTER_EVIDENCE){await mkdir('docs/acceptance',{recursive:true});await writeFile(process.env.HM_ADAPTER_EVIDENCE,output);}
  assert.match(output,/# tests 3/);assert.equal(result.status,0,output);
});

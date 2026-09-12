import test from 'node:test';import assert from 'node:assert/strict';
import {fork,spawnSync} from 'node:child_process';import {mkdtemp,rm,mkdir,cp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {publishFile,read} from './fixtures/atomic-store.mjs';
import {INITIAL_OBSERVATION,IdentityController,config} from './fixtures/support.mjs';
const childEnv={...process.env};delete childEnv.NODE_TEST_CONTEXT;delete childEnv.NODE_TEST_WORKER_ID;
const evidence=resolve(process.env.HM_CRASH_EVIDENCE||'docs/acceptance/crash');await mkdir(evidence,{recursive:true});
async function terminateAtCheckpoint(directory,scenario,mutation,lib) {
  return new Promise((yes,no)=>{
    const child=fork(resolve('test/fixtures/crash-child.mjs'),[directory,scenario,mutation],{env:{...childEnv,HM_TEST_LIB:lib||resolve('lib')},stdio:['ignore','pipe','pipe','ipc']});
    let message,errorText='';const timeout=setTimeout(()=>{child.kill('SIGKILL');no(new Error('Timed out waiting for crash checkpoint'));},10000);
    child.stderr.on('data',b=>{errorText+=b.toString();});
    child.once('error',e=>{clearTimeout(timeout);no(e);});
    child.on('message',m=>{if(message)return;message=m;child.kill('SIGKILL');});
    child.once('exit',(code,signal)=>{clearTimeout(timeout);if(!message||signal!=='SIGKILL')no(new Error(`Unexpected child termination ${code}/${signal}: ${errorText}`));else yes({...message,signal,exit:code});});
  });
}
for(const point of ['before-rename','after-rename'])test('X02 fixture: real SIGKILL '+point,async()=>{
  const d=await mkdtemp(join(tmpdir(),'hm-identity-group-'));
  try{
    await publishFile(join(d,'local.json'),INITIAL_OBSERVATION);
    const killed=await terminateAtCheckpoint(d,'group-'+point,'baseline');
    const stored=await read(join(d,'local.json'));
    const expected=point==='before-rename'?INITIAL_OBSERVATION:{schemaVersion:1,revision:1,status:'expired',observedAt:'2026-09-13T00:00:00.000Z',logoutPending:true};
    assert.deepEqual(stored,expected); // Complete previous or complete next state, never a mixed record.
    await writeFile(join(evidence,'group-'+point+'.json'),JSON.stringify({evidence:'REAL_PROCESS_FIXTURE_MEDIUM',killed,stored,assertion:'complete-image'},null,2)+'\n');
  }finally{await rm(d,{recursive:true,force:true});}
});
for(const scenario of ['login','logout'])test('X03 fixture: SIGKILL '+scenario+' baseline and reversed order',async()=>{
  for(const mode of ['baseline','reverse']){
    const d=await mkdtemp(join(tmpdir(),'hm-identity-boundary-'));
    try{
      await publishFile(join(d,'local.json'),INITIAL_OBSERVATION);await publishFile(join(d,'remote-fixture.json'),{active:false,revoked:false});
      let lib=resolve('lib');
      if(mode==='reverse'){
        lib=join(d,'lib');await cp(resolve('lib'),lib,{recursive:true});await writeFile(join(d,'package.json'),'{"type":"module"}');
        const p=join(lib,'controller.js');let s=await readFile(p,'utf8');
        const marker=scenario==='login'?"const result = await this.#transport.auth('login'":"const hadCredential = this.#transport.hasCredentials();";
        assert.ok(s.includes(marker));
        const injected=scenario==='login'?"await this.#publish(generation, 'signed_in', null, true, null);\n":"this.#logoutPending = false; await this.#publish(generation, 'expired', null, true, 'SIGNED_OUT');\n";
        s=s.replace(marker,injected+marker);await writeFile(p,s);
      }
      const killed=await terminateAtCheckpoint(d,scenario,mode,lib);
      const local=await read(join(d,'local.json')),remote=await read(join(d,'remote-fixture.json'));
      const checked=spawnSync(process.execPath,['--test','--test-reporter=tap','test/fixtures/order-check.test.mjs'],{env:{...childEnv,HM_CRASH_DIR:d,HM_CRASH_SCENARIO:scenario},encoding:'utf8',timeout:10000});
      const output=(checked.stdout||'')+(checked.stderr||'');await writeFile(join(evidence,scenario+'-'+mode+'.tap'),output);
      assert.match(output,/# tests 1/,'checker must actually execute one assertion test');
      if(mode==='baseline')assert.equal(checked.status,0,output);
      else{assert.notEqual(checked.status,0);assert.match(output,/ERR_ASSERTION/);assert.match(output,/not ok/);assert.doesNotMatch(output,/ERR_MODULE_NOT_FOUND|SyntaxError/);}
      // Fresh controller reconstructs only an expired breadcrumb, never permission.
      const restarted=new IdentityController(config,{read:()=>local,publish:async()=>{},close:async()=>{}},async()=>{throw Error('not called');});
      assert.notEqual(restarted.getState().status,'signed_in');assert.equal(restarted.getState().principal,null);await restarted.dispose();
      await writeFile(join(evidence,scenario+'-'+mode+'.json'),JSON.stringify({evidence:'REAL_PROCESS_FIXTURE_MEDIA',killed,local,remote,checker:{exit:checked.status,assertionFailure:/ERR_ASSERTION/.test(output)},restarted:'not-authenticated'},null,2)+'\n');
    }finally{await rm(d,{recursive:true,force:true});}
  }
});

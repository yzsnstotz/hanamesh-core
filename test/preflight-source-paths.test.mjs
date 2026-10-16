import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
test('preflight uses only code-root defaults and explicitly supplied source probes',async()=>{
 const child=spawn(process.execPath,[new URL('./support/preflight-source-paths-probe.mjs',import.meta.url).pathname],{env:process.env,detached:true,stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);
 try{const code=await new Promise((yes,no)=>{child.once('error',no);child.once('close',yes);});assert.equal(code,0,err);assert.match(out,/PREFLIGHT_EXPLICIT_SOURCE_PATHS_PASS/u);}finally{if(child.pid)try{process.kill(-child.pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')throw e;}}
});

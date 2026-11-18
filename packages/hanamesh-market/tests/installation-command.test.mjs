import test from 'node:test';import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';import{join}from'node:path';
import{scratch,waitForFixtureFile}from'./helpers.mjs';
import{runOfficialInstallationCommand}from'../src/library/installation-cli.js';
// Interpret test scripts with the pinned Node executable: fresh shebang executables have OS launch latency unrelated to the reader budget.
async function setup(t,code){const root=await scratch('installation-command-test-');t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(join(root,'profile'));const script=join(root,'official-cli.mjs');await writeFile(script,code);return{root,reader:{executable:process.execPath,home:root,configDir:join(root,'profile'),pluginName:'hanamesh',marketplace:'registered-suite',marketplaceUrl:'https://market.example/plugins.git',timeoutMs:2000,maxOutputBytes:20000}}}
const invoke=(reader,signal)=>runOfficialInstallationCommand({channel:'codex',reader,args:[join(reader.home,'official-cli.mjs'),'plugin','list','--json','--disable','remote_plugin'],signal});
async function residue(path){try{const names=await readdir(path);return JSON.stringify({total:names.length,first:names.slice(0,10)})}catch(error){return JSON.stringify({code:error.code})}}
test('official child receives only named read arguments and a credential-free explicitly scoped environment',async t=>{
 const{reader}=await setup(t,`console.log(JSON.stringify({args:process.argv.slice(2),env:process.env,cwd:process.cwd()}))`);
 const previous=process.env.HANAMESH_TEST_SECRET;process.env.HANAMESH_TEST_SECRET='never-inherit';t.after(()=>{if(previous===undefined)delete process.env.HANAMESH_TEST_SECRET;else process.env.HANAMESH_TEST_SECRET=previous});
 const value=JSON.parse(await invoke(reader));assert.deepEqual(value.args,['plugin','list','--json','--disable','remote_plugin']);assert.equal(value.env.HANAMESH_TEST_SECRET,undefined);assert.equal(value.env.HOME,reader.home);assert.equal(value.env.CODEX_HOME,reader.configDir);assert.equal(value.env.GIT_CONFIG_VALUE_0,'');assert.notEqual(value.cwd,reader.home);await assert.rejects(readFile(join(value.cwd,'anything')),{code:'ENOENT'});
});
for(const [name,code,patch,expected]of [['stderr',`process.stderr.write('secret private path');console.log('{}')`,{},'AGENT_READER_DIAGNOSTIC'],['nonzero',`process.exit(1)`,{},'AGENT_READER_FAILED'],['overflow',`process.stdout.write('x'.repeat(10000));setInterval(()=>{},1000)`,{maxOutputBytes:100},'AGENT_READER_OUTPUT_LIMIT'],['timeout',`setInterval(()=>{},1000)`,{timeoutMs:60},'AGENT_READER_TIMEOUT']])test(`official reader ${name} is named unknown material, never parsed as absence`,async t=>{const{reader}=await setup(t,code);await assert.rejects(invoke({...reader,...patch}),e=>{assert.equal(e.code,expected);assert.doesNotMatch(e.message,/secret|private path/);return true})});
test('a missing configured profile is not initialized or interpreted as an empty inventory',async t=>{const{root,reader}=await setup(t,'console.log("[]")');const configDir=join(root,'missing-profile');await assert.rejects(invoke({...reader,configDir}),{code:'AGENT_PROFILE_UNAVAILABLE'});await assert.rejects(readFile(configDir),{code:'ENOENT'})});
test('automatic manager environment carries only named path variables and rejects credential keys',async t=>{
 const {root,reader}=await setup(t,'console.log(JSON.stringify({volta:process.env.VOLTA_HOME,secret:process.env.API_KEY}))');
 const value=JSON.parse(await invoke({...reader,runtimeEnv:{VOLTA_HOME:root}}));assert.deepEqual(value,{volta:root});
 await assert.rejects(invoke({...reader,runtimeEnv:{API_KEY:'never-inherit'}}),{code:'AGENT_READER_DISCOVERY_INVALID'});
});
test('cancellation kills the exact owned read process and rejects without output',async t=>{
 const root=await scratch('installation-cancel-test-');t.after(()=>rm(root,{recursive:true,force:true}));const record=join(root,'pid');
 const{reader}=await setup(t,`(await import('node:fs')).writeFileSync(${JSON.stringify(record)},String(process.pid));setInterval(()=>{},1000)`);
 const controller=new AbortController();const pending=invoke(reader,controller.signal);pending.catch(()=>{});t.after(()=>controller.abort());
 const pid=Number(await waitForFixtureFile(record,{timeoutMs:reader.timeoutMs}));
 assert.ok(pid);controller.abort();await assert.rejects(pending,{code:'INSTALLATION_STATUS_CANCELLED'});assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});
});
test('reader supervisor retains group ownership after CLI leader exits, so the budget closes inherited pipes',async t=>{
 const root=await scratch('installation-exited-leader-');t.after(()=>rm(root,{recursive:true,force:true}));const record=join(root,'children.json');
 const{reader}=await setup(t,`const {spawn}=await import('node:child_process');const fs=await import('node:fs');const child=spawn(process.execPath,['-e',"process.stdout.on('error',error=>{if(error.code!=='EPIPE')throw error});process.stdout.write('held',error=>process.send({ready:!error}));setInterval(()=>{},1000)"],{detached:process.platform==='win32',windowsHide:true,stdio:['ignore','inherit','inherit','ipc']});child.once('message',value=>{if(value.ready!==true)process.exit(2);fs.writeFileSync(${JSON.stringify(record)},JSON.stringify({leader:process.pid,child:child.pid}));child.disconnect();process.exit(0)});`);
 const pending=invoke({...reader,timeoutMs:1500});const outcome=pending.then(()=>({code:'unexpected-success'}),e=>({code:e.code}));let child;
 try{
  for(let i=0;i<200;i++){try{child=JSON.parse(await readFile(record,'utf8'));break}catch{await new Promise(r=>setTimeout(r,5))}}assert.ok(child?.child,'the CLI leader actually spawned its pipe-holding child');
  // Probe liveness now, report it after the outcome: a supervisor that releases the group at leader exit also reaps
  // this descendant within milliseconds, and that early reaping is the cancellation defect, not a separate precondition.
  let alive=true;try{process.kill(child.child,0)}catch{alive=false}
  const result=await Promise.race([outcome,new Promise(r=>setTimeout(()=>r({code:'SUPERVISOR_DID_NOT_SETTLE'}),3000))]);
  assert.equal(result.code,'AGENT_READER_TIMEOUT','an exited CLI leader must not defeat group cancellation');
  assert.ok(alive,'the ready descendant is alive before its reader budget expires');
  for(let i=0;i<100;i++){try{process.kill(child.child,0);await new Promise(r=>setTimeout(r,5))}catch{child=undefined;break}}assert.equal(child,undefined,'the exact owned pipe-holding child is gone');
 }finally{if(child?.child){try{process.kill(child.child,'SIGKILL')}catch{}}await outcome}
});
test('a completed official command forwards every bounded JSON byte before its anchor exits',async t=>{const{reader}=await setup(t,`process.stdout.write(JSON.stringify({value:'x'.repeat(1024*1024)}))`);const text=await invoke({...reader,timeoutMs:5000,maxOutputBytes:2*1024*1024});assert.equal(JSON.parse(text).value.length,1024*1024,'complete official output is drained before group cleanup')});
test('parent death disconnects the live anchor and reaps its exact command group',async t=>{
 const{spawn}=await import('node:child_process');const root=await scratch('installation-parent-death-');const record=join(root,'owned.json');let observed,caller,createdCwd,diagnostic='';
 const{reader}=await setup(t,`const fs=await import('node:fs');fs.writeFileSync(${JSON.stringify(record)},JSON.stringify({command:process.pid,anchor:process.ppid,cwd:process.cwd()}));setInterval(()=>{},1000)`);
 const entry=join(root,'caller.mjs');await writeFile(entry,`import{runOfficialInstallationCommand}from ${JSON.stringify(new URL('../src/library/installation-cli.js',import.meta.url).href)};await runOfficialInstallationCommand({channel:'codex',reader:${JSON.stringify({...reader,timeoutMs:8000})},args:[${JSON.stringify(join(reader.home,'official-cli.mjs'))},'plugin','list','--json']});`);
 try{caller=spawn(process.execPath,[entry],{env:{PATH:'/usr/bin:/bin',HOME:root},stdio:['ignore','ignore','pipe']});caller.stderr.on('data',chunk=>{diagnostic=(diagnostic+chunk).slice(-2000)});
  for(let i=0;i<200;i++){try{observed=JSON.parse(await readFile(record,'utf8'));break}catch{await new Promise(r=>setTimeout(r,5))}}assert.ok(observed?.anchor,'the live owned anchor started its command: '+diagnostic);createdCwd=observed.cwd;
  const exited=new Promise(r=>caller.once('exit',r));caller.kill('SIGKILL');await exited;
  for(let i=0;i<200;i++){try{process.kill(observed.command,0);await new Promise(r=>setTimeout(r,5))}catch{observed=undefined;break}}
  assert.equal(observed,undefined,'parent IPC disconnect must reap only its owned read group');
  let exists=true;for(let i=0;i<200;i++){try{await readFile(createdCwd)}catch(e){if(e.code==='ENOENT'){exists=false;break}if(e.code!=='EISDIR')throw e}await new Promise(r=>setTimeout(r,5))}
  assert.equal(exists,false,'parent IPC disconnect must remove its owned neutral directory'+(exists?' '+await residue(createdCwd):''));
 }finally{if(caller?.exitCode===null&&caller?.signalCode===null)caller.kill('SIGKILL');if(observed){try{process.kill(observed.anchor,'SIGTERM')}catch{}}if(createdCwd)await rm(createdCwd,{recursive:true,force:true});await rm(root,{recursive:true,force:true})}
});
test('parent death stops active directory writers before removing their neutral cwd',async t=>{
 const{spawn}=await import('node:child_process');const root=await scratch('installation-active-writer-');const record=join(root,'owned.json'),script=join(root,'writer.mjs'),entry=join(root,'caller.mjs');let observed,caller;
 await mkdir(join(root,'profile'));
 await writeFile(script,`import fs from'node:fs';fs.writeFileSync(${JSON.stringify(record)},JSON.stringify({command:process.pid,anchor:process.ppid,cwd:process.cwd()}));let n=0;function write(){for(let i=0;i<40;i++)fs.mkdirSync('writer-'+n++);setImmediate(write)}write();`);
 const reader={executable:process.execPath,home:root,configDir:join(root,'profile'),pluginName:'hanamesh',marketplace:'registered-suite',marketplaceUrl:'https://market.example/plugins.git',timeoutMs:8000,maxOutputBytes:20000};
 await writeFile(entry,`import{runOfficialInstallationCommand}from ${JSON.stringify(new URL('../src/library/installation-cli.js',import.meta.url).href)};await runOfficialInstallationCommand({channel:'codex',reader:${JSON.stringify(reader)},args:[${JSON.stringify(script)}]});`);
 try{caller=spawn(process.execPath,[entry],{env:{PATH:'/usr/bin:/bin',HOME:root},stdio:'ignore'});
  for(let i=0;i<200;i++){try{observed=JSON.parse(await readFile(record,'utf8'));break}catch{await new Promise(r=>setTimeout(r,5))}}assert.ok(observed?.command,'owned writer started');
  await new Promise(r=>setTimeout(r,80));const exited=new Promise(r=>caller.once('exit',r));caller.kill('SIGKILL');await exited;
  let alive=true;for(let i=0;i<200;i++){try{process.kill(observed.command,0);await new Promise(r=>setTimeout(r,5))}catch{alive=false;break}}assert.equal(alive,false,'active writer is terminated');
  // Wait on the directory's disappearance, independently of the command's earlier exit.
  let exists=true;for(let i=0;i<200;i++){try{await readFile(observed.cwd);await new Promise(r=>setTimeout(r,5))}catch(e){if(e.code==='ENOENT'){exists=false;break}if(e.code==='EISDIR')await new Promise(r=>setTimeout(r,5));else throw e}}
  assert.equal(exists,false,'all writers must stop before the surviving owner removes the neutral cwd'+(exists?' '+await residue(observed.cwd):''));
 }finally{if(caller?.exitCode===null&&caller?.signalCode===null)caller.kill('SIGKILL');if(observed){try{process.kill(observed.anchor,'SIGTERM')}catch{}await rm(observed.cwd,{recursive:true,force:true})}await rm(root,{recursive:true,force:true})}
});

test('R115 infrastructure PATH and XDG directories survive the supervisor without credential inheritance',async t=>{
 const {root,reader}=await setup(t,'console.log(JSON.stringify({path:process.env.PATH,config:process.env.XDG_CONFIG_HOME,data:process.env.XDG_DATA_HOME,cache:process.env.XDG_CACHE_HOME,state:process.env.XDG_STATE_HOME,temporary:process.env.TMPDIR}))');
 const {delimiter}=await import('node:path'),manager=join(root,'manager-bin');
 const runtimeEnv={PATH:[manager,'/usr/bin','/bin'].join(delimiter),XDG_CONFIG_HOME:join(root,'custom-config'),XDG_DATA_HOME:join(root,'custom-data'),XDG_CACHE_HOME:join(root,'custom-cache'),XDG_STATE_HOME:join(root,'custom-state')};
 const value=JSON.parse(await invoke({...reader,runtimeEnv}));assert.ok(value.path.split(delimiter).includes(manager),'selected manager remains resolvable');
 for(const [field,key]of [['config','XDG_CONFIG_HOME'],['data','XDG_DATA_HOME'],['cache','XDG_CACHE_HOME'],['state','XDG_STATE_HOME']])assert.equal(value[field],runtimeEnv[key],'user XDG value must survive');
 const defaults=JSON.parse(await invoke(reader));for(const field of ['config','data','cache','state'])assert.equal(defaults[field],undefined,'unset XDG must retain OS defaults');assert.notEqual(value.temporary,root,'owned temporary cwd remains separate');
});

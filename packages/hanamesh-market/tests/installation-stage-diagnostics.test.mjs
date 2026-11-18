import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {scratch} from './helpers.mjs';
import {runOfficialInstallationCommand} from '../src/library/installation-cli.js';
import {createInstallationStatusReader} from '../src/library/installation-status.js';
import {INSTALLATION_READ_BUDGET} from '../src/library/installation-discovery.js';

async function fixture(t,code){
 const root=await scratch('dt11-stage-');t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(join(root,'profile'));const script=join(root,'official.mjs');await writeFile(script,code);
 return{script,reader:{executable:process.execPath,home:root,configDir:join(root,'profile'),pluginName:'hanamesh',marketplace:'hanamesh',marketplaceUrl:'https://github.com/yzsnstotz/hanamesh-plugins',...INSTALLATION_READ_BUDGET}};
}
function timings(d){
 assert.ok(d,'DT11 command diagnostic retained');
 for(const name of ['workerStartup','anchorStartup','cli','cleanup','total'])assert.ok(Number.isFinite(d.timingsMs[name])&&d.timingsMs[name]>0,`DT11 ${name} elapsed is measured`);
 assert.ok(d.timingsMs.total>=Object.values(d.timingsMs).slice(0,4).reduce((a,b)=>a+b,0)-1,'DT11 phase durations fit the whole read');
}
for(const channel of ['claude','codex'])for(const stage of ['version','plugin-list','marketplace-list'])test(`DT11 ${channel} ${stage} stderr retains safe phase and byte diagnostics`,async t=>{
 const secret='/Users/private-owner/API_KEY=never-record-秘密';
 const {reader,script}=await fixture(t,`process.stderr.write(${JSON.stringify(secret)});console.log('{}');`);
 await assert.rejects(runOfficialInstallationCommand({channel,reader,args:[script],stage}),error=>{
  assert.equal(error.code,'AGENT_READER_DIAGNOSTIC');const d=error.details.command;timings(d);
  assert.equal(d.stage,stage,'DT11 identifies the failed official command');assert.equal(d.failurePhase,'cli');assert.equal(d.exitCode,0);assert.equal(d.signal,null);
  assert.equal(d.stderrBytes,Buffer.byteLength(secret),'DT11 counts bytes without retaining stderr');assert.equal(d.stderrCode,'STDERR_PRESENT');assert.equal(d.timedOut,false);
  assert.doesNotMatch(JSON.stringify(error),/private-owner|never-record|秘密|executable|configDir|runtimeEnv/);return true;
 });
});
test('DT11 marketplace timeout identifies CLI execution and retains its elapsed time',async t=>{
 const {reader,script}=await fixture(t,`process.stderr.write('bounded warning');setInterval(()=>{},1000);`);
 await assert.rejects(runOfficialInstallationCommand({channel:'codex',reader,args:[script],stage:'marketplace-list'}),error=>{
  assert.equal(error.code,'AGENT_READER_TIMEOUT');const d=error.details.command;timings(d);
  assert.equal(d.stage,'marketplace-list');assert.equal(d.failurePhase,'cli','DT11 timeout phase');assert.equal(d.timedOut,true);assert.equal(d.exitCode,null);assert.equal(d.signal,null);
  assert.equal(d.stderrBytes,15);assert.equal(d.stderrCode,'STDERR_PRESENT');assert.ok(d.timingsMs.cli>1000,'DT11 timeout preserves actual CLI elapsed');return true;
 });
 assert.equal(INSTALLATION_READ_BUDGET.timeoutMs,2000,'DT11 does not relax production timeout');
});
test('DT11 nonzero exit retains status and empty stderr category',async t=>{
 const {reader,script}=await fixture(t,'process.exit(17)');
 await assert.rejects(runOfficialInstallationCommand({channel:'claude',reader,args:[script],stage:'version'}),error=>{
  const d=error.details.command;timings(d);assert.equal(d.exitCode,17);assert.equal(d.failurePhase,'cli');assert.equal(d.stderrBytes,0);assert.equal(d.stderrCode,'STDERR_EMPTY');return true;
 });
});
test('DT11 trusted host logs exact command diagnostics while the public observation keeps fixed reasons',async t=>{
 const {reader,script}=await fixture(t,`if(process.argv.includes('--version'))console.log('codex-cli 0.167.0');else if(process.argv.includes('marketplace')){process.stderr.write('/private/secret API_KEY=do-not-log');console.log('{}')}else console.log('{"installed":[],"available":[]}');`);
 const logs=[],stages=[];
 const read=createInstallationStatusReader({logger:{warn:(...args)=>logs.push(args)},profileState:async({channel})=>channel==='codex'?'present':'absent',discoverReader:async()=>reader,
  runCommand:q=>{stages.push(q.stage);return runOfficialInstallationCommand({...q,args:[script,...q.args]})}});
 t.after(()=>read.close());const result=await read();const row=result.observations.find(r=>r.channel==='codex'&&r.scope.id==='agent-cli');
 assert.equal(row.status,'unknown');assert.equal(row.reason.code,'AGENT_READER_DIAGNOSTIC');assert.deepEqual(stages,['version','plugin-list','marketplace-list']);
 assert.equal(logs.length,1,'DT11 failed read reaches trusted logger');assert.equal(logs[0][0],'APPHOST_INSTALLATION_COMMAND_DIAGNOSTIC %s');
 const d=JSON.parse(logs[0][1]);assert.equal(d.channel,'codex');assert.equal(d.stage,'marketplace-list');assert.equal(d.code,'AGENT_READER_DIAGNOSTIC');timings(d);
 assert.doesNotMatch(JSON.stringify(logs),/\/private|do-not-log|API_KEY|official\.mjs/);
 assert.doesNotMatch(JSON.stringify(result),/timingsMs|stderrBytes|failurePhase|\/private|do-not-log/,'DT11 host diagnostics never enter Web response');
});
test('DT11 diagnostic projection drops arbitrary details and logger failure preserves the reason',async()=>{
 const {installationCommandDiagnostic}=await import('../src/library/installation-cli.js');
 const d=installationCommandDiagnostic({stage:'version',failurePhase:'/secret',stderrBytes:4,stderrCode:'secret',signal:'/secret',exitCode:'secret',timingsMs:{cli:3,total:NaN},stderr:'/secret',env:{API_KEY:'secret'}});
 assert.equal(d.failurePhase,null);assert.equal(d.signal,null);assert.equal(d.exitCode,null);assert.equal(d.stderrCode,'STDERR_PRESENT');assert.equal(d.timingsMs.total,null);assert.doesNotMatch(JSON.stringify(d),/secret|API_KEY/);
 assert.equal(installationCommandDiagnostic({stage:'/secret'}),null);
 const read=createInstallationStatusReader({logger:{warn:()=>{throw new Error('/secret')}},profileState:async()=>'present',discoverReader:async()=>({executable:process.execPath,home:import.meta.dirname,configDir:import.meta.dirname,pluginName:'hanamesh',marketplace:'hanamesh',marketplaceUrl:'https://github.com/yzsnstotz/hanamesh-plugins',...INSTALLATION_READ_BUDGET}),runCommand:async()=>{throw Object.assign(new Error('/secret'),{code:'AGENT_READER_DIAGNOSTIC',details:{command:d,stderr:'/secret'}})}});
 try{const result=await read();assert.equal(result.observations.find(r=>r.channel==='claude').reason.code,'AGENT_READER_DIAGNOSTIC');assert.doesNotMatch(JSON.stringify(result),/secret/)}finally{read.close()}
});

test('DT11 a timeout before worker readiness does not invent CLI execution',{skip:process.platform==='win32'?'Windows queues an IPC abort until worker readiness':false},async t=>{
 const {reader,script}=await fixture(t,'console.log("{}")');
 await assert.rejects(runOfficialInstallationCommand({channel:'codex',reader:{...reader,timeoutMs:1},args:[script],stage:'version'}),error=>{
  assert.equal(error.code,'AGENT_READER_TIMEOUT');const d=error.details.command;assert.ok(d,'DT11 command diagnostic retained');assert.equal(d.stage,'version');assert.equal(d.failurePhase,'worker-startup');
  assert.equal(d.timingsMs.cli,null);assert.equal(d.timingsMs.anchorStartup,null);assert.ok(d.timingsMs.workerStartup>0);assert.equal(d.timedOut,true);return true;
 });
});

test('DT11 an observed CLI signal is retained independently of the supervisor exit',{skip:process.platform==='win32'?'POSIX self-termination signal observation':false},async t=>{
 const {reader,script}=await fixture(t,"process.kill(process.pid,'SIGTERM')");
 await assert.rejects(runOfficialInstallationCommand({channel:'claude',reader,args:[script],stage:'plugin-list'}),error=>{
  assert.equal(error.code,'AGENT_READER_FAILED');const d=error.details.command;timings(d);assert.equal(d.exitCode,null);assert.equal(d.signal,'SIGTERM');assert.equal(d.workerExitCode,0);assert.equal(d.workerSignal,null);return true;
 });
});

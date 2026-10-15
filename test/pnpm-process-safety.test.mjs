import test from 'node:test';import assert from 'node:assert/strict';import{mkdtemp,mkdir,writeFile,readFile,rm}from'node:fs/promises';import{join,dirname}from'node:path';import{fileURLToPath}from'node:url';import{tmpdir}from'node:os';
import{resolvePinnedPnpm,runProcessGroup}from'./support/pnpm-process.mjs';
async function isolated(t,{cleanup=true}={}){const root=await mkdtemp(join(tmpdir(),'hm-core-process-safe-'));if(cleanup)t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(join(root,'home'));return root;}
test('a lower version pnpm on PATH fails before executing it or invoking any install',async t=>{
 const root=await isolated(t),bin=join(root,'bin');await mkdir(bin);const marker=join(root,'unexpected-execution');
 await writeFile(join(bin,'pnpm'),'#!/bin/sh\necho invoked >> "'+marker+'"\necho 10.23.0\n',{mode:0o700});
 await assert.rejects(resolvePinnedPnpm({env:{PATH:bin+':'+dirname(process.execPath)+':/usr/bin:/bin'},root}),/PNPM_PATH_MISMATCH/);
 await assert.rejects(resolvePinnedPnpm({env:{PATH:bin+':'+dirname(process.execPath)+':/usr/bin:/bin',npm_execpath:join(bin,'pnpm')},root}),/PNPM_PATH_MISMATCH/);
 const full=await runProcessGroup(process.execPath,['--test','--test-reporter=tap',fileURLToPath(new URL('./noninteractive-install.test.mjs',import.meta.url))],{cwd:root,env:{PATH:bin+':'+dirname(process.execPath)+':/usr/bin:/bin',HOME:join(root,'home'),TMPDIR:root,npm_execpath:join(bin,'pnpm')},timeoutMs:5000});
 assert.equal(full.status,1);assert.match(full.stdout+full.stderr,/PNPM_PATH_MISMATCH/);assert.equal(full.groupCleaned,true);
 await assert.rejects(readFile(marker),{code:'ENOENT'});
});
test('the package manager executable is pinned to the current Node installation',async t=>{
 const root=await isolated(t),pin=await resolvePinnedPnpm({env:{PATH:dirname(process.execPath)+':/usr/bin:/bin'},root});assert.equal(pin.version,'10.33.0');assert.ok(pin.path.startsWith(dirname(process.execPath)+'/../')||pin.path.includes('/lib/node_modules/pnpm/'));
});
for(const outcome of['timeout','parent-exit'])test('whole child process group is reaped after '+outcome,{skip:process.platform==='win32'},async t=>{
 const root=await isolated(t),pidfile=join(root,'grandchild.pid');
 const grandchild="require('node:fs').writeFileSync(process.argv[1],String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000)";
 const code="const {spawn}=require('node:child_process');spawn(process.execPath,['-e',"+JSON.stringify(grandchild)+",process.argv[1]],{stdio:'ignore'});"+(outcome==='timeout'?"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)":"setTimeout(()=>process.exit(0),250)");
 const result=await runProcessGroup(process.execPath,['-e',code,pidfile],{cwd:root,env:{PATH:dirname(process.execPath)+':/usr/bin:/bin',HOME:join(root,'home')},timeoutMs:outcome==='timeout'?500:5000,graceMs:100});
 assert.equal(result.timedOut,outcome==='timeout');assert.equal(result.groupCleaned,true);
 const pid=Number(await readFile(pidfile,'utf8'));assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});
});

for(const outcome of ['exit','interrupt'])test('outer runner '+outcome+' also reaps its detached owned children',{skip:process.platform==='win32'},async t=>{
 const root=await isolated(t),pidfile=join(root,'owned.pid'),helper=new URL('./support/pnpm-process.mjs',import.meta.url).href;
 const child="require('node:fs').writeFileSync(process.argv[1],String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000)";
 const driver="import{runProcessGroup}from "+JSON.stringify(helper)+";void runProcessGroup(process.execPath,['-e',"+JSON.stringify(child)+",process.argv[1]],{cwd:process.cwd(),env:{},timeoutMs:10000,graceMs:100});"+(outcome==='exit'?"setTimeout(()=>process.exit(0),300);":"");
 const result=await runProcessGroup(process.execPath,['--input-type=module','-e',driver,pidfile],{cwd:root,env:{PATH:dirname(process.execPath)+':/usr/bin:/bin'},timeoutMs:outcome==='interrupt'?500:5000,graceMs:1000});
 assert.equal(result.timedOut,outcome==='interrupt');assert.equal(result.groupCleaned,true);
 const pid=Number(await readFile(pidfile,'utf8'));assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});
});

test('repeated termination waits for every concurrently owned group',{skip:process.platform==='win32'},async t=>{
 const root=await isolated(t,{cleanup:false}),files=[join(root,'slow.pid'),join(root,'fast.pid')],helper=new URL('./support/pnpm-process.mjs',import.meta.url).href;
 t.after(async()=>{try{for(const f of files)try{const pid=Number(await readFile(f,'utf8'));try{process.kill(-pid,'SIGKILL')}catch{}}catch{}}finally{await rm(root,{recursive:true,force:true});}});
 const slow="require('node:fs').writeFileSync(process.argv[1],String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000)",fast="require('node:fs').writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)";
 const driver="import{runProcessGroup}from "+JSON.stringify(helper)+";void runProcessGroup(process.execPath,['-e',"+JSON.stringify(slow)+",process.argv[1]],{cwd:process.cwd(),env:{},timeoutMs:10000,graceMs:500});void runProcessGroup(process.execPath,['-e',"+JSON.stringify(fast)+",process.argv[2]],{cwd:process.cwd(),env:{},timeoutMs:10000,graceMs:100});setTimeout(()=>{process.kill(process.pid,'SIGTERM');setTimeout(()=>process.kill(process.pid,'SIGTERM'),30)},300);";
 const result=await runProcessGroup(process.execPath,['--input-type=module','-e',driver,...files],{cwd:root,env:{PATH:dirname(process.execPath)+':/usr/bin:/bin'},timeoutMs:5000});assert.equal(result.timedOut,false);
 for(const file of files){const pid=Number(await readFile(file,'utf8'));assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});}
});

import test from 'node:test';import assert from 'node:assert/strict';
import {mkdir,writeFile,chmod,symlink,readFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';import {join,dirname} from 'node:path';import {spawnSync} from 'node:child_process';
import {scratch} from './helpers.mjs';
import {readLoginEnvironment,discoverOfficialReader} from '../src/library/installation-discovery.js';
import {runOfficialInstallationCommand} from '../src/library/installation-cli.js';
const binaries={asdf:{path:process.env.AH1_ASDF_BINARY,sha:'d9bbd3608115899dc79841bb60be956ebe4a118fd28f33444e0ab27fbdb736b5'},mise:{path:process.env.AH1_MISE_BINARY,sha:'21c269cd3c88e31c56aad7f7ccd9916b6fa78683937d93e5d17129b783d6f962'}};
const verified=new Map();
async function officialBinary(manager){if(!verified.has(manager))verified.set(manager,(async()=>{const b=binaries[manager];assert.equal(createHash('sha256').update(await readFile(b.path)).digest('hex'),b.sha,'official fixture binary digest');return b.path})());return verified.get(manager)}
const skip=manager=>process.platform!=='darwin'||process.arch!=='arm64'||!binaries[manager].path?'Set AH1_ASDF_BINARY / AH1_MISE_BINARY to the documented pinned darwin-arm64 test tools.':false;
async function home(t){const value=await scratch('r115-shell-manager-');t.after(()=>rm(value,{recursive:true,force:true}));return value}
async function executable(path,body){await mkdir(dirname(path),{recursive:true});await writeFile(path,body);await chmod(path,0o755)}
const leaf='#!/bin/sh\nif [ "$1" = "--version" ]; then printf "codex-cli 0.167.0\\n"; else printf "{\\"installed\\":[],\\"available\\":[]}\\n"; fi\n';

test('R115-P2-1 real non-TTY Bash stderr does not prevent framed PATH recovery and custom CLI discovery',{skip:process.platform==='win32'},async t=>{
 const h=await home(t),bin=join(h,'custom-cli-bin');await executable(join(bin,'codex'),leaf);
 await writeFile(join(h,'.bash_profile'),'export PATH="$HOME/custom-cli-bin:/usr/bin:/bin"\nprintf "normal login diagnostic\\n" >&2\n');
 const env={HOME:h,SHELL:'/bin/bash',PATH:'/usr/bin:/bin'};
 const direct=spawnSync('/bin/bash',['-ilc','printf "ready"'],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']});assert.equal(direct.status,0);assert.match(direct.stderr,/normal login diagnostic/);
 let restored;await assert.doesNotReject(async()=>{restored=(await readLoginEnvironment({home:h,env})).PATH},'normal Bash stderr must not block environment recovery');assert.ok(restored.split(':').includes(bin));
 const reader=await discoverOfficialReader({channel:'codex',home:h,env,systemBinDirs:[],applicationDirs:[]});assert.equal(reader.executable,join(bin,'codex'));
});

async function managerFixture(t,manager,{customXdg=false,gui=false}={}){
 const h=await home(t),binary=await officialBinary(manager),data=join(h,manager==='asdf'?'.asdf':'.local/share/mise'),bin=join(h,'manager-bin'),shims=join(data,'shims');
 await mkdir(join(h,'.codex'));await mkdir(shims,{recursive:true});await mkdir(bin);
 await symlink(binary,join(bin,manager));await executable(join(data,'installs',manager==='asdf'?'nodejs':'node','24.13.1','bin','codex'),leaf);
 const env={HOME:h,PATH:[shims,bin,'/usr/bin','/bin'].join(':')};
 if(manager==='asdf'){
  await mkdir(join(data,'plugins/nodejs'),{recursive:true});await writeFile(join(h,'.tool-versions'),'nodejs 24.13.1\n');
  // Exact official v0.20.2 shim template: requires the real asdf binary on PATH.
  await executable(join(shims,'codex'),'#!/usr/bin/env bash\n# asdf-plugin: nodejs 24.13.1\nexec asdf exec "codex" "$@"\n');
 }else{
  const config=join(h,customXdg?'custom-config':'.config');await mkdir(join(config,'mise'),{recursive:true});await writeFile(join(config,'mise/config.toml'),'[tools]\nnode = "24.13.1"\n');await symlink(join(bin,'mise'),join(shims,'codex'));
  if(customXdg)env.XDG_CONFIG_HOME=config;
 }
 const neutral=join(h,'neutral');await mkdir(neutral);
 const direct=spawnSync(join(shims,'codex'),['--version'],{env,cwd:neutral,encoding:'utf8',stdio:['ignore','pipe','pipe']});assert.equal(direct.status,0,'control: real manager resolves global selection in a neutral cwd');assert.equal(direct.stdout.trim(),'codex-cli 0.167.0');
 let discoveryEnv=env;
 if(gui){
  await writeFile(join(h,'.bash_profile'),`export PATH="$HOME/${manager==='asdf'?'.asdf':'.local/share/mise'}/shims:$HOME/manager-bin:/usr/bin:/bin"\n${customXdg?'export XDG_CONFIG_HOME="$HOME/custom-config"\n':''}`);
  discoveryEnv={HOME:h,SHELL:'/bin/bash',PATH:'/usr/bin:/bin'};
 }
 const reader=await discoverOfficialReader({channel:'codex',home:h,env:discoveryEnv,systemBinDirs:[],applicationDirs:[]});assert.equal(reader.executable,join(shims,'codex'),'same selected shim, no fallback to leaf');
 assert.equal((await runOfficialInstallationCommand({channel:'codex',reader,args:['--version']})).trim(),'codex-cli 0.167.0','selected real shim must execute');
 const list=await runOfficialInstallationCommand({channel:'codex',reader,args:['plugin','list','--json','--disable','remote_plugin']});assert.deepEqual(JSON.parse(list),{installed:[],available:[]});
}

test('R115-P2-2 real asdf shim retains manager PATH',{skip:skip('asdf')},async t=>managerFixture(t,'asdf'));
for(const customXdg of [false,true])test(`R115-P2-3 real mise shim retains ${customXdg?'explicit XDG_CONFIG_HOME':'default global config without an XDG override'}`,{skip:skip('mise')},async t=>managerFixture(t,'mise',{customXdg}));
test('R115 shell-defined PATH and XDG reach the same real mise shim in GUI discovery',{skip:skip('mise')},async t=>managerFixture(t,'mise',{customXdg:true,gui:true}));

test('R115 shell diagnostics never mask nonzero exits or missing framed output',{skip:process.platform==='win32'},async t=>{
 const h=await home(t),shell=join(h,'shell');
 await executable(shell,'#!/bin/sh\nprintf "normal stderr\\n" >&2\nexit 7\n');
 await assert.rejects(readLoginEnvironment({home:h,env:{SHELL:shell,PATH:'/usr/bin:/bin'}}),{code:'AGENT_READER_FAILED'});
 await executable(shell,'#!/bin/sh\nprintf "startup output without a marker\\n"\nprintf "normal stderr\\n" >&2\n');
 await assert.rejects(readLoginEnvironment({home:h,env:{SHELL:shell,PATH:'/usr/bin:/bin'}}),{code:'AGENT_SHELL_ENV_UNAVAILABLE'});
});

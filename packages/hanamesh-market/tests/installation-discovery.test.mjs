import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,chmod,rm,readFile,symlink} from 'node:fs/promises';
import {scratch} from './helpers.mjs';
import {join,dirname} from 'node:path';
const discovery=await import('../src/library/installation-discovery.js').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return{};throw e});
async function fixture(t){const home=await scratch('ah1-discovery-');t.after(()=>rm(home,{recursive:true,force:true}));return home}
async function executable(file,body='process.stdout.write("codex-cli 0.167.0")'){await mkdir(dirname(file),{recursive:true});await writeFile(file,`#!${process.execPath}\n${body}\n`);await chmod(file,0o755);return file}
const options=home=>({home,env:{HOME:home,PATH:''},systemBinDirs:[],applicationDirs:[],loginPath:async()=>''});
const layouts=[
 ['native','.local/bin'],['legacy Claude','.claude/local'],['legacy Claude npm','.claude/local/node_modules/.bin'],
 ['npm prefix','.npm-global/bin'],['npm alternate','.npm/bin'],['pnpm Linux','.local/share/pnpm'],['pnpm Linux bin','.local/share/pnpm/bin'],['pnpm macOS','Library/pnpm'],['pnpm macOS bin','Library/pnpm/bin'],['yarn','.yarn/bin'],['yarn config','.config/yarn/global/node_modules/.bin'],
 ['nvm','.nvm/versions/node/v24.13.1/bin'],['fnm Linux','.local/share/fnm/node-versions/v24.13.1/installation/bin'],['fnm macOS','Library/Application Support/fnm/node-versions/v24.13.1/installation/bin'],
 ['volta','.volta/bin'],['asdf','.asdf/shims'],['asdf version','.asdf/installs/nodejs/24.13.1/bin'],['mise','.local/share/mise/shims'],['mise version','.local/share/mise/installs/node/24.13.1/bin'],
 ['Windows npm','AppData/Roaming/npm'],['Windows pnpm','AppData/Local/pnpm'],['Windows Yarn','AppData/Local/Yarn/bin'],['Windows Codex standalone','AppData/Local/Programs/OpenAI/Codex/bin'],['Windows WinGet','AppData/Local/Microsoft/WinGet/Links'],['Windows fnm','AppData/Roaming/fnm/node-versions/v24.13.1/installation'],['Windows Volta','AppData/Local/Volta/bin'],
];
for(const [name,relative]of layouts)test(`AH1 layout ${name}`,async t=>{
 const home=await fixture(t),windows=name.startsWith('Windows'),channel=name.includes('Claude')?'claude':'codex';
 const file=await executable(join(home,relative,channel+(windows?'.exe':'')));
 assert.equal(typeof discovery.discoverOfficialReader,'function');
 const reader=await discovery.discoverOfficialReader({channel,...options(home),platform:windows?'win32':'linux'});
 assert.equal(reader.executable,file);assert.equal(reader.home,home);assert.equal(reader.configDir,join(home,channel==='claude'?'.claude':'.codex'));
});
for(const name of ['PATH','login shell','Homebrew arm64','Homebrew Intel','npm custom','pnpm custom','nvm custom','fnm custom','volta custom','asdf custom','mise custom','Codex custom installer'])test(`AH1 layout ${name}${process.platform==='win32'&&name==='login shell'?' (Windows ignores POSIX login shell)':''}`,async t=>{
 const extension=process.platform==='win32'?'.exe':'';
 const home=await fixture(t),bin=join(home,name==='Homebrew arm64'?'opt/homebrew/bin':name==='Homebrew Intel'?'usr/local/bin':'custom/bin'),file=await executable(join(bin,'codex'+extension)),o=options(home);
 if(name==='PATH')o.env.PATH=bin;
 else if(name==='login shell'){if(process.platform==='win32'){o.systemBinDirs=[bin];o.loginPath=async()=>assert.fail('Windows discovery must not invoke a POSIX login shell')}else o.loginPath=async()=>bin;}
 else if(name.startsWith('Homebrew'))o.systemBinDirs=[bin];
 else {const keys={'npm custom':'NPM_CONFIG_PREFIX','pnpm custom':'PNPM_HOME','nvm custom':'NVM_BIN','fnm custom':'FNM_MULTISHELL_PATH','volta custom':'VOLTA_HOME','asdf custom':'ASDF_DATA_DIR','mise custom':'MISE_DATA_DIR','Codex custom installer':'CODEX_INSTALL_DIR'};const key=keys[name];o.env[key]=(key==='VOLTA_HOME'||key==='NPM_CONFIG_PREFIX'&&process.platform!=='win32')?join(home,'custom'):bin;
 if(name==='asdf custom'){await executable(join(bin,'shims','codex'+extension));}if(name==='mise custom'){await executable(join(bin,'shims','codex'+extension));}}
 const reader=await discovery.discoverOfficialReader({channel:'codex',...o});
 assert.equal(reader.executable,['asdf custom','mise custom'].includes(name)?join(bin,'shims','codex'+extension):file);
});
test('AH1 deterministic priority, deduplication and absent CLI never initialize a profile',async t=>{
 const extension=process.platform==='win32'?'.exe':'';const home=await fixture(t),o=options(home),first=await executable(join(home,'first','codex'+extension));
 await executable(join(home,'.local/bin','codex'+extension));o.env.PATH=dirname(first);o.loginPath=async()=>join(home,'.local/bin');
 assert.equal((await discovery.discoverOfficialReader({channel:'codex',...o})).executable,first);
 await rm(first);await rm(join(home,'.local/bin','codex'+extension));
 await assert.rejects(discovery.discoverOfficialReader({channel:'codex',...o}),{code:'AGENT_READER_UNAVAILABLE'});
 await assert.rejects(readFile(join(home,'.codex')),{code:'ENOENT'});
});
test('AH1 Windows npm shims use fixed official JS entries without a command shell',async t=>{
 const home=await fixture(t),bin=join(home,'AppData/Roaming/npm');await executable(join(bin,'codex.cmd'));
 const entry=await executable(join(bin,'node_modules/@openai/codex/bin/codex.js'));
 const reader=await discovery.discoverOfficialReader({channel:'codex',...options(home),platform:'win32'});
 assert.equal(reader.executable,entry);assert.equal(reader.nodeScript,true);
});
for(const manager of ['pnpm','yarn'])test(`AH1 Windows ${manager} shim resolves its official global package`,async t=>{
 const home=await fixture(t),bin=join(home,'AppData/Local',manager==='yarn'?'Yarn/bin':'pnpm');await executable(join(bin,'codex.cmd'));
 const entry=await executable(join(home,'AppData/Local',manager==='yarn'?'Yarn/Data/global':'pnpm/global/5','node_modules/@openai/codex/bin/codex.js'));
 const reader=await discovery.discoverOfficialReader({channel:'codex',...options(home),platform:'win32'});assert.equal(reader.executable,entry);assert.equal(reader.nodeScript,true);
});
test('AH1 a broken selected npm shim never borrows a different manager installation',async t=>{
 const home=await fixture(t),o=options(home),bin=join(home,'AppData/Roaming/npm');await executable(join(bin,'codex.cmd'));
 await executable(join(home,'AppData/Local/Yarn/Data/global/node_modules/@openai/codex/bin/codex.js'));
 o.env.PATH=bin;await assert.rejects(discovery.discoverOfficialReader({channel:'codex',...o,platform:'win32'}),{code:'AGENT_READER_ENTRYPOINT_UNAVAILABLE'});
});
test('AH1 version-manager choice is newest Node SemVer, profiles honor existing environment, and symlinks work',async t=>{
 const extension=process.platform==='win32'?'.exe':'';const home=await fixture(t),o=options(home);await executable(join(home,'.nvm/versions/node/v18.0.0/bin','codex'+extension));
 const newest=await executable(join(home,'.nvm/versions/node/v24.13.1/bin','codex'+extension));
 o.env.CODEX_HOME=join(home,'selected-profile');assert.equal((await discovery.discoverOfficialReader({channel:'codex',...o})).executable,newest);
 const link=join(home,'linked');await mkdir(link);await symlink(newest,join(link,'codex'+extension));o.env.PATH=link;
 const reader=await discovery.discoverOfficialReader({channel:'codex',...o});assert.equal(reader.executable,join(link,'codex'+extension));assert.equal(reader.configDir,o.env.CODEX_HOME);
});
test('AH1 login PATH reads only framed PATH, strips inherited credentials, and times out without raw output',async t=>{
 const home=await fixture(t),shell=await executable(join(home,'shell'),`process.stdout.write('startup noise\\0HANAMESH_ENV\\0'+JSON.stringify({PATH:(await import('node:path')).join(process.env.HOME,'custom')})+'\\0');if(process.env.API_KEY)process.exit(2)`);
 const {runOfficialInstallationCommand}=await import('../src/library/installation-cli.js');
 // The controlled shell is JavaScript; interpret it with Node rather than relying on POSIX shebang execution.
 const runCommand=request=>{assert.equal(request.reader.executable,shell);assert.equal(request.args[0],'-ilc');return runOfficialInstallationCommand({...request,reader:{...request.reader,nodeScript:true}})};
 const value=(await discovery.readLoginEnvironment({home,env:{SHELL:shell,PATH:'/usr/bin:/bin',API_KEY:'never-inherit'},runCommand})).PATH;
 assert.equal(value,join(home,'custom'));
 await executable(shell,`setInterval(()=>{},1000)`);
 await assert.rejects(discovery.readLoginEnvironment({home,env:{SHELL:shell},timeoutMs:60,runCommand}),{code:'AGENT_READER_TIMEOUT'});
});

test('AH1 discovered CLI reads fresh newer inventories with real child processes in an isolated HOME',async t=>{
 const home=await fixture(t),bin=join(home,'.local/bin');
 for(const channel of ['claude','codex']){
  await mkdir(join(home,channel==='claude'?'.claude':'.codex'));
  const entry=process.platform==='win32'?join(bin,'node_modules',...(channel==='claude'?['@anthropic-ai','claude-code','cli.js']:['@openai','codex','bin','codex.js'])):join(bin,channel);
  if(process.platform==='win32')await executable(join(bin,channel+'.cmd'));
  await executable(entry,`const a=process.argv.slice(2);const channel=${JSON.stringify(channel)};const version=channel==='claude'?'2.1.319 (Claude Code)':'codex-cli 0.167.0';if(a[0]==='--version')console.log(version);else if(a.includes('marketplace'))console.log(channel==='claude'?'[]':'{"marketplaces":[]}');else console.log(channel==='claude'?'[]':'{"installed":[],"available":[]}');`);
 }
 const {createInstallationStatusReader}=await import('../src/library/installation-status.js');
 const read=createInstallationStatusReader({profileState:q=>discovery.agentProfileState({...q,home,env:options(home).env}),discoverReader:q=>discovery.discoverOfficialReader({...q,...options(home),platform:process.platform})});t.after(()=>read.close());
 const result=await read();
 for(const row of result.observations.filter(row=>row.scope.id==='agent-cli')){assert.equal(row.status,'not-installed');assert.deepEqual(row.identity,{pluginName:'hanamesh',marketplace:'hanamesh'});}
 assert.doesNotMatch(JSON.stringify(result),new RegExp(home));
});

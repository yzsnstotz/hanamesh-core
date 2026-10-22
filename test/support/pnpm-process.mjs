// Test-only process ownership. Never run a package manager selected by an unverified ambient PATH.
import {spawn,execFileSync} from 'node:child_process';
import {access,realpath,mkdir,writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,dirname,delimiter,isAbsolute} from 'node:path';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// macOS can return EPERM for a killed empty group or zombie-only group.
// Verify exact owned membership; never reinterpret a live/foreign/unknown permission denial.
function groupMembers(){return execFileSync('/bin/ps',['-axo','pid=,pgid=,uid=,stat='],{encoding:'utf8'}).trim().split('\n').map(line=>{const [pid,pgid,uid,state]=line.trim().split(/\s+/u);return {pid:Number(pid),pgid:Number(pgid),uid:Number(uid),state};});}
export function processGroupAlive(pid,{probe=(target,signal)=>process.kill(target,signal),members=groupMembers,uid=process.getuid(),platform=process.platform}={}){
 try{probe(-pid,0);return true;}catch(error){
  if(error.code==='ESRCH')return false;
  if(error.code==='EPERM'){
   const snapshot=members();
   if(!Array.isArray(snapshot)||snapshot.length===0||!snapshot.every(member=>[member.pid,member.pgid,member.uid].every(value=>Number.isSafeInteger(value)&&value>=0)&&typeof member.state==='string'&&member.state.length>0))throw error;
   const owned=snapshot.filter(member=>member.pgid===pid);
   if(members===groupMembers)process.stderr.write(JSON.stringify({event:'owned-group-native-eperm',pid,platform,inventoryCount:snapshot.length,members:owned})+'\n');
   if(platform==='darwin'&&owned.length===0)return false;
   if(owned.length>0&&owned.every(member=>member.uid===uid&&member.state?.startsWith('Z')))return false;
  }
  throw error;
 }
}
const groupAlive=processGroupAlive;
async function terminateGroup(pid,graceMs){
 if(process.platform==='win32')throw Error('POSIX_PROCESS_GROUP_REQUIRED');
 for(const signal of['SIGTERM','SIGKILL']){
  try{process.kill(-pid,signal);}catch(error){if(error.code==='ESRCH')return;if(error.code==='EPERM'&&!groupAlive(pid))return;throw error;}
  const until=Date.now()+graceMs;while(groupAlive(pid)&&Date.now()<until)await pause(10);
  if(!groupAlive(pid))return;
 }
 throw Error('CHILD_PROCESS_GROUP_CLEANUP_FAILED');
}
const ownedGroups=new Map();
const signals=['SIGINT','SIGTERM','SIGHUP'];
let shutdown=false,listening=false;
const exitCleanup=()=>{for(const pid of ownedGroups.keys())try{process.kill(-pid,'SIGKILL')}catch{}};
const handlers=new Map(signals.map(signal=>[signal,()=>{
 if(shutdown)return;
 shutdown=true;
 void Promise.allSettled([...ownedGroups].map(([pid,graceMs])=>terminateGroup(pid,graceMs))).then(()=>{
  // If a cleanup failed, still issue the final group kill before applying the caller's signal.
  exitCleanup();removeHandlers();process.kill(process.pid,signal);
 });
}]));
function removeHandlers(){process.removeListener('exit',exitCleanup);for(const [signal,handler]of handlers)process.removeListener(signal,handler);listening=false;}
function ownGroup(pid,graceMs){
 ownedGroups.set(pid,graceMs);
 if(!listening){process.once('exit',exitCleanup);for(const [signal,handler]of handlers)process.on(signal,handler);listening=true;}
}
function releaseGroup(pid){ownedGroups.delete(pid);if(!shutdown&&ownedGroups.size===0)removeHandlers();}
/** The group is terminated on normal exit too: a successful parent cannot leave its children running. */
export async function runProcessGroup(program,args,{cwd,env,timeoutMs=30000,graceMs=1000}={}){
 if(shutdown)throw Error('PROCESS_RUNNER_STOPPING');
 if(!isAbsolute(program))throw Error('ABSOLUTE_EXECUTABLE_REQUIRED');
 if(process.platform==='win32')throw Error('POSIX_PROCESS_GROUP_REQUIRED');
 const child=spawn(program,args,{cwd,env,detached:true,stdio:['ignore','pipe','pipe']});
 if(child.pid)ownGroup(child.pid,graceMs);
 let stdout='',stderr='',timedOut=false,overflow=false,timer,spawnError;
 const append=(current,chunk)=>{if(current.length+chunk.length>1024*1024){overflow=true;void terminateGroup(child.pid,graceMs).catch(()=>{});return current;}return current+chunk;};
 child.stdout.on('data',chunk=>{stdout=append(stdout,chunk)});child.stderr.on('data',chunk=>{stderr=append(stderr,chunk)});
 const exited=new Promise(resolve=>{child.once('exit',(code,signal)=>resolve({status:code,signal}));child.once('error',error=>{spawnError=error;resolve({status:null,signal:null})});});
 // Observe exit rather than close: orphan descendants may still hold the parent's pipes open.
 timer=setTimeout(()=>{timedOut=true;void terminateGroup(child.pid,graceMs).catch(()=>{});},timeoutMs);
 let result;try{result=await exited;}finally{clearTimeout(timer);try{if(child.pid)await terminateGroup(child.pid,graceMs);}finally{if(child.pid)releaseGroup(child.pid);child.stdout.destroy();child.stderr.destroy();}}
 if(spawnError)throw spawnError;
 return {...result,stdout,stderr,timedOut,overflow,groupCleaned:true};
}
export async function resolvePinnedPnpm({env=process.env,root}={}){
 if(process.versions.node!=='24.13.1')throw Error('PINNED_NODE_24_13_1_REQUIRED');
 const requested=join(dirname(process.execPath),'pnpm');
 if(!isAbsolute(requested))throw Error('PINNED_PNPM_REQUIRED');
 let pin;try{pin=await realpath(requested);}catch{throw Error('PINNED_PNPM_REQUIRED');}
 if(!/\.c?js$/u.test(pin))throw Error('PINNED_PNPM_JAVASCRIPT_REQUIRED');
 let fromPath;
 for(const dir of (env.PATH??'').split(delimiter).filter(Boolean)){
  const candidate=join(dir,'pnpm');try{await access(candidate,constants.X_OK);fromPath=await realpath(candidate);break;}catch{}
 }
 if(env.npm_execpath?.includes('pnpm')&&(await realpath(env.npm_execpath).catch(()=>null))!==pin)throw Error('PNPM_PATH_MISMATCH: inherited npm_execpath is not the pinned pnpm');
 if(fromPath!==pin)throw Error('PNPM_PATH_MISMATCH: use the pinned Node 24.13.1 pnpm, never the global shim');
 const neutral=join(root,'version-probe');await mkdir(neutral,{recursive:true});
 const npmrc=join(root,'user.npmrc');await writeFile(npmrc,'manage-package-manager-versions=false\npackage-manager-strict-version=true\n');
 const clean={PATH:dirname(process.execPath)+':/usr/bin:/bin',HOME:join(root,'home'),TMPDIR:root,NPM_CONFIG_USERCONFIG:npmrc,npm_config_manage_package_manager_versions:'false',COREPACK_ENABLE_AUTO_PIN:'0'};
 const version=await runProcessGroup(process.execPath,[pin,'--config.manage-package-manager-versions=false','--version'],{cwd:neutral,env:clean,timeoutMs:5000});
 if(version.status!==0||version.timedOut||version.stdout.trim()!=='10.33.0')throw Error('PINNED_PNPM_VERSION_MISMATCH');
 return {path:pin,version:'10.33.0',env:clean,npmrc};
}

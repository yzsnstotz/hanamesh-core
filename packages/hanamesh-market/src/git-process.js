// Module-owned process boundary. No user Git config or credential store is modified.
import {fork} from 'node:child_process';
import {openSync,readSync,closeSync,rmSync} from 'node:fs';
import {join,isAbsolute} from 'node:path';
const policy=Object.freeze({GIT_CONFIG_NOSYSTEM:'1',GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_COUNT:'2',
  GIT_CONFIG_KEY_0:'credential.helper',GIT_CONFIG_VALUE_0:'',
  GIT_CONFIG_KEY_1:'credential.helper',GIT_CONFIG_VALUE_1:'!gh auth git-credential'});
export function safeGitEnv(base=process.env){
 const env={...base};
 // Nested guards share ownership only within the same explicitly selected temp root.
 // A caller choosing a different scratch root starts an independent trace owner.
 if(!env.HM_GIT_GUARD_PARENT_ROOT&&base.TMPDIR===process.env.TMPDIR&&process.env.HM_GIT_GUARD_PARENT_ROOT){
  env.HM_GIT_GUARD_PARENT_ROOT=process.env.HM_GIT_GUARD_PARENT_ROOT;env.HM_GIT_GUARD_TMP_ROOT=process.env.HM_GIT_GUARD_TMP_ROOT;
 }
 for(const key of Object.keys(env))if(/^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+|PARAMETERS)$/.test(key)||/^GIT_TRACE/.test(key)||['GIT_ASKPASS','SSH_ASKPASS'].includes(key))delete env[key];
 return {...env,...policy,npm_config_manage_package_manager_versions:'false',pnpm_config_manage_package_manager_versions:'false'};
}
export function hasSafeGitEnv(env=process.env){return Object.entries(policy).every(([key,value])=>env[key]===value)&&!env.GIT_CONFIG_PARAMETERS;}
export function requireGuardedGitEnv(env=process.env){
 if(!hasSafeGitEnv(env)||!env.GIT_TRACE2_EVENT)throw Object.assign(new Error('Run this installation/check through node scripts/safe-git.mjs <command>.'),{code:'GIT_GUARD_REQUIRED'});
}
const forbidden=/(?:^|[\s/"'])git-credential-osxkeychain(?:$|[\s"'])|(?:^|[\s"'])credential-osxkeychain(?:$|[\s"'])/u;
/** Internal worker port: the parent and its IPC worker can independently remove this one fresh trace. */
export function observeGitTrace(directory){
 const trace=join(directory,'events.jsonl'),fd=openSync(trace,'r'),buffer=Buffer.alloc(64*1024);
 let failure,position=0,pending='',closed=false;
 return {check(final=false){
  if(failure)throw failure;
  let count;while((count=readSync(fd,buffer,0,buffer.length,position))>0){position+=count;pending+=buffer.toString('utf8',0,count);}
  const lines=pending.split('\n');pending=lines.pop();if(final&&pending)lines.push(pending);
  for(const line of lines){
   let event;try{event=JSON.parse(line);}catch{throw Object.assign(new Error('Invalid Git credential trace.'),{code:'GIT_TRACE_INVALID'});}
   if(['child_start','exec'].includes(event.event)&&forbidden.test((event.argv??[]).join(' '))){failure=Object.assign(new Error('Forbidden macOS keychain helper was invoked; operation failed.'),{code:'GIT_KEYCHAIN_FORBIDDEN'});throw failure;}
  }
 },close(){if(closed)return;closed=true;try{closeSync(fd);}finally{rmSync(directory,{recursive:true,force:true,maxRetries:4,retryDelay:25});}}};
}
export function guardNodeBinary({workerNode,versions=process.versions,execPath=process.execPath}={}){
 if(workerNode!==undefined)return typeof workerNode==='string'&&isAbsolute(workerNode)?workerNode:undefined;
 return versions.electron===undefined&&isAbsolute(execPath)?execPath:undefined;
}
/** The detached worker owns the command group. IPC disconnect also cleans it if its caller dies abruptly. */
export async function spawnGitSafe(command,args,options={}){
 let directory,worker,deadline,abortFallback,message,stdout='',stderr='';
 const {workerNode,signal,timeout,encoding='utf8',...childOptions}=options;
 const nodeRuntime=guardNodeBinary({workerNode});
 if(!nodeRuntime)throw Object.assign(new Error('An independent Node runtime is required; Electron cannot run the Git supervisor.'),{code:'GIT_GUARD_NODE_REQUIRED'});
 const abort=()=>{if(worker?.connected)worker.send({abort:true});abortFallback??=setTimeout(()=>worker?.kill('SIGTERM'),1000);};
 try{
  if(signal?.aborted)throw Object.assign(new Error('Guarded command aborted.'),{name:'AbortError',code:'ABORT_ERR'});
  const stdio=options.stdio==='inherit'?['ignore','inherit','inherit','ipc']:['ignore','pipe','pipe','ipc'];
  worker=fork(new URL('./git-worker.js',import.meta.url),[],{cwd:options.cwd,env:safeGitEnv(options.env??process.env),execArgv:[],execPath:nodeRuntime,detached:true,windowsHide:true,stdio});
  worker.stdout?.on('data',chunk=>{stdout=(stdout+chunk.toString(encoding)).slice(-4*1024*1024);});
  worker.stderr?.on('data',chunk=>{stderr=(stderr+chunk.toString(encoding)).slice(-4*1024*1024);});
  signal?.addEventListener('abort',abort,{once:true});
  if(timeout)deadline=setTimeout(()=>{if(worker.connected)worker.send({timeout:true});},timeout);
  const completed=new Promise((resolve,reject)=>{
   worker.once('error',reject);worker.on('message',value=>{if(value.directory)directory=value.directory;else message=value;});worker.once('close',()=>resolve());
  });
  worker.send({command,args,options:{...childOptions,env:safeGitEnv(options.env??process.env)}});
  await completed;
  if(message?.error)throw Object.assign(new Error('Guarded command failed.'),message.error);
  if(!message?.result)throw Object.assign(new Error('Git monitor exited without a result.'),{code:'GIT_GUARD_FAILED'});
  return {...message.result,stdout,stderr};
 }finally{
  clearTimeout(deadline);clearTimeout(abortFallback);signal?.removeEventListener('abort',abort);
  if(worker?.connected)worker.disconnect();
  if(directory)rmSync(directory,{recursive:true,force:true,maxRetries:4,retryDelay:25});
 }
}

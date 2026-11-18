// Internal IPC supervisor. The parent never detaches a package manager directly.
import {spawn,spawnSync,fork} from 'node:child_process';
import {existsSync,mkdtempSync,writeFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,basename} from 'node:path';
import {createWindowsJob} from './windows-job.js';
import {observeGitTrace} from './git-process.js';
let monitor,directory,timer,done=false,started=false,anchor,anchorClosed,windowsJob,jobStarting,jobController;
async function finish(payload){
 if(done)return;done=true;clearInterval(timer);
 if(process.platform==='win32'&&anchor){
  try{
   if(!windowsJob){jobController?.abort();try{await jobStarting}catch{}}
   if(windowsJob)await windowsJob.stop();else if(anchor.exitCode===null&&anchor.signalCode===null)anchor.kill('SIGKILL');
   await anchorClosed;
  }catch{payload={error:{code:'GIT_TREE_CLEANUP_FAILED'}};}
 }
 finalize(payload);
}
async function commandResult(payload){
 if(done)return;
 if(!payload.error){try{while(!done&&await windowsJob.active()>1)await new Promise(resolve=>setTimeout(resolve,5));}catch{void finish({error:{code:'GIT_TREE_CLEANUP_FAILED'}});return;}}
 if(!done)void finish(payload);
}
function finalize(payload){
 try{monitor?.check(true);}catch(error){payload={error:{code:error.code??'GIT_TRACE_INVALID'}};}
 try{if(monitor)monitor.close();else if(directory)rmSync(directory,{recursive:true,force:true});}catch{payload={error:{code:'GIT_TRACE_CLEANUP_FAILED'}};}
 const end=()=>{
  if(process.platform==='win32')process.exit(0);
  else process.kill(-process.pid,'SIGKILL');
 };
 if(process.connected)process.send(payload,end);else end();
}
function abort(code='ABORT_ERR'){finish({error:{code,...(code==='ABORT_ERR'?{name:'AbortError'}:{})}});}
process.once('disconnect',()=>abort());
process.once('SIGTERM',()=>abort());process.once('SIGINT',()=>abort());
if(!process.connected)process.exit(1);
process.on('message',async request=>{
 if(request.abort)return abort();if(request.timeout)return abort('ETIMEDOUT');
 if(started)return;started=true;
 try{
  let {command,args,options}=request;
  // No caller-owned trace exists before this IPC worker can clean on disconnect.
  const temporaryRoot=realpathSync(options.env.TMPDIR??tmpdir());
  const parentRoot=options.env.HM_GIT_GUARD_TMP_ROOT===temporaryRoot&&options.env.HM_GIT_GUARD_PARENT_ROOT?realpathSync(options.env.HM_GIT_GUARD_PARENT_ROOT):temporaryRoot;
  directory=mkdtempSync(join(parentRoot,'hm-git-guard-'));
  writeFileSync(join(directory,'events.jsonl'),'',{mode:0o600});monitor=observeGitTrace(directory);
  options.env={...options.env,HM_GIT_GUARD_PARENT_ROOT:directory,HM_GIT_GUARD_TMP_ROOT:temporaryRoot,GIT_TRACE2_EVENT:join(directory,'events.jsonl'),GIT_TRACE_REDACT:'1'};
  if(!process.connected)return abort();
  process.send({directory},error=>{if(error)abort();});
  // Native Windows .cmd shims cannot be executed by spawn without a shell.
  // Resolve the normal npm/global pnpm JS entry and keep argument arrays intact.
  const manager=basename(command).replace(/\.cmd$/i,'').toLowerCase();
  if(process.platform==='win32'&&['npm','npx','pnpm'].includes(manager)){
   const pkg=manager==='pnpm'?'pnpm':'npm',entry=manager==='pnpm'?'pnpm.cjs':manager+'-cli.js';
   const supplied=options.env.npm_execpath;
   const candidates=[...(supplied&&basename(supplied)===entry?[supplied]:[]),...[dirname(process.execPath),...(options.env.PATH??options.env.Path??'').split(';')].map(base=>join(base,'node_modules',pkg,'bin',entry))];
   const cli=candidates.find(path=>existsSync(path));if(!cli)throw Object.assign(new Error('Package manager JS entry unavailable.'),{code:'PACKAGE_MANAGER_UNAVAILABLE'});
   command=process.execPath;args=[cli,...args];
  }
  if(process.platform==='win32'){
   anchor=fork(new URL('./git-command-worker.js',import.meta.url),[],{cwd:options.cwd,env:options.env,execArgv:[],stdio:['ignore','inherit','inherit','ipc']});
   anchorClosed=new Promise(resolve=>anchor.once('close',resolve));
   anchor.once('message',value=>{void commandResult(value)});anchor.once('error',error=>{void finish({error:{code:error.code??'SPAWN_FAILED'}})});
   jobController=new AbortController();
   jobStarting=createWindowsJob({pid:anchor.pid,env:{...options.env,TMPDIR:directory,TMP:directory,TEMP:directory},cwd:options.cwd,signal:jobController.signal});
   windowsJob=await jobStarting;
   if(done)return;
   anchor.send({command,args,options});
   timer=setInterval(()=>{try{monitor.check();}catch(error){finish({error:{code:error.code??'GIT_TRACE_INVALID'}});}},25);
   return;
  }
  const {input,...spawnOptions}=options;
  const child=spawn(command,args,{...spawnOptions,stdio:[input===undefined?'ignore':'pipe','inherit','inherit'],detached:false});
  if(input!==undefined){child.stdin.on('error',()=>{});child.stdin.end(input);}
  child.once('error',error=>finish({error:{code:error.code??'SPAWN_FAILED'}}));
  child.once('close',(code,signal)=>finish({result:{code,status:code,signal}}));
  timer=setInterval(()=>{try{monitor.check();}catch(error){finish({error:{code:error.code??'GIT_TRACE_INVALID'}});}},25);
 }catch(error){finish({error:{code:error.code??'GIT_GUARD_FAILED'}});}
});

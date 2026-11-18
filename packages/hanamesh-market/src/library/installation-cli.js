/** Fixed official read-only CLI calls. No browser-controlled argv, environment or profile path. */
import {fork} from 'node:child_process';
import {guardNodeBinary} from '../git-process.js';
import {stat,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,isAbsolute,delimiter} from 'node:path';
import {AppHostError} from '../errors.js';
import semver from 'semver';
export const INSTALLATION_MANAGER_ENV_KEYS=Object.freeze(['VOLTA_HOME','ASDF_DATA_DIR','ASDF_CONFIG_FILE','MISE_DATA_DIR','MISE_CONFIG_DIR','MISE_GLOBAL_CONFIG_FILE','MISE_CACHE_DIR','MISE_STATE_DIR','FNM_DIR','NVM_DIR','NVM_HOME','NVM_SYMLINK','PNPM_HOME']);
export const INSTALLATION_ENV_KEYS=Object.freeze([...INSTALLATION_MANAGER_ENV_KEYS,'PATH','XDG_CONFIG_HOME','XDG_CACHE_HOME','XDG_DATA_HOME','XDG_STATE_HOME','XDG_RUNTIME_DIR','XDG_CONFIG_DIRS','XDG_DATA_DIRS']);
const pathListKeys=new Set(['PATH','XDG_CONFIG_DIRS','XDG_DATA_DIRS']);
const absolutePath=value=>typeof value==='string'&&isAbsolute(value)&&!/[\x00-\x1f]/.test(value);
export function installationEnvironment(source,platform=process.platform){
 const separator=platform==='win32'?';':':',result={};
 for(const key of INSTALLATION_ENV_KEYS){const value=key==='PATH'?source.PATH??source.Path:source[key];
  if(typeof value!=='string'||/[\x00-\x1f]/.test(value))continue;
  if(pathListKeys.has(key))result[key]=value.split(separator).filter(absolutePath).join(separator);
  else if(absolutePath(value))result[key]=value;
 }
 return result;
}
const fail=code=>{throw new AppHostError(code,'The automatically discovered official installation reader could not complete.',{},503)};
export const MINIMUM_READER_VERSIONS=Object.freeze({claude:'2.1.301',codex:'0.162.1'});
export function readerVersionFailure(channel,output){
 // SemVer prerelease is allowed: desktop apps bundle prerelease CLIs (ChatGPT.app: codex-cli 0.167.0-alpha.3.2).
 const pattern=channel==='claude'?/^(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?) \(Claude Code\)$/:/^codex-cli (\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;
 const version=pattern.exec(output.trim())?.[1];
 if(!version||semver.valid(version)!==version)return 'AGENT_READER_VERSION_INVALID';
 return semver.gte(version,MINIMUM_READER_VERSIONS[channel])?null:'AGENT_READER_VERSION_UNSUPPORTED';
}
export function validReader(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const keys=['executable','home','configDir','pluginName','marketplace','marketplaceUrl','timeoutMs','maxOutputBytes','nodeScript','runtimeEnv'];
 if(value.nodeScript!==undefined&&typeof value.nodeScript!=='boolean')return false;
 if(value.runtimeEnv!==undefined&&(!value.runtimeEnv||typeof value.runtimeEnv!=='object'||Array.isArray(value.runtimeEnv)||!Object.entries(value.runtimeEnv).every(([key,path])=>INSTALLATION_ENV_KEYS.includes(key)&&typeof path==='string'&&!/[\x00-\x1f]/.test(path)&&(pathListKeys.has(key)?path===''||path.split(delimiter).every(absolutePath):absolutePath(path)))))return false;
 if(Object.keys(value).some(key=>!keys.includes(key))||!['executable','home','configDir'].every(key=>typeof value[key]==='string'&&isAbsolute(value[key])&&!/[\x00-\x1f]/.test(value[key])))return false;
 if(!['pluginName','marketplace'].every(key=>typeof value[key]==='string'&&/^[a-z0-9][a-z0-9._-]{0,127}$/.test(value[key])))return false;
 try{const url=new URL(value.marketplaceUrl);if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search||url.href!==value.marketplaceUrl)return false}catch{return false}
 return Number.isSafeInteger(value.timeoutMs)&&value.timeoutMs>0&&value.timeoutMs<=2_147_483_647&&Number.isSafeInteger(value.maxOutputBytes)&&value.maxOutputBytes>0;
}
// Diagnostics contain only fixed identifiers, numeric measurements and allowlisted OS signals.
const commandStages=new Set(['version','plugin-list','marketplace-list','login-shell']);
const phases=['worker-startup','anchor-startup','cli','cleanup'];
const now=()=>Number(process.hrtime.bigint())/1e6;
const safeSignal=value=>['SIGTERM','SIGKILL','SIGINT','SIGABRT','SIGSEGV','SIGBUS','SIGILL','SIGPIPE','SIGHUP'].includes(value)?value:null;
export function installationCommandDiagnostic(value){
 if(!value||!commandStages.has(value.stage))return null;
 const duration=value=>Number.isFinite(value)&&value>=0?Math.round(value*1000)/1000:null;
 return{stage:value.stage,failurePhase:phases.includes(value.failurePhase)?value.failurePhase:null,
  timedOut:value.timedOut===true,exitCode:Number.isInteger(value.exitCode)?value.exitCode:null,signal:safeSignal(value.signal),
  workerExitCode:Number.isInteger(value.workerExitCode)?value.workerExitCode:null,workerSignal:safeSignal(value.workerSignal),
  stderrBytes:Number.isSafeInteger(value.stderrBytes)&&value.stderrBytes>=0?value.stderrBytes:0,
  stderrCode:value.stderrBytes>0?'STDERR_PRESENT':'STDERR_EMPTY',
  timingsMs:Object.fromEntries(['workerStartup','anchorStartup','cli','cleanup','total'].map(key=>[key,duration(value.timingsMs?.[key])]))};
}
export async function runOfficialInstallationCommand({channel,reader,args,signal,workerNode,stage}){
 const startedAt=now(),marks={};let stderrBytes=0,timeoutAt,workerExitCode,workerSignal;
 const commandStage=stage??(channel==='shell'?'login-shell':args[0]==='--version'?'version':args.includes('marketplace')?'marketplace-list':'plugin-list');
 const phaseAt=at=>marks.cleanupStartedAt<=at?'cleanup':marks.cliStartedAt<=at?'cli':marks.anchorStartedAt<=at?'anchor-startup':'worker-startup';
 const diagnostic=code=>{
  const endedAt=now(),end=marks.cleanupStartedAt??endedAt;
  const elapsed=(start,stop)=>start===undefined?null:Math.max(0,(stop??end)-start);
  return installationCommandDiagnostic({stage:commandStage,failurePhase:timeoutAt!==undefined?phaseAt(timeoutAt):code==='AGENT_READER_CLEANUP_FAILED'?'cleanup':marks.cliStartedAt!==undefined?'cli':phaseAt(end),timedOut:timeoutAt!==undefined,
   exitCode:marks.exitCode,signal:marks.signal,workerExitCode,workerSignal,stderrBytes,
   timingsMs:{workerStartup:elapsed(marks.workerStartedAt,marks.workerReadyAt),anchorStartup:elapsed(marks.anchorStartedAt,marks.cliStartedAt),
    cli:elapsed(marks.cliStartedAt,marks.cliEndedAt),cleanup:elapsed(marks.cleanupStartedAt,endedAt),total:endedAt-startedAt}});
 };
 try{
 if(signal?.aborted)fail('INSTALLATION_STATUS_CANCELLED');
 if(!validReader(reader))fail('AGENT_READER_DISCOVERY_INVALID');
 const nodeRuntime=guardNodeBinary({workerNode});if(!nodeRuntime)fail('AGENT_READER_NODE_REQUIRED');
 for(const path of [reader.home,reader.configDir]){let value;try{value=await stat(path)}catch{fail('AGENT_PROFILE_UNAVAILABLE')}if(!value.isDirectory())fail('AGENT_PROFILE_UNAVAILABLE')}
 const temporaryRoot=await realpath(tmpdir());let cwd,cleanupConfirmed=false;
 // Keep the selected user's manager resolution conditions, without model/API tokens, proxy, preloads or askpass.
 const systemRoot=process.platform==='win32'?(process.env.SystemRoot??'C:\\Windows'):undefined;
 const inheritedPath=(reader.runtimeEnv?.PATH??'').split(delimiter).filter(absolutePath);
 const env={...reader.runtimeEnv,PATH:[...new Set([dirname(nodeRuntime),dirname(reader.executable),...inheritedPath,...(systemRoot?[systemRoot,`${systemRoot}\\System32`]:['/usr/bin','/bin','/usr/local/bin'])])].join(delimiter),HOME:reader.home,USERPROFILE:reader.home,
  ...(systemRoot?{SystemRoot:systemRoot,LOCALAPPDATA:process.env.LOCALAPPDATA??`${reader.home}\\AppData\\Local`,APPDATA:process.env.APPDATA??`${reader.home}\\AppData\\Roaming`}:{}),
  ...(channel==='claude'?{CLAUDE_CONFIG_DIR:reader.configDir,CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1',DISABLE_AUTOUPDATER:'1'}:channel==='codex'?{CODEX_HOME:reader.configDir}:{}),
  GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:systemRoot?'NUL':'/dev/null',GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'credential.helper',GIT_CONFIG_VALUE_0:''};
 try{return await new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(new AppHostError('INSTALLATION_STATUS_CANCELLED','Installation read was cancelled.',{},499));return}
  // The reaper must survive caller death on Windows too; libuv kills non-detached children with their creator.
  marks.workerStartedAt=now();
  const child=fork(new URL('./installation-worker.js',import.meta.url),[],{cwd:temporaryRoot,env,execPath:nodeRuntime,execArgv:[],detached:true,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
  const chunks=[];let total=0,stderr=false,fault,exited=false,message;
  const kill=code=>{if(code==='AGENT_READER_TIMEOUT')timeoutAt??=now();fault??=code;if(!exited&&child.pid){if(process.platform==='win32'){if(child.connected)child.send({abort:true},()=>{})}else child.kill('SIGTERM')}};
  const abort=()=>kill('INSTALLATION_STATUS_CANCELLED');signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>kill('AGENT_READER_TIMEOUT'),reader.timeoutMs);
  child.stdout.on('data',chunk=>{total+=chunk.length;if(total>reader.maxOutputBytes)kill('AGENT_READER_OUTPUT_LIMIT');else chunks.push(chunk)});
  child.stderr.on('data',chunk=>{stderr=true;stderrBytes+=chunk.length;total+=chunk.length;if(total>reader.maxOutputBytes)kill('AGENT_READER_OUTPUT_LIMIT')});
  child.on('message',value=>{if(value.diagnostic){Object.assign(marks,value.diagnostic);return}if(typeof value.directory==='string')cwd=value.directory;else{message=value;cleanupConfirmed=value.cleanupComplete===true}});
  child.once('exit',()=>{exited=true});
  child.once('error',error=>{fault??=error.code==='EACCES'?'AGENT_READER_PERMISSION_DENIED':'AGENT_READER_UNAVAILABLE'});
  child.once('close',(code,terminationSignal)=>{workerExitCode=code;workerSignal=terminationSignal;exited=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
   if(fault||message?.error||message?.result!==0||(stderr&&channel!=='shell'))reject(new AppHostError((cwd&&!cleanupConfirmed?'AGENT_READER_CLEANUP_FAILED':fault??message?.error)??(stderr&&channel!=='shell'?'AGENT_READER_DIAGNOSTIC':'AGENT_READER_FAILED'),'The official reader did not return a complete successful result.',{},503));
   else resolve(Buffer.concat(chunks).toString('utf8'));
  });
  if(child.connected)child.send({executable:reader.nodeScript?nodeRuntime:reader.executable,args:reader.nodeScript?[reader.executable,...args]:args,temporaryRoot,env},()=>{});
  if(signal?.aborted)abort();
 })}finally{if(cwd&&cleanupConfirmed)try{await rm(cwd,{recursive:true,force:true,maxRetries:4,retryDelay:25})}catch{fail('AGENT_READER_CLEANUP_FAILED')}}
 }catch(error){
  const failure=error instanceof AppHostError?error:new AppHostError('AGENT_READER_FAILED','The official reader could not complete.',{},503);
  const value=diagnostic(failure.code);if(value)failure.details={command:value};throw failure;
 }
}

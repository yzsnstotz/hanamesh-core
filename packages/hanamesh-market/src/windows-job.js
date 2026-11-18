/** A Windows Job Object assigned before an IPC anchor is allowed to spawn commands. */
import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
export function createWindowsJob({pid,env,cwd,signal}){
 if(process.platform!=='win32'||!Number.isSafeInteger(pid)||pid<=1)throw new Error('A live Windows anchor PID is required.');
 const command=join(env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
 const child=spawn(command,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./windows-job.ps1',import.meta.url)),'-AnchorPid',String(pid)],{env,cwd,signal,windowsHide:true,stdio:['pipe','pipe','pipe']});
 let pending='',fault,closed=false,readyResolve,readyReject,stopPromise;const requests=[];
 const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject});
 const exit=new Promise(resolve=>child.once('close',()=>{closed=true;fail(new Error('Windows ownership helper closed.'));resolve()}));
 function fail(error){fault??=error;readyReject(error);for(const request of requests.splice(0))request.reject(error);if(!child.stdin.destroyed)child.stdin.end()}
 child.once('error',fail);child.stdin.on('error',fail);
 child.stderr.on('data',()=>fail(new Error('Windows ownership helper failed.')));
 child.stdout.on('data',chunk=>{
  pending+=chunk.toString('utf8');if(pending.length>4096){fail(new Error('Invalid Windows job response.'));child.stdin.end();return}
  const lines=pending.split(/\r?\n/);pending=lines.pop();
  for(const line of lines){if(line==='READY'){readyResolve();continue}const request=requests.shift();
   if(!request||!request.pattern.test(line)){fail(new Error('Invalid Windows job control response.'));child.stdin.end();return}request.resolve(line);
  }
 });
 const send=(text,pattern)=>new Promise((resolve,reject)=>{
  if(fault||closed){reject(fault??new Error('Windows ownership helper is closed.'));return}
  requests.push({resolve,reject,pattern});child.stdin.write(text+'\n',error=>{if(error)fail(error)});
 });
 return ready.then(()=>({
  active:async()=>Number((await send('ACTIVE',/^ACTIVE \d+$/)).slice(7)),
  stop:()=>stopPromise??=(async()=>{try{await send('STOP',/^STOPPED$/)}finally{child.stdin.end();await exit}})(),
 }),async error=>{child.stdin.end();await exit;throw error;});
}

// Live Windows tree anchor; its reaper closes the tree before removing trace files.
import {spawn,spawnSync} from 'node:child_process';
import {join} from 'node:path';
const stop=()=>{spawnSync(join(process.env.SystemRoot,'System32','taskkill.exe'),['/PID',String(process.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});process.exit(1);};
process.once('disconnect',stop);
process.once('message',({command,args,options})=>{
 const {input,...spawnOptions}=options;
 const child=spawn(command,args,{...spawnOptions,stdio:[input===undefined?'ignore':'pipe','inherit','inherit'],detached:false});
 if(input!==undefined){child.stdin.on('error',()=>{});child.stdin.end(input);}
 child.once('error',error=>{if(process.connected)process.send({error:{code:error.code??'SPAWN_FAILED'}});});
 child.once('close',(code,signal)=>{if(process.connected)process.send({result:{code,status:code,signal}});});
});

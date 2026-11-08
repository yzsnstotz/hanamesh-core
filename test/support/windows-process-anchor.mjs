// Test-only live tree anchor. Never discard the ancestor before taskkill /T.
import {spawn,execFileSync} from 'node:child_process';
import {join} from 'node:path';
process.on('disconnect',()=>{execFileSync(join(process.env.SystemRoot,'System32','taskkill.exe'),['/PID',String(process.pid),'/T','/F'],{stdio:'ignore'});});
process.once('message',({program,args,env})=>{
 const child=spawn(program,args,{env,cwd:process.cwd(),stdio:['ignore','pipe','pipe']});
 child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);
 child.once('error',()=>process.send({status:null,signal:null}));
 child.once('exit',(status,signal)=>process.send({status,signal}));
});

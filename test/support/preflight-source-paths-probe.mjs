import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import {join} from 'node:path';
const root=await mkdtemp(join(tmpdir(),'core-preflight-'));
const originalLog=console.log,rows=[],exists=[],commands=[];
globalThis.corePreflightProbe={exists,commands};
const hook=registerHooks({resolve(s,c,next){
 if(s==='@hanamesh/devkit/contract')return {url:'preflight:devkit',shortCircuit:true};
 if(s==='@hanamesh/devkit/contract/fixtures/consumer.json')return {url:'preflight:fixture',shortCircuit:true};
 if(s==='node:child_process')return {url:'preflight:spawn',shortCircuit:true};
 if(s==='node:fs')return {url:'preflight:fs',shortCircuit:true};
 return next(s,c);
},load(u,c,next){
 if(u==='preflight:devkit')return {format:'module',shortCircuit:true,source:'export function checkConsumer(input){return {status:"FIXTURE",consumerRoot:input.consumerRoot};}'};
 if(u==='preflight:fixture')return {format:'json',shortCircuit:true,source:'{}'};
 if(u==='preflight:spawn')return {format:'module',shortCircuit:true,source:'export function spawnSync(command,args,options){globalThis.corePreflightProbe.commands.push({command,args,options});return {status:0,stdout:"fixture-version"};}'};
 if(u==='preflight:fs')return {format:'module',shortCircuit:true,source:'export function existsSync(path){globalThis.corePreflightProbe.exists.push(path);return String(path).endsWith("present");}'};
 return next(u,c);
}});
try{
 console.log=value=>rows.push(JSON.parse(value));
 const {validateCoreEnvironment}=await import('../../devkit.preflight.mjs');
 await validateCoreEnvironment();
 assert.deepEqual(exists,[homedir()+'/work/projects/hanamesh/hanamesh-dsh-runtime',homedir()+'/work/projects/hanamesh/hanamesh-ui-kit'],'only the two existing code-root diagnostics run implicitly');
 assert.ok(rows.find(r=>r.userProfileAccessed===false&&r.userPort3080Accessed===false&&r.databaseAccessed===false));
 assert.deepEqual(commands.map(({command,args})=>[command,args]),[['dsh',['--version']],['psql',['--version']]]);
 for(const c of commands)assert.deepEqual(c.options,{encoding:'utf8'});
 rows.length=0;exists.length=0;commands.length=0;
 const present=join(root,'present'),absent=join(root,'absent');await mkdir(present);
 await validateCoreEnvironment({sourcePaths:[present,absent]});
 assert.equal(exists.length,4);assert.deepEqual(exists.slice(2),[present,absent]);
 assert.deepEqual(rows.filter(r=>r.path===present||r.path===absent),[{path:present,exists:true},{path:absent,exists:false}]);
 assert.equal(rows.at(-1).userProfileAccessed,false);
}finally{console.log=originalLog;hook.deregister();delete globalThis.corePreflightProbe;await rm(root,{recursive:true,force:true});}
console.log('PREFLIGHT_EXPLICIT_SOURCE_PATHS_PASS');

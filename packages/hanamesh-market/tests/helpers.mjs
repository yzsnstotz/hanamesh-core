import {mkdtemp,realpath,readFile} from 'node:fs/promises';import{rmSync,watch}from'node:fs';import{tmpdir}from'node:os';import{join,dirname}from'node:path';
const processRoots=new Map(),ownedProcessRoots=new Set();
export async function scratch(prefix='t-',{short=false}={}){
  const key=short?'short':'default';
  if(!processRoots.has(key))processRoots.set(key,realpath(short&&process.platform!=='win32'?'/tmp':tmpdir())
    .then(base=>mkdtemp(join(base,short?`hm-${process.pid}-`:`hm-app-host-${process.pid}-`)))
    .then(path=>{ownedProcessRoots.add(path);return path;}));
  return await mkdtemp(join(await processRoots.get(key),prefix));
}
process.on('exit',()=>{for(const path of ownedProcessRoots)rmSync(path,{recursive:true,force:true});});
// Subscribe before the initial read so fast fixture publication cannot be lost.
// This only observes an exact test-created file; it does not change command budgets.
export function waitForFixtureFile(file,{timeoutMs=2000}={}){
  return new Promise((resolve,reject)=>{
    let settled=false;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);watcher.close();error?reject(error):resolve(value);};
    const check=()=>{void readFile(file,'utf8').then(value=>finish(null,value),error=>{if(error.code!=='ENOENT')finish(error);});};
    const watcher=watch(dirname(file),check);
    const timer=setTimeout(()=>finish(new Error('Fixture did not publish its readiness file within its declared startup budget.')),timeoutMs);
    watcher.once('error',finish);check();
  });
}

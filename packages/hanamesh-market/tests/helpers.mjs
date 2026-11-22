import {mkdtemp,realpath,readFile} from 'node:fs/promises';import{rmSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';
import {performance} from 'node:perf_hooks';import{setTimeout as delay}from'node:timers/promises';
const processRoots=new Map(),ownedProcessRoots=new Set();
export async function scratch(prefix='t-',{short=false}={}){
  const key=short?'short':'default';
  if(!processRoots.has(key))processRoots.set(key,realpath(short&&process.platform!=='win32'?'/tmp':tmpdir())
    .then(base=>mkdtemp(join(base,short?`hm-${process.pid}-`:`hm-app-host-${process.pid}-`)))
    .then(path=>{ownedProcessRoots.add(path);return path;}));
  return await mkdtemp(join(await processRoots.get(key),prefix));
}
process.on('exit',()=>{for(const path of ownedProcessRoots)rmSync(path,{recursive:true,force:true});});
// Poll only the exact test-created readiness path within the original budget.
export async function waitForFixtureFile(file,{timeoutMs=2000}={}){
  const deadline=performance.now()+timeoutMs;
  while(performance.now()<deadline){
    try{
      const value=await readFile(file,'utf8');
      if(value.trim()&&performance.now()<deadline)return value;
    }catch(error){if(error.code!=='ENOENT')throw error;}
    const remaining=deadline-performance.now();
    if(remaining>0)await delay(Math.min(5,remaining));
  }
  throw new Error('Fixture did not publish its readiness file within its declared startup budget.');
}

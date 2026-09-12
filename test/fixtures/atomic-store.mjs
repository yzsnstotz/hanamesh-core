/** TEST-ONLY filesystem medium. This is NOT DSH storage-domain or a database. */
import {open, rename, readFile} from 'node:fs/promises';
import {readFileSync, existsSync} from 'node:fs';
import {dirname} from 'node:path';
export async function publishFile(path, value, checkpoint = async()=>{}) {
  const tmp=path+'.pending';
  const fd=await open(tmp,'w',0o600);
  try {await fd.writeFile(JSON.stringify(value));await fd.sync();}finally{await fd.close();}
  await checkpoint('before-rename');
  await rename(tmp,path);
  const dir=await open(dirname(path),'r');try{await dir.sync();}finally{await dir.close();}
  await checkpoint('after-rename');
}
export function readSync(path,fallback) {return existsSync(path)?JSON.parse(readFileSync(path,'utf8')):structuredClone(fallback);}
export async function read(path,fallback) {try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,rm,readFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const scratch=await mkdtemp(join(tmpdir(),'hanamesh-theme-pack-'));
try {
  const result=JSON.parse(execFileSync('npm',['pack','--json','--ignore-scripts','--pack-destination',scratch],{cwd:root,encoding:'utf8'}))[0];
  const archive=join(scratch,result.filename);
  assert(result.files.some(row=>row.path==='lib/client.js'));
  assert(result.files.some(row=>row.path==='lib/index.js'));
  for(const row of result.files)assert(!/^(src|test|scripts|node_modules)\//.test(row.path),row.path);
  await mkdir(join(scratch,'extracted'));
  execFileSync('tar',['-xzf',archive,'-C',join(scratch,'extracted')]);
  const metadata=JSON.parse(await readFile(join(scratch,'extracted/package/package.json'),'utf8'));
  assert.equal(metadata.name,'@hanamesh/theme');
  assert.equal(metadata.dsh.bundle.patch,'./cordis.patch.yml');
  assert(metadata.peerDependencies['@deepseek-ai/dsh-client-ui-theme'].includes('<0.3.0'));
  const {apply}=await import(new URL('file://'+join(scratch,'extracted/package/lib/index.js')));
  assert.equal(typeof apply,'function');apply();
  assert.match(await readFile(join(scratch,'extracted/package/cordis.patch.yml'),'utf8'),/name: '@hanamesh\/theme'/);
  console.log(JSON.stringify({status:'PASS',name:metadata.name,version:metadata.version,integrity:result.integrity,files:result.files.map(row=>row.path)},null,2));
} finally {await rm(scratch,{recursive:true,force:true});}

/** Source-free package smoke test; not installation into a real DSH profile. */
import {mkdtemp,writeFile,readFile,cp,rm,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const artifact=resolve(process.argv[2]||'artifacts/hanamesh-plugin-identity-0.1.0-rc.1.tgz');
const root=await mkdtemp(join(tmpdir(),'hm-identity-package-'));
function run(command,args,cwd){const result=spawnSync(command,args,{cwd,encoding:'utf8',timeout:20000});console.log(JSON.stringify({command,args,cwd,exit:result.status,error:result.error?.code||null}));if(result.stdout)console.log(result.stdout);if(result.stderr)console.log(result.stderr);assert.equal(result.status,0);}
try{
  const staging=join(root,'hanamesh-plugin-identity');await mkdir(staging);
  for(const path of ['src','types','vendor','deps','scripts','test','tsconfig.json','tsconfig.host.json','package.json','package-lock.json','consistency.json'])await cp(resolve(path),join(staging,path),{recursive:true});
  run(process.execPath,['scripts/verify-inputs.mjs'],staging);
  run(process.execPath,['scripts/build.mjs','--offline'],staging);
  run('tsc',['--noEmit','--strict','--skipLibCheck','false','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','test/public-contracts.ts'],staging);
  console.log(JSON.stringify({standaloneSourceRoot:staging,siblingSourceDirectoriesPresent:false,scope:'portable-core-and-public-types'}));
  const consume=join(root,'consumer');await mkdir(consume);await writeFile(join(consume,'package.json'),'{"private":true,"type":"module"}');
  run('npm',['install','--ignore-scripts','--legacy-peer-deps','--offline','--no-audit','--no-fund',artifact],consume);
  await writeFile(join(consume,'smoke.mjs'),`import assert from 'node:assert/strict';
import {name,apply,inject} from 'hanamesh-plugin-identity';
import {SESSION_STATUSES} from 'hanamesh-plugin-identity/contracts';
import {BrowserIdentityClient} from 'hanamesh-plugin-identity/client';
assert.equal(name,'hanamesh-plugin-identity');assert.equal(typeof apply,'function');assert.equal(SESSION_STATUSES.length,5);assert.equal(typeof BrowserIdentityClient,'function');assert.deepEqual(inject,['connection','webServer','storageDomain']);
await assert.rejects(import('hanamesh-plugin-identity/lib/transport.js'),e=>e.code==='ERR_PACKAGE_PATH_NOT_EXPORTED');
console.log('Package entrypoints and export fences loaded; apply not executed, runtime peers deliberately absent.');`);
  run(process.execPath,['smoke.mjs'],consume);
  console.log(JSON.stringify({artifact,sha256:createHash('sha256').update(await readFile(artifact)).digest('hex'),scope:'package-entrypoint-only',hostApplyExecuted:false}));
}finally{await rm(root,{recursive:true,force:true});}

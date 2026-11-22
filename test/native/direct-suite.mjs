/** Read the four direct packages in an isolated, running DSH Desktop profile. */
import assert from 'node:assert/strict';
import {access,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright-core';

const root=process.env.MCL1_ROOT;
assert.ok(root,'An isolated Desktop run root is required.');
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const profile=join(root,'dsh','profiles','desktop');
const packageRoot=join(profile,'node_modules','@hanamesh');
const entries=Object.fromEntries(await Promise.all(['core','usage','market','theme'].map(async name=>{
  const metadata=await json(join(packageRoot,name,'package.json'));
  assert.equal(metadata.name,'@hanamesh/'+name);
  return[metadata.name,metadata.version];
})));
const saved=await json(join(profile,'package.json'));
assert.equal(saved.dependencies['@hanamesh/dsh-app-host'],undefined);
assert.equal(saved.dependencies['@hanamesh/hanamesh'],undefined);
await assert.rejects(access(join(packageRoot,'dsh-app-host')),{code:'ENOENT'});
const lock=await readFile(join(profile,'pnpm-lock.yaml'),'utf8');
assert.doesNotMatch(lock,/@hanamesh\/dsh-app-host/);

const {port}=await json(join(root,'suite.json'));
const browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
try{
  const page=browser.contexts().flatMap(context=>context.pages()).find(candidate=>candidate.url()==='dsh-app://app/');
  assert.ok(page,'DSH Desktop workspace is open.');
  const read=path=>page.evaluate(async path=>{
    const response=await fetch(path,{signal:AbortSignal.timeout(20000)});
    return {status:response.status,body:await response.json()};
  },path);
  await page.waitForFunction(async()=>{
    const response=await fetch('/api/hanamesh/core/health',{signal:AbortSignal.timeout(3000)});
    return response.ok&&(await response.json()).revision>0;
  },null,{timeout:15000});
  const health=await read('/api/hanamesh/core/health');
  const suite=await read('/api/hanamesh/core/suite-declaration');
  const market=await read('/hanamesh/market/settings');
  const receipt={entries,health,suite,marketStatus:market.status};
  await writeFile(join(root,'direct-suite.json'),JSON.stringify(receipt,null,2)+'\n');
  assert.equal(health.status,200);
  assert.equal(health.body.mode,'normal');
  assert.deepEqual(Object.fromEntries(health.body.components.map(row=>[row.moduleName,row.status])),{
    '@hanamesh/usage':'satisfied','@hanamesh/market':'satisfied','@hanamesh/theme':'satisfied',
  });
  assert.equal(suite.status,200);
  assert.equal(suite.body.completeness,'complete',JSON.stringify(suite.body.blocked));
  assert.equal(suite.body.legacy?.status,'installed');
  assert.equal(suite.body.bundleVersion,null);
  assert.equal(suite.body.installCommand,null);
  assert.deepEqual(suite.body.upgrades,[]);
  assert.ok(suite.body.installed.every(row=>row.status==='satisfied'));
  assert.deepEqual(Object.fromEntries(suite.body.installed.map(row=>[row.moduleName,row.actualVersion])),entries);
  assert.equal(market.status,200);
  console.log('PASS: desktop loads all four direct members with normal health, complete suite, and no AppHost.');
}finally{
  await browser.close();
}

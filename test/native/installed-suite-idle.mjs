/** Read the existing Market suite adapter in the already open, isolated Desktop workspace. */
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {isAbsolute, join} from 'node:path';

const [cdpOrigin, expectedFile, evidence]=process.argv.slice(2);
assert.match(cdpOrigin??'', /^http:\/\/127\.0\.0\.1:[1-9]\d*$/u);
assert.ok(isAbsolute(expectedFile??'')&&isAbsolute(evidence??''), 'Use absolute expected versions and evidence paths.');
const expected=JSON.parse(await readFile(expectedFile, 'utf8'));
const componentNames=['@hanamesh/core','@hanamesh/usage','@hanamesh/dsh-app-host'];
assert.deepEqual(Object.keys(expected.components).sort(), [...componentNames].sort());
const version=/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/u;
for(const value of [expected.bundle,...Object.values(expected.components)])assert.match(value,version);

await mkdir(evidence);
const {chromium}=createRequire(import.meta.url)('playwright-core');
const browser=await chromium.connectOverCDP(cdpOrigin);
try{
  const workspace=browser.contexts().flatMap(context=>context.pages()).find(page=>page.url()==='dsh-app://app/');
  assert.ok(workspace,'The isolated DSH Desktop workspace must already be open.');
  const startedAt=Date.now();
  async function observe(name){
    const read=await workspace.evaluate(async()=>{
      const response=await fetch('/hanamesh/market/suite',{signal:AbortSignal.timeout(10000)});
      return{status:response.status,body:await response.json()};
    });
    await writeFile(join(evidence,name+'.json'),JSON.stringify({elapsedMs:Date.now()-startedAt,...read},null,2)+'\n');
    const {body}=read;
    assert.equal(read.status,200);
    assert.equal(body.status,'installed','the installed suite must remain observable through its real client peer lease');
    assert.equal(body.completeness,'complete');
    assert.equal(body.version,expected.bundle);
    assert.equal(body.components.length,componentNames.length);
    assert.deepEqual(Object.fromEntries(body.components.map(row=>[row.name,row.version])),expected.components);
    assert.ok(body.components.every(row=>row.status==='satisfied'));
    assert.ok(Number.isFinite(Date.parse(body.checkedAt)));
    return body;
  }
  const before=await observe('before');
  console.log('Initial installed suite confirmed; observing the unchanged native carrier for 330000 ms.');
  await new Promise(resolve=>setTimeout(resolve,330000));
  const after=await observe('after');
  assert.ok(Date.parse(after.checkedAt)>Date.parse(before.checkedAt),'the second Core read must be fresh');
  await writeFile(join(evidence,'result.json'),JSON.stringify({result:'PASS',elapsedMs:Date.now()-startedAt,...expected})+'\n');
  console.log('PASS: installed suite and versions survived the native idle timeout window.');
}finally{await browser.close();}

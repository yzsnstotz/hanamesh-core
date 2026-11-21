// Run against an isolated, signed DSH Desktop using both candidate npm archives.
import assert from 'node:assert/strict';
import {access, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright-core';

const root=process.env.MCL1_ROOT;
const phase=process.argv[2];
assert.ok(root&&['install','after-restart'].includes(phase));
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const fixture=await json(join(root,'fixture.json'));
const {port}=await json(join(root,phase+'.json'));
const browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
try{
  const page=browser.contexts().flatMap(ctx=>ctx.pages()).find(candidate=>candidate.url()==='dsh-app://app/');
  assert.ok(page,'DSH workspace loaded');
  const read=path=>page.evaluate(async path=>{
    const response=await fetch(path,{signal:AbortSignal.timeout(10000)});
    return {status:response.status,body:await response.json()};
  },path);
  const installed=async()=>{
    const {status,body}=await read('/hanamesh/library/installedPlugins');
    assert.equal(status,200);
    return body.apps.find(row=>row.packageName===fixture.name);
  };
  const profile=join(root,'dsh','profiles','desktop');
  if(phase==='install'){
    assert.equal(await installed(),undefined,'application absent before opening Market');
    assert.equal((await read('/hanamesh/library/node-runtime')).body.ready,true);
    const later=page.getByRole('button',{name:/^(稍后|Later)$/});
    if(await later.isVisible())await later.click();
    const tab=page.getByRole('tab',{name:'HanaMesh',exact:true});
    if(!await tab.isVisible())await page.getByRole('button',{name:/^(Plugins|插件)$/}).click();
    await tab.click();
    const market=page.locator('[data-plugin-tab="hanamesh"]');
    await market.locator('.hm-m-tabs').getByRole('button',{name:/^(Search|搜索)$/}).click();
    const card=market.locator('article').filter({hasText:fixture.displayName});
    const pathname=route=>response=>new URL(response.url()).pathname===route;
    const [prepared]=await Promise.all([
      page.waitForResponse(pathname('/hanamesh/market/prepare')),
      card.getByRole('button',{name:/^(Install|安装)$/}).click(),
    ]);
    const preview=await prepared.json();
    assert.equal(prepared.status(),200,JSON.stringify(preview));
    assert.equal(preview.action,'installApplication');
    assert.equal(preview.install.version,fixture.version);
    assert.equal(await installed(),undefined,'preview performs no installation');
    let confirms=0;
    page.on('request',request=>{if(new URL(request.url()).pathname==='/hanamesh/market/confirm')confirms++;});
    const [confirmed]=await Promise.all([
      page.waitForResponse(pathname('/hanamesh/market/confirm'),{timeout:90000}),
      page.locator('.hm-m-confirmation').getByRole('button',{name:/^(Confirm installation|确认安装)$/}).click(),
    ]);
    const receipt=await confirmed.json();
    assert.equal(confirmed.status(),200,JSON.stringify(receipt));
    assert.deepEqual(receipt.application,{status:'ready',appId:fixture.appId,packageName:fixture.name,version:fixture.version,restartRequired:true});
    assert.equal(confirms,1);
    await market.getByText(/The application and its runtime are ready\.|应用与运行时已就绪。/).waitFor();
    const row=await installed();
    assert.equal(row?.version,fixture.version);
    assert.equal(row.state,'installed-not-loaded');
    const saved=await json(join(profile,'package.json'));
    assert.equal(saved.dependencies[fixture.name],fixture.version);
    const runtime=join(root,'dsh','data','hanamesh-apps','runtimes',fixture.appId);
    const book=await json(join(runtime,'.provision','ledger.json'));
    assert.equal(book.items[fixture.runtime].version,fixture.version);
    assert.equal(book.items[fixture.runtime].sha256,fixture.sha256);
    await access(join(runtime,'runtime','bin','app'));
    await page.screenshot({path:join(root,'market-application-ready.png')});
    await writeFile(join(root,'market-application-install.json'),JSON.stringify({preview:preview.action,confirms,receipt,appState:row.state,runtime:book.items[fixture.runtime].version},null,2)+'\n');
  }else{
    const row=await installed();
    assert.equal(row?.version,fixture.version);
    assert.equal(row.state,'registered');
    assert.equal(row.runtimeItem,fixture.runtime);
    await writeFile(join(root,'market-application-restart.json'),JSON.stringify({appId:row.appId,state:row.state,version:row.version,runtime:row.runtimeItem},null,2)+'\n');
  }
}finally{
  await browser.close();
}

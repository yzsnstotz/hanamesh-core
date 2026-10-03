// Real Chrome in a fresh isolated DSH web profile. The prior HTTP probe leaves one pending target.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from '/Users/yzliu/work/projects/hanamesh/hanamesh-web-market/node_modules/playwright/index.mjs';

const [tag, port] = process.argv.slice(2);
const {RUN, EVID} = process.env;
const url = fs.readFileSync(`${RUN}/${tag}.url`, 'utf8').trim();
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({headless:true, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
  const page = await context.newPage();
  const writes = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && (path.startsWith('/hanamesh/') || path.startsWith('/apps/'))) writes.push(path);
  });
  const nav = await page.goto(url, {waitUntil:'domcontentloaded',timeout:30_000});
  for (const label of ['Continue','Configure later']) {
    const button = page.getByText(label,{exact:true}).first();
    if (await button.isVisible().catch(()=>false)) await button.click();
  }
  await page.locator('[data-hanamesh-target-state="found"]').waitFor({state:'visible',timeout:20_000});
  await page.waitForTimeout(600);
  const state = await page.locator('[data-hanamesh-target-state]').evaluateAll(nodes => nodes.map(node => ({status:node.getAttribute('data-hanamesh-target-state'),text:node.innerText,visible:!!node.getClientRects().length})));
  const exact = await page.locator('[data-hanamesh-target="exact"]').evaluateAll(nodes => nodes.map(node => ({id:node.getAttribute('data-hanamesh-library-item'),visible:!!node.getClientRects().length})));
  const targetResponse = await context.request.get(base+'/hanamesh/library/target',{headers:{Origin:base,'x-hanamesh-client':'workspace-v1'}});
  const target = (await targetResponse.json()).target;
  await page.screenshot({path:`${EVID}/ui/${tag}-target.png`,fullPage:true});
  const result = {tag,source:'REAL_HOST + REAL_UI official DSH; local fixture catalog',rootStatus:nav?.status(),state,exact,targetCleared:target===null,
    consumePosts:writes.filter(path=>path==='/hanamesh/library/target/consume').length,
    installPosts:writes.filter(path=>path.includes('install')).length,closePosts:writes.filter(path=>path==='/apps/close').length};
  fs.writeFileSync(`${EVID}/ui/${tag}-target.json`,JSON.stringify(result,null,2));
  assert.equal(result.rootStatus,200);
  assert.equal(state.length,1);
  assert.equal(state[0].status,'found');
  assert.equal(state[0].visible,true);
  assert.deepEqual(exact.map(row=>row.id).sort(),['p06-pet-exact-1','p06-pet-exact-2']);
  assert.ok(exact.every(row=>row.visible));
  assert.equal(result.consumePosts,1);
  assert.equal(result.targetCleared,true);
  assert.equal(result.installPosts,0);
  assert.equal(result.closePosts,0);
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}

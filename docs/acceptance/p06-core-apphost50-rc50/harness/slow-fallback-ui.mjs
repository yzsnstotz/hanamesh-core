import fs from 'node:fs';
import { chromium } from '/Users/yzliu/work/projects/hanamesh/hanamesh-web-market/node_modules/playwright/index.mjs';

const run=process.env.EVID+'/ui';
const base='http://127.0.0.1:35118';
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const holds=[],posts=[],preConsume=[];
let catalogOrdinal=0;
page.on('request',request=>{const url=new URL(request.url());if(request.method()==='POST'&&(url.pathname.startsWith('/hanamesh/')||url.pathname.startsWith('/apps/')))posts.push(url.pathname);});
page.route(url=>new URL(url).pathname==='/hanamesh/library',async route=>{
  const url=new URL(route.request().url());
  if(url.searchParams.get('q')==='dsh-pet'){
    const ordinal=++catalogOrdinal;
    await new Promise(resolve=>holds.push({ordinal,release:resolve}));
  }
  await route.continue();
});
page.route('**/hanamesh/library/target/consume',async route=>{
  preConsume.push(await snapshot());
  await route.continue();
});
const waitFor=async(predicate,label,ms=15_000)=>{const until=Date.now()+ms;while(Date.now()<until){if(await predicate())return;await page.waitForTimeout(100);}throw Error('timeout: '+label);};
const target=async()=>await(await fetch(base+'/hanamesh/library/target',{headers:{Origin:base,'x-hanamesh-client':'workspace-v1'}})).json();
async function snapshot(){return page.evaluate(()=>({
  states:[...document.querySelectorAll('[data-hanamesh-target-state]')].map(node=>({state:node.getAttribute('data-hanamesh-target-state'),visible:!!node.getClientRects().length,embedded:!!node.closest('.hm-market-embedded'),overlay:!!node.closest('.hm-library-overlay')})),
  embedded:document.querySelectorAll('.hm-market-embedded').length,
  overlay:document.querySelectorAll('.hm-library-overlay').length,
  exact:[...document.querySelectorAll('.hm-market-embedded [data-hanamesh-target="exact"]')].map(node=>({id:node.getAttribute('data-hanamesh-library-item'),visible:!!node.getClientRects().length})),
  overlayExact:[...document.querySelectorAll('.hm-library-overlay [data-hanamesh-target="exact"]')].map(node=>({id:node.getAttribute('data-hanamesh-library-item'),visible:!!node.getClientRects().length})),
}));}
try{
  await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:30_000});
  await page.waitForTimeout(1_000);
  const later=page.getByText('Configure later',{exact:true}).first();
  if(await later.isVisible().catch(()=>false))await later.click();
  const receipt=await fetch(base+'/hanamesh/library/target',{method:'POST',headers:{Origin:base,'x-hanamesh-client':'workspace-v1','content-type':'application/json'},body:JSON.stringify({packageName:'dsh-pet'})});
  await waitFor(()=>holds.length>=1,'overlay catalog GET held');
  const firstHeld=holds[0].ordinal;
  const before=await snapshot();
  // The overlay blocks pointer access to Settings. Dispatch real DOM button/tab clicks to navigate the mounted panel.
  await page.getByRole('button',{name:'打开 HanaMesh 设置'}).evaluate(node=>node.click());
  await page.waitForTimeout(400);
  await page.getByRole('button',{name:'Extension Management'}).evaluate(node=>node.click());
  await page.waitForTimeout(400);
  await page.getByRole('tab',{name:'Market'}).evaluate(node=>node.click());
  await page.locator('.hm-market-embedded').waitFor({state:'visible',timeout:15_000});
  await waitFor(()=>holds.length>=2,'embedded catalog GET held');
  const mounted=await snapshot();
  holds[0].release();
  await page.waitForTimeout(700);
  const overlayFirst=await snapshot();
  const targetBeforeUnmount=await target();
  const consumesBefore=posts.filter(path=>path==='/hanamesh/library/target/consume').length;
  await page.screenshot({path:`${run}/slow-fallback-before-unmount.png`});
  await page.getByText('Back to app',{exact:true}).first().evaluate(node=>node.click());
  await waitFor(async()=>await page.locator('.hm-market-embedded').count()===0,'embedded Market unmounted');
  await waitFor(()=>holds.length>=3,'overlay same-ID catalog retry held');
  const unmounted=await snapshot();
  const targetAfterUnmount=await target();
  const consumesStill=posts.filter(path=>path==='/hanamesh/library/target/consume').length;
  holds[2].release();
  await page.locator('.hm-library-overlay [data-hanamesh-target-state="found"]').waitFor({state:'visible',timeout:15_000});
  await page.waitForTimeout(700);
  const after=await snapshot();
  const targetAfter=await target();
  await page.screenshot({path:`${run}/slow-fallback-overlay-found.png`});
  await page.locator('.hm-library-overlay [data-hanamesh-library-item="p06-pet-exact-2"]').scrollIntoViewIfNeeded();
  await page.screenshot({path:`${run}/slow-fallback-overlay-scrolled.png`});
  holds[1].release();
  await page.waitForTimeout(700);
  const consumePosts=posts.filter(path=>path==='/hanamesh/library/target/consume').length;
  const result={gate:'P06-CORE50 REAL_HOST REAL_UI REAL_HOST REAL_UI unconsumed same-ID embedded-unmount fallback',
    result:receipt.status===202&&firstHeld===1&&mounted.embedded===1&&mounted.overlay===1&&overlayFirst.states.length===0&&!!targetBeforeUnmount.target&&consumesBefore===0&&unmounted.embedded===0&&unmounted.overlay===1&&!!targetAfterUnmount.target&&consumesStill===0&&after.states.length===1&&after.states[0].overlay&&after.states[0].state==='found'&&after.states[0].visible&&after.overlayExact.length===2&&after.overlayExact.every(row=>row.visible)&&preConsume.length===1&&preConsume[0].states.length===1&&preConsume[0].states[0].overlay&&!targetAfter.target&&consumePosts===1&&!posts.some(path=>path.includes('install')||path==='/apps/close')?'PASS':'PARTIAL',
    receiptStatus:receipt.status,before,mounted,overlayFirst,unmounted,targetPendingBeforeUnmount:!!targetBeforeUnmount.target,targetPendingAfterUnmount:!!targetAfterUnmount.target,consumesBefore,consumesStill,after,preConsume,consumePosts,installPosts:posts.filter(path=>path.includes('install')).length,closePosts:posts.filter(path=>path==='/apps/close').length,targetCleared:!targetAfter.target,catalogOrdinal,source:'isolated official DSH Core50/AppHost50; DOM panel navigation; Playwright holds both client catalog GETs, releases overlay first, unmounts embedded before its response, then releases same-ID overlay retry; fixture catalog'};
  fs.writeFileSync(`${run}/slow-fallback-result.json`,JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
  if(result.result!=='PASS')process.exitCode=1;
}catch(error){
  fs.writeFileSync(`${run}/slow-fallback-error.txt`,String(error.stack??error));
  fs.writeFileSync(`${run}/slow-fallback-diagnostic.json`,JSON.stringify({holds:holds.map(row=>row.ordinal),posts,preConsume,states:await snapshot().catch(()=>null)},null,2));
  await page.screenshot({path:`${run}/slow-fallback-error.png`}).catch(()=>{});
  console.error(error);process.exitCode=1;
}finally{await browser.close();}

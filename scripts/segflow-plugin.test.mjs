import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, realpath} from 'node:fs/promises';

const CDP_COMMAND_TIMEOUT_MS = Number(process.env.SEGFLOW_CORE_CDP_TIMEOUT_MS ?? 10000);
const UI_ASSERT_TIMEOUT_MS = Number(process.env.SEGFLOW_CORE_UI_TIMEOUT_MS ?? 10000);
const UI_CHECK_INTERVAL_MS = Number(process.env.SEGFLOW_CORE_UI_INTERVAL_MS ?? 100);
const TEST_TIMEOUT_MS = Number(process.env.SEGFLOW_CORE_TEST_TIMEOUT_MS ?? 90000);
for (const value of [CDP_COMMAND_TIMEOUT_MS, UI_ASSERT_TIMEOUT_MS, UI_CHECK_INTERVAL_MS, TEST_TIMEOUT_MS]) assert.ok(Number.isSafeInteger(value) && value > 0);

// Product verification only: no fixture UI, alternate profile, account login or host restart.
for (const name of Object.keys(process.env)) {
  if (/(?:_API_KEY|_TOKEN|_SECRET|_PASSWORD|_PRIVATE_KEY)$/.test(name) || name.startsWith('AWS_')) delete process.env[name];
}

async function connect(port, signal) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, {signal})).json();
  const target = targets.find(item => item.type === 'page' && item.url.startsWith('dsh-app://app'));
  assert.ok(target, 'The owned CLIENT must expose its actual native Desktop page');
  const endpoint = new URL(target.webSocketDebuggerUrl);
  assert.ok(['127.0.0.1', 'localhost'].includes(endpoint.hostname), 'CDP must remain on loopback');
  assert.equal(Number(endpoint.port), port, 'CDP must use the program-owned CLIENT port');
  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    const timer=setTimeout(()=>{socket.close();reject(new Error('Owned CDP connection did not open'));},CDP_COMMAND_TIMEOUT_MS);
    socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
    socket.addEventListener('error',()=>{clearTimeout(timer);socket.close();reject(new Error('Owned CDP connection failed'));},{once:true});
  });
  let serial = 0;
  const pending = new Map();
  const listeners = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const job = pending.get(message.id);
      if (!job) return;
      pending.delete(message.id);clearTimeout(job.timer);
      if (message.error) job.reject(new Error(message.error.message)); else job.resolve(message.result);
    } else listeners.get(message.method)?.(message.params);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => {pending.delete(id);reject(new Error(`CDP ${method} did not finish`));}, CDP_COMMAND_TIMEOUT_MS);
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true});
    assert.equal(result.exceptionDetails, undefined, 'Native page evaluation failed');return result.result.value;
  };
  const click = async (selector, text = null) => {
    const position = await evaluate(`(() => {const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find(n => ${text === null ? 'true' : `n.textContent.trim() === ${JSON.stringify(text)}`}); if (!node) return null; node.scrollIntoView({block:'center'}); const r=node.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    assert.ok(position, `Missing actual Desktop control: ${text ?? selector}`);
    await call('Input.dispatchMouseEvent',{type:'mousePressed',...position,button:'left',clickCount:1});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',...position,button:'left',clickCount:1});
  };
  const until = async (expression, message) => {
    const deadline = Date.now()+UI_ASSERT_TIMEOUT_MS;
    do {if(await evaluate(expression)) return;await new Promise(resolve=>setTimeout(resolve,UI_CHECK_INTERVAL_MS));}while(Date.now()<deadline);
    assert.fail(message);
  };
  return {call,evaluate,click,until,listeners,close(){for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('CDP session released'));}pending.clear();socket.close();}};
}

test('candidate declares its official host type closure without runtime contracts',async()=>{
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  assert.equal(pkg.dependencies['@hanamesh/api-contracts'],undefined);
  assert.equal(pkg.peerDependencies['@hanamesh/api-contracts'],undefined);
  for(const name of ['@deepseek-ai/dsh-client-connection','@deepseek-ai/dsh-storage-domain','@deepseek-ai/dsh-typert-protocol','@deepseek-ai/dsh-scope','@deepseek-ai/dsh-storage']) assert.equal(pkg.peerDependencies[name],'0.2.1-alpha.2');
});

test('installed Core provides native identity, consent and visible state-read failure', {timeout:TEST_TIMEOUT_MS},async t=>{
  const port=Number(process.env.SEGFLOW_PORT_CLIENT);
  assert.ok(Number.isInteger(port)&&port>0&&port<=65535&&port!==3080,'SEGFLOW_PORT_CLIENT must name the isolated product environment, not a fixture or user runtime');
  assert.ok(process.env.SEGFLOW_ENV_DIR,'SEGFLOW_ENV_DIR is required; no implicit profile fallback');
  const envDir=await realpath(process.env.SEGFLOW_ENV_DIR);
  const page=await connect(port,t.signal);
  const release=()=>page.close();
  t.signal.addEventListener('abort',release,{once:true});
  try {
    await page.until(`document.readyState === 'complete' && document.body.innerText.trim().length > 0`,'Native CLIENT page never rendered');
    await page.click('[aria-label="打开 HanaMesh 设置"]');
    await page.until(`Boolean(document.querySelector('[data-hanamesh-core-device]'))`,'Core identity did not become available; missing plugin/dependency/state must fail');
    const state=await page.evaluate(`fetch('/api/hanamesh/core/state').then(async r=>{if(!r.ok)throw new Error('CORE_STATE_READ_FAILED');return r.json()})`);
    assert.ok(state.deviceId,'Real Core must expose a device identity');
    assert.ok(state.identity.location?.startsWith(envDir+'/'),'Shared identity must already be configured inside the owned environment before Core activation');
    if(state.serverOrigin!==null) assert.equal(state.serverOrigin,`http://127.0.0.1:${Number(process.env.SEGFLOW_PORT_SERVER)}`,'Core must use the owned local server; never production');
    if(state.websiteOrigin!==null) assert.equal(state.websiteOrigin,`http://127.0.0.1:${Number(process.env.SEGFLOW_PORT_WEB)}`,'Core must use the owned local website');
    assert.equal(state.consent.state,'withheld','Fresh owned profile must retain the legal withheld default');
    await page.click('[data-hanamesh-core-page="settings"] input[type="checkbox"]');
    await page.until(`document.querySelector('[data-hanamesh-core-page="settings"]')?.innerText.includes('当前：已开启')`,'Consent was not confirmed by the actual host');
    await page.click('[data-hanamesh-core-page="settings"] input[type="checkbox"]');
    await page.until(`document.querySelector('[data-hanamesh-core-page="settings"]')?.innerText.includes('当前：已关闭')`,'Consent withdrawal was not confirmed by the actual host');
    const after=await page.evaluate(`fetch('/api/hanamesh/core/state').then(r=>r.json())`);
    assert.equal(after.deviceId,state.deviceId);assert.equal(after.consent.state,'withheld');
    const interceptionErrors=[];
    page.listeners.set('Fetch.requestPaused',p=>{void page.call('Fetch.failRequest',{requestId:p.requestId,errorReason:'Failed'}).catch(error=>interceptionErrors.push(error.message));});
    await page.call('Fetch.enable',{patterns:[{urlPattern:'*/api/hanamesh/core/state',requestStage:'Request'}]});
    try {
      await page.click('[data-hanamesh-core-page="settings"] button','返回');
      await page.click('[aria-label="打开 HanaMesh 设置"]');
      await page.until(`document.querySelector('[data-hanamesh-core-page="settings"]')?.innerText.includes('未能读取：')`,'Actual state-read failure must be visible rather than becoming an empty/default state');
    } finally {await page.call('Fetch.disable');page.listeners.delete('Fetch.requestPaused');}
    assert.deepEqual(interceptionErrors,[],'Carrier-failure injection itself must not fail silently');
    await page.click('[data-hanamesh-core-page="settings"] button','重新读取');
    await page.until(`Boolean(document.querySelector('[data-hanamesh-core-device]'))`,'Explicit state re-read did not recover after carrier failure');
    assert.equal(await page.evaluate(`document.querySelector('[data-hanamesh-core-device]').getAttribute('data-hanamesh-core-device')`),state.deviceId);
  } finally {t.signal.removeEventListener('abort',release);page.close();}
});

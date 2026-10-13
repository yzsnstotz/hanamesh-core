import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join, relative, isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';

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
    const finish=(error)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);if(error){socket.close();reject(error);}else resolve();};
    const abort=()=>finish(new Error('Owned CDP connection cancelled'));
    const timer=setTimeout(()=>finish(new Error('Owned CDP connection did not open')),CDP_COMMAND_TIMEOUT_MS);
    signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted){abort();return;}
    socket.addEventListener('open',()=>finish(),{once:true});
    socket.addEventListener('error',()=>finish(new Error('Owned CDP connection failed')),{once:true});
  });
  let serial = 0;
  const pending = new Map();
  const listeners = new Map();
  const rejectPending=reason=>{for(const job of pending.values()){clearTimeout(job.timer);job.reject(new Error(reason));}pending.clear();};
  socket.addEventListener('close',()=>rejectPending('Owned CDP channel closed'));
  socket.addEventListener('error',()=>rejectPending('Owned CDP channel failed'));
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
  return {call,evaluate,click,until,listeners,close(){rejectPending('CDP session released');listeners.clear();socket.close();}};
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
  // The mechanism installs this test-only observer through the normal loader.
  // Reading its output does not substitute a consumer duckCore for native injection.
  const observationFile=join(envDir,'core-provider-observation.json');
  const observer=async()=>JSON.parse(await readFile(observationFile,'utf8'));
  const inside=path=>{const rel=relative(envDir,path);assert.ok(rel&&!rel.startsWith('..')&&!isAbsolute(rel),'Path must stay in the owned environment');};
  const initial=await observer();
  assert.equal(initial.evidence,'REAL_CORDIS_INJECTION_TEST_OBSERVER');
  inside(await realpath(initial.providerPackagePath));
  assert.equal(initial.providerVersion,'0.3.2');
  const candidate=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  for(const [name,version] of Object.entries(candidate.peerDependencies)) assert.equal(initial.resolvedPeers[name]?.version,version,`Actual resolved peer ${name} must match the formal host combination`);
  const installedRoot=new URL('./',pathToFileURL(initial.providerPackagePath));
  for(const file of ['package.json','lib/dsh.mjs','lib/controller.js','lib/contract.js','lib/contract-fixtures.js','types/index.d.ts','profile/cordis.patch.yml']) {
    const expected=await readFile(new URL('../'+file,import.meta.url));
    const actual=await readFile(new URL(file,installedRoot));
    assert.equal(createHash('sha256').update(actual).digest('hex'),createHash('sha256').update(expected).digest('hex'),`Installed candidate bytes must match ${file}`);
  }
  assert.equal(initial.protocolVersion,'1');
  assert.deepEqual(initial.callableMethods,['getDeviceId','sign','signRequest','getConsent','onConsentChange','getSession','getServerOrigin','getPublicKey','getHealth']);
  assert.equal(initial.initialConsent,'withheld');
  assert.deepEqual(initial.consentEvents,[],'Owned fresh observer must not replay consent');
  const publicBytes=Buffer.from(initial.publicKey,'base64url');
  assert.equal(publicBytes.length,32);
  assert.equal(createHash('sha256').update(publicBytes).digest('base64url'),initial.deviceId);
  assert.equal(initial.session.deviceId,initial.deviceId);
  const page=await connect(port,t.signal);
  const release=()=>page.close();
  t.signal.addEventListener('abort',release,{once:true});
  try {
    await page.until(`document.readyState === 'complete' && document.body.innerText.trim().length > 0`,'Native CLIENT page never rendered');
    await page.click('[aria-label="打开 HanaMesh 设置"]');
    await page.until(`Boolean(document.querySelector('[data-hanamesh-core-device]'))`,'Core identity did not become available; missing plugin/dependency/state must fail');
    const state=await page.evaluate(`fetch('/api/hanamesh/core/state').then(async r=>{if(!r.ok)throw new Error('CORE_STATE_READ_FAILED');return r.json()})`);
    assert.ok(state.deviceId,'Real Core must expose a device identity');
    assert.equal(state.deviceId,initial.deviceId,'Native page and injected service must use the same device');
    assert.equal(initial.serverOrigin,state.serverOrigin);
    inside(await realpath(state.identity.location));
    for(const [origin,portName] of [[state.serverOrigin,'SEGFLOW_PORT_SERVER'],[state.websiteOrigin,'SEGFLOW_PORT_WEB']]) {
      if(origin===null) continue;
      const url=new URL(origin);
      assert.equal(url.protocol,'http:');assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));
      assert.equal(Number(url.port),Number(process.env[portName]),'Origin must use the owned service port');
      assert.equal(url.origin,origin,'Origin must be the root without credentials/path/query');
    }
    assert.equal(state.consent.state,'withheld','Fresh owned profile must retain the legal withheld default');
    await page.until(`Boolean(document.querySelector('[data-hanamesh-core-configuration="visible"]'))`,'Named runtime configuration must be visible');
    const configurationText=await page.evaluate(`document.querySelector('[data-hanamesh-core-configuration="visible"]').innerText`);
    for(const [key,value] of Object.entries(state.configuration)) assert.ok(configurationText.includes(String(value)),`Current configuration ${key} must be shown`);
    await page.until(`document.querySelector('[data-hanamesh-core-page="settings"]')?.innerText.includes('HanaMesh套件')`,'Component health must remain visible');
    await page.click('[data-hanamesh-core-page="settings"] input[type="checkbox"]');
    await page.until(`document.querySelector('[data-hanamesh-core-page="settings"]')?.innerText.includes('当前：已开启')`,'Consent was not confirmed by the actual host');
    await page.click('[data-hanamesh-core-page="settings"] input[type="checkbox"]');
    await page.until(`document.querySelector('[data-hanamesh-core-page="settings"]')?.innerText.includes('当前：已关闭')`,'Consent withdrawal was not confirmed by the actual host');
    const after=await page.evaluate(`fetch('/api/hanamesh/core/state').then(r=>r.json())`);
    assert.equal(after.deviceId,state.deviceId);assert.equal(after.consent.state,'withheld');
    let observed;
    for(const deadline=Date.now()+UI_ASSERT_TIMEOUT_MS;Date.now()<deadline;) {
      observed=await observer();if(observed.consentEvents.length>=2) break;
      await new Promise(resolve=>setTimeout(resolve,UI_CHECK_INTERVAL_MS));
    }
    assert.deepEqual(observed.consentEvents.map(event=>event.state),['granted','withheld']);
    for(const event of observed.consentEvents) {assert.equal(event.observedConsent,event.state);assert.equal(new Date(event.changedAt).toISOString(),event.changedAt);}
    assert.equal(observed.consentEvents[1].changedAt,after.consent.changedAt,'Native event timestamp must match durable state');
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
    const writes=[];
    page.listeners.set('Fetch.requestPaused',p=>{void page.call('Fetch.failRequest',{requestId:p.requestId,errorReason:'Failed'}).catch(error=>writes.push(error.message));});
    await page.call('Fetch.enable',{patterns:[{urlPattern:'*/api/hanamesh/core/consent',requestStage:'Request'}]});
    try {
      await page.click('[data-hanamesh-core-page="settings"] input[type="checkbox"]');
      await page.until(`document.querySelector('[data-hanamesh-core-page="settings"]')?.innerText.includes('授权保存未确认')`,'Consent write failure must be visible');
    } finally {await page.call('Fetch.disable');page.listeners.delete('Fetch.requestPaused');}
    assert.deepEqual(writes,[]);
    const unchanged=await page.evaluate(`fetch('/api/hanamesh/core/state').then(r=>r.json())`);
    assert.equal(unchanged.consent.state,'withheld','Failed carrier write cannot change durable consent');
    assert.equal((await observer()).consentEvents.length,2,'Failed write cannot emit a native consent event');
    await page.click('[data-hanamesh-core-page="settings"] button','返回');
    await page.click('[aria-label="打开 HanaMesh 设置"]');
    await page.until(`document.querySelector('[data-hanamesh-core-page="settings"]')?.innerText.includes('当前：已关闭')`,'Reopened real settings must recover authoritative withheld consent');
    await page.click('[data-hanamesh-core-page="settings"] button','关闭');
    await page.until(`!document.querySelector('[data-hanamesh-core-page="settings"]')`,'Closing must release the native settings dialog');
  } finally {t.signal.removeEventListener('abort',release);page.close();}
});

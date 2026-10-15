import test,{after} from 'node:test';import assert from 'node:assert/strict';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
const {apply}=await import(pathToFileURL(resolve(process.env.HM_TEST_LIB||'lib','dsh.mjs')).href);
// Never the real ~/.hanamesh: every run gets its own machine-wide identity root.
// Each root is removed when its owner finishes: per-test roots via t.after, the shared config root after the file.
const sharedRoot=(t)=>{const dir=mkdtempSync(join(tmpdir(),'hm-adapter-identity-'));(t?t.after.bind(t):after)(()=>rmSync(dir,{recursive:true,force:true}));return dir;};
const config={serverOrigin:null,websiteOrigin:null,allowSystemBrowser:false,sharedIdentityDir:sharedRoot()};
function fixture(failAt){
  const facts={routes:[],assets:[],events:[],closed:0,disposed:0,writes:[],provided:[],effects:[],specs:[]};
  const dispose=()=>{facts.disposed++;};
  const ctx={
    storageDomain:{async open(spec){facts.specs.push(spec);facts.spec??=spec;if(failAt==='open')throw Error('synthetic open failure');let observation=structuredClone(spec.global.initial);return {global:{get:()=>observation,async set(value){observation=value;facts.writes.push({domain:spec.name,value});}},async close(){facts.closed++;}};}},
    provide(name,value){facts.provided.push({name,value});return dispose;},
    connection:{fetch:{register(route){if(failAt==='register')throw Error('synthetic register failure');facts.routes.push(route);return async()=>dispose();}},requestRejection(req){return (req.headers instanceof Headers ? req.headers.get('x-synthetic-auth') : req.headers['x-synthetic-auth'])?undefined:401;}},
    loader:{entries(){return [];},options:{}},
    webServer:{register(route){facts.assets.push(route);return dispose;}},
    on(name,fn){facts.events.push({name,fn});return dispose;},
    effect(fn){facts.effects.push(fn());return dispose;},
  };
  return {facts,ctx};
}
test('adapter uses the core domain, core service name and no legacy web assets',async()=>{
  const {facts,ctx}=fixture();await apply(ctx,config);
  assert.deepEqual(facts.specs.map(spec=>spec.name),['hanamesh_core','hanamesh_core_health']);assert.equal(facts.spec.layout,'single');assert.deepEqual(facts.spec.tables,{});
  assert.ok(facts.routes.length>=2);assert.ok(facts.routes.every(r=>r.requestBody==='buffered'&&r.path.startsWith('/api/hanamesh/core/')));
  assert.deepEqual(facts.routes.find(r=>r.path==='/api/hanamesh/core/activity')?.methods,['GET']);
  assert.deepEqual(facts.routes.find(r=>r.path==='/api/hanamesh/core/server')?.methods,['POST']);
  assert.equal(facts.provided[0].name,'hanameshCore');assert.equal(facts.provided[0].value.signIn,undefined);
  assert.equal(facts.assets.length,0);assert.ok(facts.events.every(event=>event.name!==['webserver','index','inject'].join('/').replace('/index/','/index-')));
  await facts.effects[0]();
});
test('adapter activation failures do not silently install an anonymous substitute',async()=>{
  for(const kind of ['open','register']){
    const {facts,ctx}=fixture(kind);await assert.rejects(apply(ctx,config));
    assert.equal(facts.effects.length,0);assert.equal(facts.routes.length,0);assert.equal(facts.closed,kind==='open'?0:2);
  }
});
test('disposing after the storage facility closes still clears public access',async()=>{
  const {facts,ctx}=fixture();await apply(ctx,config);facts.closed=1;
  await facts.effects[0]();assert.equal(facts.closed>=1,true);
});
test('product path resolves the shared identity file and a corrupt one is reported, not replaced',async t=>{
  const root=sharedRoot(t);const {facts,ctx}=fixture();await apply(ctx,{...config,sharedIdentityDir:root});
  const shared=JSON.parse(readFileSync(join(root,'identity','device.json'),'utf8'));const core=facts.writes.filter(w=>w.domain==='hanamesh_core').at(-1).value;
  assert.equal(core.device.deviceId,shared.deviceId);assert.equal(facts.provided[0].value.getDeviceId(),shared.deviceId);await facts.effects[0]();
  const broken=sharedRoot(t);mkdirSync(join(broken,'identity'));writeFileSync(join(broken,'identity','device.json'),'broken');
  const second=fixture();await apply(second.ctx,{...config,sharedIdentityDir:broken});
  assert.equal(second.facts.writes.filter(w=>w.domain==='hanamesh_core').length,0);assert.equal(readFileSync(join(broken,'identity','device.json'),'utf8'),'broken');
  assert.throws(()=>second.facts.provided[0].value.getDeviceId(),e=>e?.code==='CORE_NOT_READY');
  const state=second.facts.routes.find(r=>r.path==='/api/hanamesh/core/state');const body=await (await state.fetch(new Request('http://127.0.0.1/api/hanamesh/core/state',{headers:{'x-synthetic-auth':'1'}}))).json();
  assert.equal(body.identity.status,'failed');assert.equal(body.identity.reason,'CORE_DEVICE_CORRUPT');assert.equal(body.identity.location,join(broken,'identity','device.json'));
  await second.facts.effects[0]();
});

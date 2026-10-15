import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile, readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPublicKey, createHash, verify} from 'node:crypto';
import {existsSync} from 'node:fs';

test('portable agent entry exists without loading DSH', async () => {
  assert.ok(existsSync(new URL('../lib/agent.js', import.meta.url)), 'portable agent entry must be built');
});
test('agent defaults off, shares the existing device, signs only after explicit consent, never exports keys', async t => {
  const root = await mkdtemp(join(tmpdir(), 'hm-core-agent-')); t.after(() => rm(root,{recursive:true,force:true}));
  const {agentCall} = await import('../lib/agent.js');
  const config = {sharedHome:root,serverOrigin:null,websiteOrigin:null};
  const {fileSharedDeviceStore} = await import('../lib/shared-device.js');
  const {createDevice} = await import('../lib/device.js');
  await fileSharedDeviceStore(root).claim(createDevice());
  const before = await agentCall(config,{operation:'state'});
  assert.equal(before.consent.state,'withheld');
  await assert.rejects(agentCall(config,{operation:'sign',bytes:'aGVsbG8='}), /CONSENT_WITHHELD/);
  await agentCall(config,{operation:'consent',state:'granted'});
  const state = await agentCall(config,{operation:'state'});
  assert.equal(state.deviceId,before.deviceId);
  const {signature} = await agentCall(config,{operation:'sign',bytes:Buffer.from('hello').toString('base64')});
  const publicKey = createPublicKey({format:'der',type:'spki',key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(state.publicKey,'base64url')])});
  assert.ok(verify(null,Buffer.from('hello'),publicKey,Buffer.from(signature,'base64url')));
  assert.equal((await import('../lib/shared-device.js')).fileSharedDeviceStore(root).location, join(root,'identity/device.json'));
  assert.equal(JSON.parse(await readFile(join(root,'identity/device.json'),'utf8')).deviceId,state.deviceId);
  assert.doesNotMatch(JSON.stringify(state),/privateKey|Pkcs8/);
  await agentCall(config,{operation:'consent',state:'withheld'});
  await assert.rejects(agentCall(config,{operation:'signRequest',method:'POST',path:'/v2/usage/events',body:'[]'}),/CONSENT_WITHHELD/);
});
test('status is read-only on a fresh install and request signatures cover exact bytes with a new nonce',async t=>{
 const root=await mkdtemp(join(tmpdir(),'hm-core-agent-readonly-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const {agentCall}=await import('../lib/agent.js');const config={sharedHome:root,serverOrigin:null,websiteOrigin:null};
 assert.equal((await agentCall(config,{operation:'state'})).deviceId,null);assert.deepEqual(await readdir(root),[]);
 await agentCall(config,{operation:'consent',state:'granted'});
 const a=await agentCall(config,{operation:'signRequest',method:'POST',path:'/v2/usage/events?q=ignored',body:'[]'});
 const b=await agentCall(config,{operation:'signRequest',method:'POST',path:'/v2/usage/events',body:'[]'});
 assert.notEqual(a['x-hm-nonce'],b['x-hm-nonce']);
 const state=await agentCall(config,{operation:'state'});
 const key=createPublicKey({format:'der',type:'spki',key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(state.publicKey,'base64url')])});
 const canonical=`POST|/v2/usage/events|${a['x-hm-timestamp']}|${a['x-hm-nonce']}|${createHash('sha256').update('[]').digest('hex')}`;
 assert.ok(verify(null,Buffer.from(canonical),key,Buffer.from(a['x-hm-signature'],'base64url')));
});

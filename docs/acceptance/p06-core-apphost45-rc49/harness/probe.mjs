// usage: node probe.mjs <tag> <port> <action>   actions: core | routes
// Authenticates exactly like the browser (session token -> cookie, same-origin header); writes one token-free JSON line.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import http from 'node:http';
const [tag, port, action] = process.argv.slice(2), RUN = process.env.RUN, origin = `http://127.0.0.1:${port}`;
const url = (await readFile(`${RUN}/${tag}.url`, 'utf8')).trim();
const login = await fetch(url, { redirect:'manual' }); const cookie = (login.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).join('; ');
const get = async path => { const res = await fetch(origin + path, { headers:{ cookie, origin, 'sec-fetch-site':'same-origin' } }); const text = await res.text(); let json; try { json = JSON.parse(text); } catch { json = null; } return { status:res.status, json }; };
const out = { tag, action };
if (action === 'core') {
  // Core rechecks health every 3 s after boot; poll (max 20 s) and record the first snapshot plus how long until both siblings settle.
  const t0 = Date.now(); let health = await get('/api/hanamesh/core/health'); const first = (health.json?.components ?? []).map(c => `${c.id}:${c.status}`);
  while ((health.json?.components ?? []).some(c => c.status !== 'satisfied') && Date.now() - t0 < 20_000) { await new Promise(r => setTimeout(r, 500)); health = await get('/api/hanamesh/core/health'); }
  out.firstHealth = first; out.settledAfterMs = Date.now() - t0;
  const state = await get('/api/hanamesh/core/state');
  Object.assign(out, { stateStatus:state.status, deviceIdPresent:typeof state.json?.deviceId === 'string' && state.json.deviceId.length > 20,
    deviceIdPrefix:state.json?.deviceId?.slice(0, 8), registration:state.json?.registration?.status, consent:state.json?.consent?.state,
    healthStatus:health.status, healthMode:health.json?.mode, healthFault:health.json?.fault ?? null,
    components:(health.json?.components ?? state.json?.components ?? []).map(c => ({ id:c.id, status:c.status, version:c.version, requiredRange:c.requiredRange })) });
} else if (action === 'routes') {
  for (const p of ['/api/hanamesh/core/state', '/api/hanamesh/core/health', '/hanamesh/apps']) out[p] = (await get(p)).status;
  const lib = await get('/hanamesh/library/installedPlugins'); out.installedPlugins = lib.status === 200 ? lib.json.plugins.map(p => `${p.packageName}@${p.version}:${p.active ? 'active' : 'inactive'}`) : lib.status;
  out.unauthenticatedCoreState = (await fetch(origin + '/api/hanamesh/core/state')).status;
} else if (action === 'target') {
  const path = '/hanamesh/library/target';
  const before = await get(path);
  const base = {cookie, origin, 'sec-fetch-site':'same-origin', 'content-type':'application/json', 'x-hanamesh-client':'workspace-v1'};
  const post = async (headers, input = {packageName:'dsh-pet'}) => {
    const res = await fetch(origin + path, {method:'POST', headers, body:JSON.stringify(input)});
    const data = await res.json();
    return {status:res.status, code:data.error?.code ?? null, data};
  };
  const accepted = await post(base);
  const after = await get(path);
  const missingHeader = await post(Object.fromEntries(Object.entries(base).filter(([key]) => key !== 'x-hanamesh-client')));
  const foreignOrigin = await post({...base, origin:'https://foreign.invalid'});
  const frame = await post({...base, 'sec-fetch-dest':'iframe'});
  // Node fetch normalizes Host back to the URL authority. Use raw http.request so the negative wire Host is exact.
  const badHost = await new Promise((resolve, reject) => {
    const body = JSON.stringify({packageName:'dsh-pet'});
    const request = http.request({hostname:'127.0.0.1', port:Number(port), path, method:'POST',
      headers:{...base, host:'foreign.invalid', 'content-length':Buffer.byteLength(body)}}, response => {
      let raw = ''; response.setEncoding('utf8'); response.on('data', chunk => raw += chunk);
      response.on('end', () => { const data = JSON.parse(raw); resolve({status:response.statusCode, code:data.error?.code ?? null, wireHost:'foreign.invalid'}); });
    });
    request.on('error', reject); request.end(body);
  });
  const tooLong = await post(base, {packageName:'a'.repeat(201)});
  const finalState = await get(path);
  assert.equal(before.status, 200);
  assert.equal(before.json?.target, null);
  assert.equal(accepted.status, 202);
  assert.equal(after.status, 200);
  assert.equal(after.json?.target?.packageName, 'dsh-pet');
  assert.equal(after.json?.target?.targetId, accepted.data.targetId);
  assert.deepEqual([missingHeader.status, missingHeader.code], [403, 'CSRF_DENIED']);
  assert.deepEqual([foreignOrigin.status, foreignOrigin.code], [403, 'ORIGIN_DENIED']);
  assert.deepEqual([frame.status, frame.code], [403, 'FRAME_CONTROL_DENIED']);
  assert.deepEqual([badHost.status, badHost.code], [403, 'HOST_DENIED']);
  assert.deepEqual([tooLong.status, tooLong.code], [400, 'TARGET_SEARCH_UNSUPPORTED']);
  assert.equal(finalState.json?.target?.targetId, accepted.data.targetId);
  Object.assign(out, {
    beforeTargetNull:true, positive:{status:accepted.status, packageName:accepted.data.packageName,
      targetIdSha256:createHash('sha256').update(accepted.data.targetId).digest('hex')},
    negatives:{missingHeader:[missingHeader.status,missingHeader.code],foreignOrigin:[foreignOrigin.status,foreignOrigin.code],
      frame:[frame.status,frame.code],badHost:{wireHost:badHost.wireHost,status:badHost.status,code:badHost.code},tooLong:[tooLong.status,tooLong.code]},
    rejectedPreservedTarget:true,
  });
}
console.log(JSON.stringify(out));

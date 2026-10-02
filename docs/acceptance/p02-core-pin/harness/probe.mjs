// usage: node probe.mjs <tag> <port> <action>   actions: core | routes
// Authenticates exactly like the browser (session token -> cookie, same-origin header); writes one token-free JSON line.
import { readFile } from 'node:fs/promises';
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
}
console.log(JSON.stringify(out));

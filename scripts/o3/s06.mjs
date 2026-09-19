// O3 stage 3 · S06 authorization boundary (SI14–SI16) on the pinned DSH with a real O1 host (hanamesh-server@0.2.0-rc.2) + disposable PostgreSQL.
// usage: node scripts/o3/s06.mjs <ROOT> [REGISTRY_PORT]   (verdaccio must already serve the three packages)
import {spawn, spawnSync} from 'node:child_process';
import {generateKeyPairSync, randomBytes} from 'node:crypto';
import {mkdirSync, writeFileSync, readFileSync, appendFileSync} from 'node:fs';
import {createServer} from 'node:net';
import path from 'node:path';
const [,, ROOT, RP = '4879'] = process.argv;
const HOST = '/Users/yzliu/work/projects/hanamesh/hanamesh-server';
const CORE = '/Users/yzliu/work/projects/hanamesh/hanamesh-core';
const DSH_BIN = process.env.DSH_BIN ?? '/Users/yzliu/work/projects/hanamesh/hanamesh-dsh-runtime/runtime/node_modules/@deepseek-ai/dsh/lib/bin.js';
const CORE_VER = process.env.CORE_VER ?? '0.2.0-rc.11';
const out = path.join(ROOT, 'stage3'); mkdirSync(out, {recursive: true});
const log = v => { const line = JSON.stringify(v); console.log(line); appendFileSync(path.join(out, 's06.jsonl'), line + '\n'); };
const run = (cmd, args, opts = {}) => { const r = spawnSync(cmd, args, {encoding: 'utf8', ...opts}); if (r.status !== 0 && !opts.allowFailure) throw new Error(`${cmd} ${args.join(' ')}\n${r.stdout}\n${r.stderr}`); return r; };
const freePort = () => new Promise(res => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const token = randomBytes(4).toString('hex'); const container = `hm-o3-s06-${token}`;
const adminPassword = randomBytes(12).toString('base64url'), migratorPassword = randomBytes(12).toString('base64url'), runtimePassword = randomBytes(12).toString('base64url');
let host = null, dshPid = null;
try {
  // ---- PostgreSQL + O1 host
  writeFileSync(path.join(ROOT, 'pg.env'), `POSTGRES_PASSWORD=${adminPassword}\nHM_MIGRATOR_PASSWORD=${migratorPassword}\nHM_RUNTIME_PASSWORD=${runtimePassword}\n`, {mode: 0o600});
  run('docker', ['run', '--detach', '--rm', '--pull', 'never', '--name', container, '--env-file', path.join(ROOT, 'pg.env'), '--tmpfs', '/var/lib/postgresql/data', '--publish', '127.0.0.1::5432', 'postgres:17.6']);
  for (let i = 0; i < 60; i++) { if (run('docker', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], {allowFailure: true}).status === 0) break; await sleep(500); }
  await sleep(1500);
  const dbPort = Number(/:(\d+)/.exec(run('docker', ['port', container, '5432/tcp']).stdout)[1]);
  const psql = (db, sql) => run('docker', ['exec', '--interactive', '--env', `PGPASSWORD=${adminPassword}`, container, 'psql', '-X', '-h', '127.0.0.1', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-A', '-t'], {input: sql}).stdout.trim();
  psql('postgres', `CREATE ROLE hm_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD '${migratorPassword}';
CREATE ROLE hm_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD '${runtimePassword}';
CREATE ROLE hm_catalog_nonowner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
CREATE DATABASE hm_s06 OWNER hm_migrator; REVOKE ALL ON DATABASE hm_s06 FROM PUBLIC; GRANT CONNECT ON DATABASE hm_s06 TO hm_runtime;`);
  psql('hm_s06', 'REVOKE CREATE ON SCHEMA public FROM PUBLIC;');
  const url = (role, pw) => `postgresql://${role}:${pw}@127.0.0.1:${dbPort}/hm_s06`;
  const mig = run('npm', ['run', 'migrate', '--silent'], {cwd: HOST, env: {...process.env, MIGRATION_DATABASE_URL: url('hm_migrator', migratorPassword), MIGRATION_DATABASE_NAME: 'hm_s06'}});
  log({step: 'migrate', applied: /"applied":(\d+)/.exec(mig.stdout)?.[1]});
  const httpPort = await freePort(); const origin = `http://127.0.0.1:${httpPort}`;
  const signer = generateKeyPairSync('ed25519').privateKey.export({format: 'der', type: 'pkcs8'}).toString('base64url');
  const env = {...process.env, DATABASE_URL: url('hm_runtime', runtimePassword), INSTANCE_ID: `s06-${token}`, HOST: '127.0.0.1', PORT: String(httpPort), NODE_ENV: 'test',
    BETTER_AUTH_SECRET: randomBytes(32).toString('base64url'), IDENTITY_BASE_URL: origin, IDENTITY_DEPLOYMENT_ID: `s06-${token}`, IDENTITY_ISSUER: `urn:hanamesh:s06:${token}`,
    IDENTITY_TRUSTED_ORIGINS: JSON.stringify([origin]), IDENTITY_ALLOW_REGISTRATION: 'false', IDENTITY_GITHUB_CLIENT_ID: 'unused', IDENTITY_GITHUB_CLIENT_SECRET: randomBytes(8).toString('hex'),
    IDENTITY_GITHUB_OAUTH_BASE: 'http://127.0.0.1:9', IDENTITY_GITHUB_API_BASE: 'http://127.0.0.1:9', IDENTITY_MAGIC_LINK_ENABLED: 'false',
    CUSTODY_SIGNER_PRIVATE_KEY: signer, CUSTODY_SIGNER_KEY_ID: 's06', CUSTODY_WITHDRAW_ENABLED: 'false', CUSTODY_OUTBOX_INTERVAL_MS: '60000', CUSTODY_OUTBOX_MAX_ATTEMPTS: '5', CUSTODY_VOUCHER_TTL_MS: '60000',
    CLAIM_PENDING_TTL_MS: '60000', USAGE_RETENTION_INTERVAL_MS: '60000', REGISTRY_INDEXER_PRINCIPAL_IDS: '00000000-0000-4000-8000-000000000001', INDEXER_INTERVAL_MS: '900000'};
  host = spawn(process.execPath, ['dist/start.js'], {cwd: HOST, env, stdio: ['ignore', 'pipe', 'pipe']});
  let hostLog = ''; host.stdout.on('data', c => hostLog += c); host.stderr.on('data', c => hostLog += c);
  let up = false; for (let i = 0; i < 100 && !up; i++) { try { up = (await fetch(`${origin}/health`)).ok; } catch {} if (!up) await sleep(200); }
  if (!up) throw new Error('host not up\n' + hostLog);
  log({step: 'host', version: JSON.parse(readFileSync(path.join(HOST, 'package.json'), 'utf8')).version, origin});
  const countEvents = () => Number(psql('hm_s06', 'SELECT count(*) FROM usage.events;'));
  const eventRows = () => psql('hm_s06', "SELECT row_to_json(e) FROM (SELECT device_id, hana_ref, action, occurred_at, event_id, nonce, length(signature) AS signature_len FROM usage.events) e;");

  // ---- fresh isolated DSH home with the suite, core pointed at the host, usage upload interval 5 s
  const home = path.join(ROOT, 'homes', 's06'); run('rm', ['-rf', home]); mkdirSync(home, {recursive: true});
  run('bash', [path.join(CORE, 'scripts/p1/fresh-home.sh'), home, RP], {env: {...process.env, DSH_BIN}});
  const envsh = Object.fromEntries(readFileSync(path.join(home, 'env.sh'), 'utf8').split('\n').filter(l => l.startsWith('export ')).map(l => { const m = /^export (\w+)='(.*)'$/.exec(l); return [m[1], m[2]]; }));
  const dsh = (...args) => run('env', ['-i', `HOME=${envsh.HOME}`, `DSH_HOME=${envsh.DSH_HOME}`, `NPM_CONFIG_USERCONFIG=${envsh.NPM_CONFIG_USERCONFIG}`, `npm_config_cache=${envsh.npm_config_cache}`, `PATH=${process.env.PATH}`, 'node', DSH_BIN, ...args]);
  dsh('plugin', '--profile', 'core', 'add', `hanamesh-core@${CORE_VER}`);
  const patch = path.join(envsh.DSH_HOME, 'profiles/core/cordis.patch.yml');
  writeFileSync(patch, `- id: hanamesh-core\n  config:\n    serverOrigin: '${origin}'\n    websiteOrigin: 'https://market.example'\n- id: hanamesh-usage\n  config:\n    uploadIntervalMs: 5000\n`);
  const boot = () => { const r = run('bash', [path.join(CORE, 'scripts/p1/boot.sh'), home], {allowFailure: true}); dshPid = Number(readFileSync(path.join(home, 'boot.pid'), 'utf8')); return r.status; };
  const stop = async () => { if (dshPid) { try { process.kill(dshPid, 'SIGTERM'); } catch {} await sleep(1500); dshPid = null; } };
  const port = envsh.HM_P1_PORT; const base = `http://127.0.0.1:${port}`;
  let cookie = '';
  const auth = async () => { const t = /token=([A-Za-z0-9_-]+)/.exec(readFileSync(path.join(home, 'boot.log'), 'utf8'))[1]; const r = await fetch(`${base}/?token=${t}`, {redirect: 'manual'}); cookie = (r.headers.get('set-cookie') ?? '').split(';')[0]; };
  const get = async p => { const r = await fetch(base + p, {headers: {cookie}}); return r.json(); };
  const post = async (p, body) => { const r = await fetch(base + p, {method: 'POST', headers: {cookie, origin: base, 'content-type': 'application/json'}, body: JSON.stringify(body)}); return {status: r.status, body: await r.json().catch(() => null)}; };
  log({step: 'boot-1', status: boot()}); await sleep(4000); await auth();
  const s0 = await get('/api/hanamesh/core/state'); const deviceId = s0.deviceId;
  log({step: 'core-registered', registration: s0.registration.status, principalId: typeof s0.registration.principalId, deviceId: deviceId.slice(0, 8)});
  let uh = await get('/api/hanamesh/usage/health');
  log({step: 'usage-health-initial', consent: uh.consent, core: uh.core, pending: uh.pending, outbox: uh.outbox, localEvents: (await get('/api/hanamesh/usage/events')).total});
  await sleep(12000);
  log({step: 'SI14-zero-upload-while-withheld', serverEvents: countEvents(), consent: (await get('/api/hanamesh/usage/health')).consent, outbox: (await get('/api/hanamesh/usage/health')).outbox});
  // produce local usage events: install an extra plugin (inventory install event), then grant consent
  await stop();
  const extra = run('env', ['-i', `HOME=${envsh.HOME}`, `DSH_HOME=${envsh.DSH_HOME}`, `NPM_CONFIG_USERCONFIG=${envsh.NPM_CONFIG_USERCONFIG}`, `npm_config_cache=${envsh.npm_config_cache}`, `PATH=${process.env.PATH}`, 'node', DSH_BIN, 'plugin', '--profile', 'core', 'add', '@hanamesh/app-vibe-trading@0.1.0-rc.11'], {allowFailure: true});
  log({step: 'extra-plugin-add', status: extra.status, tail: (extra.stdout + extra.stderr).split('\n').filter(l => /^\+|ERR|Done/.test(l)).slice(-3)});
  log({step: 'boot-2', status: boot()}); await sleep(4000); await auth();
  log({step: 'local-events-after-install', total: (await get('/api/hanamesh/usage/events')).total, sample: ((await get('/api/hanamesh/usage/events')).events ?? []).slice(0, 2)});
  await sleep(8000);
  log({step: 'SI14b-still-zero-before-consent', serverEvents: countEvents()});
  const consent = await post('/api/hanamesh/core/consent', {state: 'granted'});
  log({step: 'consent-granted', status: consent.status, body: consent.body});
  let n = 0; for (let i = 0; i < 12; i++) { await sleep(3000); n = countEvents(); if (n > 0) break; }
  uh = await get('/api/hanamesh/usage/health');
  log({step: 'SI15-upload-after-consent', serverEvents: n, rows: eventRows().split('\n').slice(0, 3).map(r => { try { return JSON.parse(r); } catch { return r; } }), outbox: uh.outbox, pending: uh.pending});
  const withdraw = await post('/api/hanamesh/core/consent', {state: 'withheld'});
  let m = n; for (let i = 0; i < 12; i++) { await sleep(3000); m = countEvents(); if (m === 0) break; }
  uh = await get('/api/hanamesh/usage/health');
  log({step: 'SI16-withdraw', status: withdraw.status, serverEventsAfter: m, withdrawal: uh.withdrawal, outbox: uh.outbox, pending: uh.pending, localEvents: (await get('/api/hanamesh/usage/events')).total});
  await stop();
  log({gate: 'O3-S06', result: 'DONE'});
} catch (e) { log({error: String(e).slice(0, 800)}); process.exitCode = 1; }
finally {
  if (dshPid) { try { process.kill(dshPid, 'SIGTERM'); } catch {} }
  if (host) host.kill('SIGTERM');
  run('docker', ['rm', '--force', container], {allowFailure: true});
}

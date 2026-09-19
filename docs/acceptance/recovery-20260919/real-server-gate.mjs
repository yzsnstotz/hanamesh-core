// P1 core rc.9 REAL_SERVER gate: real hanamesh-server@0.2.0-rc.1 host + disposable PostgreSQL 17.6 (tmpfs, random loopback port).
import {spawn, spawnSync} from 'node:child_process';
import {generateKeyPairSync, randomBytes} from 'node:crypto';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const HOST = '/Users/yzliu/work/projects/hanamesh/hanamesh-server';
const CORE = '/Users/yzliu/work/projects/hanamesh/hanamesh-core';
const image = 'postgres:17.6';
const token = randomBytes(4).toString('hex');
const container = `hm-p1-real-${token}`;
const adminPassword = randomBytes(12).toString('base64url'), migratorPassword = randomBytes(12).toString('base64url'), runtimePassword = randomBytes(12).toString('base64url');
const run = (cmd, args, opts = {}) => { const r = spawnSync(cmd, args, {encoding: 'utf8', ...opts}); if (r.status !== 0 && !opts.allowFailure) throw new Error(`${cmd} ${args.join(' ')}\n${r.stdout}\n${r.stderr}`); return r; };
const freePort = () => new Promise(res => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const out = v => console.log(JSON.stringify(v));
const work = await mkdtemp(path.join(tmpdir(), 'hm-p1-real-'));
let child = null;
try {
  await writeFile(path.join(work, 'pg.env'), `POSTGRES_PASSWORD=${adminPassword}\nHM_MIGRATOR_PASSWORD=${migratorPassword}\nHM_RUNTIME_PASSWORD=${runtimePassword}\n`, {mode: 0o600});
  run('docker', ['run', '--detach', '--rm', '--pull', 'never', '--name', container, '--env-file', path.join(work, 'pg.env'), '--tmpfs', '/var/lib/postgresql/data', '--publish', '127.0.0.1::5432', image]);
  let ready = false; for (let i = 0; i < 60 && !ready; i++) { ready = run('docker', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], {allowFailure: true}).status === 0; if (!ready) await new Promise(r => setTimeout(r, 500)); }
  if (!ready) throw new Error('pg not ready');
  await new Promise(r => setTimeout(r, 1500));
  const dbPort = Number(/:(\d+)/.exec(run('docker', ['port', container, '5432/tcp']).stdout)[1]);
  const psql = (db, sql) => run('docker', ['exec', '--interactive', '--env', `PGPASSWORD=${adminPassword}`, container, 'psql', '-X', '-h', '127.0.0.1', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-A', '-t'], {input: sql});
  psql('postgres', `CREATE ROLE hm_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD '${migratorPassword}';
CREATE ROLE hm_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD '${runtimePassword}';
CREATE ROLE hm_catalog_nonowner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
CREATE DATABASE hm_p1_real OWNER hm_migrator; REVOKE ALL ON DATABASE hm_p1_real FROM PUBLIC; GRANT CONNECT ON DATABASE hm_p1_real TO hm_runtime;`);
  psql('hm_p1_real', 'REVOKE CREATE ON SCHEMA public FROM PUBLIC;');
  const url = (role, pw, db) => `postgresql://${role}:${pw}@127.0.0.1:${dbPort}/${db}`;
  const mig = run('npm', ['run', 'migrate', '--silent'], {cwd: HOST, env: {...process.env, MIGRATION_DATABASE_URL: url('hm_migrator', migratorPassword, 'hm_p1_real'), MIGRATION_DATABASE_NAME: 'hm_p1_real'}});
  out({step: 'migrate', applied: /"applied":(\d+)/.exec(mig.stdout)?.[1]});
  const httpPort = await freePort(); const origin = `http://127.0.0.1:${httpPort}`;
  const signer = generateKeyPairSync('ed25519').privateKey.export({format: 'der', type: 'pkcs8'}).toString('base64url');
  const env = {...process.env, DATABASE_URL: url('hm_runtime', runtimePassword, 'hm_p1_real'), INSTANCE_ID: `p1-real-${token}`, HOST: '127.0.0.1', PORT: String(httpPort), NODE_ENV: 'test',
    BETTER_AUTH_SECRET: randomBytes(32).toString('base64url'), IDENTITY_BASE_URL: origin, IDENTITY_DEPLOYMENT_ID: `p1-real-${token}`, IDENTITY_ISSUER: `urn:hanamesh:p1-real:${token}`,
    IDENTITY_TRUSTED_ORIGINS: JSON.stringify([origin]), IDENTITY_ALLOW_REGISTRATION: 'false', IDENTITY_GITHUB_CLIENT_ID: 'unused', IDENTITY_GITHUB_CLIENT_SECRET: randomBytes(8).toString('hex'),
    IDENTITY_GITHUB_OAUTH_BASE: 'http://127.0.0.1:9', IDENTITY_GITHUB_API_BASE: 'http://127.0.0.1:9', IDENTITY_MAGIC_LINK_ENABLED: 'false',
    CUSTODY_SIGNER_PRIVATE_KEY: signer, CUSTODY_SIGNER_KEY_ID: 'p1-real', CUSTODY_WITHDRAW_ENABLED: 'false', CUSTODY_OUTBOX_INTERVAL_MS: '60000', CUSTODY_OUTBOX_MAX_ATTEMPTS: '5', CUSTODY_VOUCHER_TTL_MS: '60000',
    CLAIM_PENDING_TTL_MS: '60000', USAGE_RETENTION_INTERVAL_MS: '60000', REGISTRY_INDEXER_PRINCIPAL_IDS: '00000000-0000-4000-8000-000000000001'};
  child = spawn(process.execPath, ['dist/start.js'], {cwd: HOST, env, stdio: ['ignore', 'pipe', 'pipe']});
  let hostLog = ''; child.stdout.on('data', c => hostLog += c); child.stderr.on('data', c => hostLog += c);
  let up = false; for (let i = 0; i < 100 && !up; i++) { try { up = (await fetch(`${origin}/health`)).ok; } catch {} if (!up) await new Promise(r => setTimeout(r, 200)); }
  if (!up) throw new Error(`host not up\n${hostLog}`);
  out({step: 'host-listening', version: JSON.parse(run('cat', [path.join(HOST, 'package.json')]).stdout).version, origin});

  // ---- core rc.9 real code (lib/), real fetch, real host ----
  const {SessionController} = await import(pathToFileURL(path.join(CORE, 'lib/controller.js')).href);
  const {INITIAL_CORE_SNAPSHOT} = await import(pathToFileURL(path.join(CORE, 'lib/contracts.js')).href);
  let value = structuredClone(INITIAL_CORE_SNAPSHOT);
  const store = {read: () => value, publish: async next => { value = next; }, close: async () => undefined};
  const controller = await SessionController.create({serverOrigin: origin, websiteOrigin: 'https://market.example'}, store);
  const reg = await controller.register();
  out({step: 'device-register', mode: 'REAL_SERVER', registration: reg.registration, principalId: typeof reg.principalId, deviceId: controller.service.getDeviceId().slice(0, 8)});
  const again = await controller.register();
  out({step: 'device-register-idempotent', registration: again.registration, samePrincipal: again.principalId === reg.principalId});
  const headers = await controller.service.signRequest({method: 'GET', path: '/v1/identity/me', body: null});
  const me = await fetch(`${origin}/v1/identity/me`, {headers});
  out({step: 'device-auth-me', status: me.status, body: me.status === 200 ? {scopes: (await me.json()).principal?.scopes} : await me.json()});
  { const to = new Date(), from = new Date(to.getTime() - 90*24*3600*1000); const p = `/v1/usage/me/contributions?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`; const h = await controller.service.signRequest({method: 'GET', path: p, body: null}); const r = await fetch(`${origin}${p}`, {headers: h}); out({step: 'contributions-raw', status: r.status, body: (await r.text()).slice(0, 300)}); }
  const contributions = await controller.refreshContributions();
  out({step: 'contributions-signed', status: contributions.status, reason: contributions.reason ?? null, bound: controller.service.getSession().bound});
  const link = await controller.bindLink();
  const u = new URL(link.url);
  out({step: 'bind-link', origin: u.origin + u.pathname, params: [...u.searchParams.keys()], nonceLen: u.searchParams.get('nonce').length});
  // negative: tampered signature header must be rejected by identity
  const bad = {...await controller.service.signRequest({method: 'GET', path: '/v1/identity/me', body: null})}; bad['x-hm-signature'] = bad['x-hm-signature'].slice(0, -2) + 'AA';
  const badRes = await fetch(`${origin}/v1/identity/me`, {headers: bad});
  out({step: 'device-auth-tampered', status: badRes.status, code: (await badRes.json()).error?.code});
  // negative: the rc.8 wire format (newline canonical, seconds) must be rejected — proves the fix is load-bearing
  const {createHash} = await import('node:crypto');
  const ts = String(Math.floor(Date.now() / 1000)), nonce = randomBytes(16).toString('base64url');
  const legacy = {'x-hm-device-id': controller.service.getDeviceId(), 'x-hm-timestamp': ts, 'x-hm-nonce': nonce,
    'x-hm-signature': Buffer.from(controller.service.sign(new TextEncoder().encode(`GET\n/v1/identity/me\n${ts}\n${nonce}\n${createHash('sha256').update(new Uint8Array()).digest('hex')}`))).toString('base64url')};
  const legacyRes = await fetch(`${origin}/v1/identity/me`, {headers: legacy});
  out({step: 'rc8-wire-format-rejected', status: legacyRes.status, code: (await legacyRes.json()).error?.code});
  await controller.dispose();
  out({gate: 'P1-REAL_SERVER', result: 'DONE'});
} finally {
  if (child) { child.kill('SIGTERM'); await new Promise(r => setTimeout(r, 500)); }
  run('docker', ['rm', '--force', container], {allowFailure: true});
  await rm(work, {recursive: true, force: true});
}

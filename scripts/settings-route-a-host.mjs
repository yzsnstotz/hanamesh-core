// Component self-test environment only. Uses unmodified public official host
// packages and the newly packed Core; never reads/copies old suite seeds.
import {mkdir, readdir, symlink, writeFile, readFile, appendFile} from 'node:fs/promises';
import {resolve, join, dirname} from 'node:path';
import {spawn, execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const [runArg, modulesArg, tarArg] = process.argv.slice(2);
assert.ok(runArg && modulesArg && tarArg, 'usage: node settings-route-a-host.mjs RUN_ROOT PUBLIC_HOST_NODE_MODULES CORE_TGZ');
const root = resolve(runArg); const modules = resolve(modulesArg); const tarball = resolve(tarArg);
assert.ok(root.endsWith('/hanamesh-runs/P02-CORE-SETTINGS-01/route-a'));
assert.equal(process.version, 'v24.13.1');
const evidence = resolve(root, '../_evidence/route-a');
const profile = join(root, 'dsh-home/profiles/route-a');
const profileModules = join(profile, 'node_modules');
await mkdir(evidence, {recursive: true});
// Existing environments are intentionally not reused or erased by this script.
await mkdir(dirname(profile), {recursive: true});
await mkdir(profile); // fails if this profile has already been run
await mkdir(profileModules);
const excluded = name => name.startsWith('hanamesh-') || name === '@hanamesh' || name === 'dsh-codex-subscription' || name.startsWith('.');
for (const entry of await readdir(modules, {withFileTypes: true})) {
  if (excluded(entry.name)) continue;
  await symlink(join(modules, entry.name), join(profileModules, entry.name));
}
const core = join(profileModules, 'hanamesh-core');
await mkdir(core);
execFileSync('tar', ['-xzf', tarball, '--strip-components=1', '-C', core]);
const pkg = JSON.parse(await readFile(join(core, 'package.json'), 'utf8'));
await writeFile(join(profile, 'package.json'), JSON.stringify({private: true, type: 'module',
  dependencies: {'@deepseek-ai/dsh-base': '0.2.0-rc.2', '@deepseek-ai/dsh-web-app': '0.2.0-rc.2', 'hanamesh-core': 'file:' + tarball},
  dsh: {profile: {bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'hanamesh-core']}}}, null, 2));
await writeFile(join(profile, 'cordis.patch.yml'), '- id: hanamesh-core\n  config:\n    serverOrigin: null\n    websiteOrigin: null\n    allowSystemBrowser: false\n');
// Credential/environment isolation: no inherited keys, auth files or models.
const env = {HOME: join(root, 'home'), DSH_HOME: join(root, 'dsh-home'), TMPDIR: join(root, 'tmp'),
  PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`, NPM_CONFIG_USERCONFIG: '/dev/null', npm_config_cache: join(root, 'npm-cache')};
for (const path of [env.HOME, env.DSH_HOME, env.TMPDIR, env.npm_config_cache]) await mkdir(path, {recursive: true});
const reservation = createServer();
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
assert.notEqual(port, 3080);
await new Promise(resolve => reservation.close(resolve));
let authenticatedUrl;
// The launch token stays in memory. Browser reaches the official token→cookie
// exchange via a local redirect; tool outputs/evidence contain clean URLs only.
const portal = createServer((_request, response) => {
  if (!authenticatedUrl) { response.writeHead(503); response.end('Host not ready'); return; }
  response.writeHead(302, {location: authenticatedUrl, 'cache-control': 'no-store'}); response.end();
});
await new Promise(resolve => portal.listen(0, '127.0.0.1', resolve));
const portalPort = portal.address().port;
const cli = join(modules, '@deepseek-ai/dsh/lib/bin.js');
const child = spawn(process.execPath, [cli, '--profile', 'route-a', '--port', String(port), '--no-open'], {env, stdio: ['ignore', 'pipe', 'pipe']});
const log = join(evidence, 'host.log');
await writeFile(log, '');
const record = line => {
  const match = line.match(/dsh web: (http:\/\/127\.0\.0\.1:[0-9]+\/\?token=[^\s]+)/);
  if (match) authenticatedUrl = match[1];
  void appendFile(log, line.replace(/([?&]token=)[^\s)&]+/g, '$1[REDACTED]') + '\n');
};
for (const stream of [child.stdout, child.stderr]) {
  let buffer = '';
  stream.on('data', chunk => { buffer += chunk.toString(); const lines = buffer.split('\n'); buffer = lines.pop(); lines.forEach(record); });
}
const receipt = {coreVersion: pkg.version, coreSha256: createHash('sha256').update(await readFile(tarball)).digest('hex'),
  officialHostVersion: '0.2.0-rc.2', publicHostModules: modules, seedPackagesRead: false,
  profile, home: env.HOME, environmentNames: Object.keys(env), hostPid: child.pid, port,
  browserEntry: `http://127.0.0.1:${portalPort}/`, modelRequests: 0,
  limitation: 'Public official host package links are a component environment; not a product install or dependency-closure gate.'};
await writeFile(join(evidence, 'runtime.json'), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt));
const shutdown = () => { child.kill('SIGTERM'); portal.close(); };
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
child.on('exit', code => { portal.close(); process.exitCode = code ?? 1; });

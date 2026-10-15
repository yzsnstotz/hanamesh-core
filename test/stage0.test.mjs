import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, access, readdir} from 'node:fs/promises';
import {join} from 'node:path';
import semver from 'semver';

const readJson = async path => JSON.parse(await readFile(path, 'utf8'));

test('Core admits official rc.2 and compatible 0.2.x prereleases without admitting 0.3', async () => {
  const pkg = await readJson('package.json');
  assert.equal(pkg.name, 'hanamesh-core');
  assert.equal(pkg.private, undefined);
  assert.equal(pkg.license, 'MIT');
  assert.deepEqual(pkg.dependencies, {semver: '7.7.2'}); // D-3 / HM-4: semver is the only runtime dependency
  assert.equal(pkg.dsh.bundle.patch, './profile/cordis.patch.yml');
  for (const [name, version] of Object.entries(pkg.peerDependencies)) {
    if (name.startsWith('@deepseek-ai/dsh-')) {
      for (const host of ['0.2.0-rc.2','0.2.0','0.2.1-alpha.1','0.2.1-alpha.9','0.2.1','0.2.9-alpha.1','0.2.99']) assert.equal(semver.satisfies(host,version,{includePrerelease:true}),true,`${name} rejects ${host}`);
      for (const host of ['0.2.0-rc.1','0.1.9','0.3.0-alpha.1','0.3.0','1.0.0']) assert.equal(semver.satisfies(host,version,{includePrerelease:true}),false,`${name} admits ${host}`);
      for (const host of ['0.2.0-rc.2','0.2.1-alpha.2']) assert.equal(semver.satisfies(host,version),true,`normal package resolver rejects ${host}`);
    }
    if (name==='@deepseek-ai/cordis') for (const host of ['4.0.4','4.0.5-alpha.1','4.0.5']) assert.equal(semver.satisfies(host,version),true);
    if (pkg.devDependencies[name] && name.startsWith('@deepseek-ai/')) assert.ok(semver.valid(pkg.devDependencies[name]),'development input remains exact');
  }
  assert.equal((await readJson('profile/suite.profile.json')).version, pkg.version);
  assert.doesNotMatch(await readFile('pnpm-lock.yaml', 'utf8'), /file:vendor\/siblings/);
});

test('real-host boot uses a clean allowlisted environment', async () => {
  const script = await readFile('scripts/p1/boot.sh', 'utf8');
  assert.match(script, /nohup env -i/);
  assert.match(script, /HOME="\$HOME"/);
  assert.match(script, /DSH_HOME="\$DSH_HOME"/);
});

test('Core patch inserts only Core so separately installed components can coexist', async () => {
  const patch = await readFile('profile/cordis.patch.yml', 'utf8');
  assert.equal((patch.match(/^- insert:/gm) ?? []).length, 1);
  assert.deepEqual([...patch.matchAll(/^\s+- id: (hanamesh-[a-z-]+)$/gm)].map(match => match[1]), [
    'hanamesh-core',
  ]);
  // rc.15: a fresh install must be able to register and open the bind page without hand-editing the profile
  // (user 2026-09-20 hit CORE_URL_NOT_ALLOWED on a stock install because both origins shipped as null).
  assert.match(patch, /^\s+serverOrigin: https:\/\/api\.hanamesh\.com$/m);
  assert.match(patch, /^\s+websiteOrigin: https:\/\/market\.hanamesh\.com$/m);
  assert.match(patch, /^\s+allowSystemBrowser: true$/m);
});

test('legacy login UI and identity names are absent from active source surfaces', async () => {
  const active = [
    'src', 'types', 'scripts', 'test', 'profile', 'README.md', 'AGENTS.md',
    'package.json', 'consistency.json', 'docs/API.md', 'docs/SECURITY.md',
  ];
  const legacyPattern = [
    ['plugin', 'identity'].join('-'),
    ['hanamesh', 'identity'].join('_'),
    ['hanamesh', 'Identity'].join(''),
    ['/api/hanamesh', 'identity'].join('/'),
    ['/hanamesh', 'identity'].join('/'),
    ['index', 'inject'].join('-'),
    ['identity', 'Origin'].join(''),
    ['Identity', 'Controller'].join(''),
    ['Identity', 'ClientService'].join(''),
  ].join('|');
  const pattern = new RegExp(legacyPattern, 'u');
  const matches = [];
  async function scan(path) {
    if (path === 'test/stage0.test.mjs') return;
    const entries = await readdir(path, {withFileTypes: true}).catch(error => {
      if (error.code === 'ENOTDIR') return null;
      throw error;
    });
    if (entries) {
      for (const entry of entries) {
        const child = join(path, entry.name);
        if (entry.isDirectory()) await scan(child);
        else if (entry.isFile()) await scan(child);
      }
    } else if (pattern.test(await readFile(path, 'utf8'))) matches.push(path);
  }
  for (const path of active) await scan(path);
  assert.deepEqual(matches, [], `legacy names found in ${matches.join(', ')}`);
  await assert.rejects(access('src/view.ts'));
  await assert.rejects(access('src/ui/login.js'));
});

test('consistency declaration is renamed to core', async () => {
  const consistency = await readJson('consistency.json');
  assert.equal(consistency.module, 'hanamesh-core');
  assert.equal(consistency.groups.length, 2);
  assert.equal(consistency.boundaries.length, 1);
  assert.match(consistency.groups[0].medium, /^storage-domain:hanamesh_core$/);
  assert.match(consistency.groups[1].medium, /^storage-domain:hanamesh_core_health$/);
});

test('settings about text matches package and describes support instead of a guessed running host', async () => {
  const pkg = await readJson('package.json');
  const client = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8');
  assert.ok(client.includes(`const CORE_VERSION = '${pkg.version}';`));
  assert.ok(client.includes('hanamesh-core ${CORE_VERSION} · 支持 DSH 0.2.x'));
  assert.ok(!client.includes('· DSH 0.2.1-alpha.2'));
});

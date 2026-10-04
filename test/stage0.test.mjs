import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, access} from 'node:fs/promises';

const readJson = async path => JSON.parse(await readFile(path, 'utf8'));

test('Core installs independently and pins its public official host peers', async () => {
  const pkg = await readJson('package.json');
  assert.equal(pkg.name, 'hanamesh-core');
  assert.equal(pkg.private, undefined);
  assert.equal(pkg.license, 'MIT');
  assert.deepEqual(pkg.dependencies ?? {}, {});
  assert.equal(pkg.dsh.bundle.patch, './profile/cordis.patch.yml');
  for (const [name, version] of Object.entries(pkg.peerDependencies)) {
    if (name.startsWith('@deepseek-ai/')) assert.equal(version, name.endsWith('/cordis') ? '4.0.4' : '0.2.0-rc.2');
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
  const {spawnSync} = await import('node:child_process');
  const result = spawnSync('rg', [
    '-n',
    legacyPattern,
    ...active,
    '-g', '!docs/acceptance/**',
    '-g', '!test/stage0.test.mjs',
  ], {encoding: 'utf8'});
  assert.equal(result.status, 1, result.stdout + result.stderr);
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

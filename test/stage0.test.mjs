import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, access} from 'node:fs/promises';

const readJson = async path => JSON.parse(await readFile(path, 'utf8'));

test('package metadata exposes the core bundle and only the two suite dependencies', async () => {
  const pkg = await readJson('package.json');
  assert.equal(pkg.name, 'hanamesh-core');
  assert.equal(pkg.version, '0.2.0-rc.11');
  assert.equal(pkg.private, undefined);
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.repository?.url, 'https://github.com/yzsnstotz/hanamesh-core.git');
  assert.deepEqual(pkg.dependencies, {
    'hanamesh-usage': '0.2.0-rc.4',
    '@hanamesh/dsh-app-host': '0.1.0-rc.14',
  });
  assert.equal(pkg.dsh?.bundle?.patch, './profile/cordis.patch.yml');
  assert.ok(pkg.exports?.['./contract']);
  assert.equal(pkg.peerDependencies?.['@hanamesh/ui-kit'], undefined);
  assert.equal(pkg.peerDependencies?.['@deepseek-ai/dsh-host-webserver'], undefined);
  assert.match(await readFile('lib/client/index.js', 'utf8'), new RegExp(`hanamesh-core ${pkg.version.replaceAll('.', '\\.')}`));
});

test('real-host boot uses a clean allowlisted environment', async () => {
  const script = await readFile('scripts/p1/boot.sh', 'utf8');
  assert.match(script, /nohup env -i/);
  assert.match(script, /HOME="\$HOME"/);
  assert.match(script, /DSH_HOME="\$DSH_HOME"/);
});

test('suite patch declares one insert containing the three canonical ids', async () => {
  const patch = await readFile('profile/cordis.patch.yml', 'utf8');
  assert.equal((patch.match(/^- insert:/gm) ?? []).length, 1);
  assert.deepEqual([...patch.matchAll(/^\s+- id: (hanamesh-[a-z-]+)$/gm)].map(match => match[1]), [
    'hanamesh-core',
    'hanamesh-usage',
    'hanamesh-app-host',
  ]);
  assert.match(patch, /name: '@hanamesh\/dsh-app-host'$/m); // package root: pinned dsh-client-modules only discovers ./client for a root loader entry (P3-DIFF 2026-09-19)
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

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, access} from 'node:fs/promises';

const devkitSource = 'git+https://github.com/yzsnstotz/hanamesh-server-shared.git#semver:^0.2.0&path:/packages/devkit';
test('Core private source closure uses published ranges and keeps developer tooling out of public runtime peers', async () => {
  const root = JSON.parse(await readFile('package.json','utf8'));
  assert.equal(root.devDependencies['@hanamesh/devkit'], devkitSource);
  for (const section of ['dependencies','peerDependencies','optionalDependencies']) assert.equal(root[section]?.['@hanamesh/devkit'], undefined);
  assert.equal(root.peerDependenciesMeta?.['@hanamesh/devkit'], undefined);
  await assert.rejects(access('vendor/hanamesh-devkit-0.1.0-rc.1.tgz'));
  await assert.rejects(access('vendor/DEVKIT.sha256'));
  await assert.rejects(access('vendor/hanamesh-ui-kit-0.1.0-rc.3.tgz'));
  assert.equal(JSON.parse(await readFile('deps/LOCKS.json','utf8')).uiKit, undefined);
  // HM-4: semver is a normal runtime dependency; the vendored copy and the old host-api snapshot are archived.
  assert.deepEqual(root.dependencies, {semver: '7.7.2', tar: '7.5.22'});
  // Tests own their fixtures: no contract package in any dependency section, and no separate contract-check install root.
  for (const section of ['dependencies','devDependencies','peerDependencies','optionalDependencies']) assert.equal(root[section]?.['@hanamesh/api-contracts'], undefined, section);
  assert.doesNotMatch(await readFile('pnpm-lock.yaml','utf8'), /api-contracts/);
  await assert.rejects(access('contract-tests/identity'));
  assert.doesNotMatch(JSON.stringify(root.scripts), /contract-tests|api-contracts/);
  assert.ok(!root.files.some(path => path.startsWith('vendor/')));
  await assert.rejects(access('vendor/semver'));
  await assert.rejects(access('vendor/host-api'));
  await assert.rejects(access('deps/HOST_API.sha256.json'));
  await access('docs/archive/host-api-dsh-0.1.5-alpha.1/HOST_API.sha256.json');
  assert.match(await readFile('src/health/evaluate.ts','utf8'), /^import semver from 'semver';$/m);
  for(const section of ['dependencies','devDependencies','peerDependencies','optionalDependencies']) {
    for(const [name,spec] of Object.entries(root[section] ?? {})) {
      if(name.startsWith('@hanamesh/') || name.startsWith('hanamesh-')) assert.match(spec,/^git\+https:\/\/github\.com\/yzsnstotz\/.+\.git#semver:\^/u,`package.json:${section}:${name}`);
    }
  }
});

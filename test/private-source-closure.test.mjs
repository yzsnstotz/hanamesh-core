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
  for(const path of ['package.json','contract-tests/identity/package.json']) {
    const pkg=JSON.parse(await readFile(path,'utf8'));
    for(const section of ['dependencies','devDependencies','peerDependencies','optionalDependencies']) {
      for(const [name,spec] of Object.entries(pkg[section] ?? {})) {
        if(name.startsWith('@hanamesh/') || name.startsWith('hanamesh-')) assert.match(spec,/^git\+https:\/\/github\.com\/yzsnstotz\/.+\.git#semver:\^/u,`${path}:${section}:${name}`);
      }
    }
  }
});

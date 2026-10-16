import {readFile, writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
export async function generateSuiteManifest({verify = false} = {}) {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const profile = JSON.parse(await readFile('profile/suite.profile.json', 'utf8'));
  const repository = value => value.replace(/^git\+/, '').replace(/\.git\/?$/, '').replace(/\/$/, '');
  assert.equal(profile.version, pkg.version);
  assert.equal(profile.components.length, 2);
  const manifest = {schemaVersion: 1, id: profile.id, core: {name: pkg.name, version: pkg.version, repository: repository(pkg.repository.url)}, components: profile.components.map(({id, moduleName, versionRange, repository: source}) => {
    assert.equal(typeof source, 'string');
    return {id, moduleName, versionRange, repository: repository(source)};
  })};
  if (verify) {
    assert.deepEqual(pkg.hanameshSuite, manifest, 'PACKAGE_SUITE_MANIFEST_DRIFT');
    assert.deepEqual(JSON.parse(await readFile('profile/suite.manifest.json', 'utf8')), manifest, 'PUBLIC_SUITE_MANIFEST_DRIFT');
  } else {
    await writeFile('profile/suite.manifest.json', JSON.stringify(manifest, null, 2) + '\n');
    await writeFile('package.json', JSON.stringify({...pkg, hanameshSuite: manifest}, null, 2) + '\n');
  }
}

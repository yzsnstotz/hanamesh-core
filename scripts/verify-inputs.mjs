import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const root = JSON.parse(await readFile('package.json', 'utf8'));
assert.deepEqual(root.dependencies, {semver: '7.7.2'});
const semverPackage = JSON.parse(await readFile(createRequire(import.meta.url).resolve('semver/package.json'), 'utf8'));
assert.equal(semverPackage.version, '7.7.2');
console.log(JSON.stringify({event: 'inputs_verified', semver: semverPackage.version}));

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import {load} from 'js-yaml';
import {generateSuiteManifest} from './suite-manifest.mjs';
await generateSuiteManifest({verify: true});
const root = JSON.parse(await readFile('package.json', 'utf8'));
assert.deepEqual(root.dependencies, {semver: '7.7.2', tar: '7.5.22'});
const semverPackage = JSON.parse(await readFile(createRequire(import.meta.url).resolve('semver/package.json'), 'utf8'));
assert.equal(semverPackage.version, '7.7.2');
console.log(JSON.stringify({event: 'inputs_verified', semver: semverPackage.version}));

const tarPackage = JSON.parse(await readFile(createRequire(import.meta.url).resolve('tar/package.json'), 'utf8'));
assert.equal(tarPackage.version, '7.5.22');
assert.equal(tarPackage.license, 'BlueOak-1.0.0');

const patch = load(await readFile(root.dsh.bundle.patch, 'utf8'));
assert.equal(patch[0].insert.length, 1);
assert.equal(patch[0].insert[0].id, 'hanamesh-core');
assert.equal(patch[0].insert[0].name, root.name);

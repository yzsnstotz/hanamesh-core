import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const digest = data => createHash('sha256').update(data).digest('hex');
const {IDENTITY_PROTOCOL_VERSION, identityPackage} = await import('../contract-tests/identity/source.mjs');
assert.equal(IDENTITY_PROTOCOL_VERSION, '1');
const files = JSON.parse(await readFile('deps/HOST_API.sha256.json', 'utf8'));
for (const [file, expected] of Object.entries(files)) assert.equal(digest(await readFile(file)), expected, file);
const semverRows = (await readFile('vendor/SHA256SUMS', 'utf8')).trim().split('\n');
for (const row of semverRows) {
  const match = /^([a-f0-9]{64})  (vendor\/semver\/.+)$/.exec(row);
  assert.ok(match, row);
  assert.equal(digest(await readFile(match[2])), match[1], match[2]);
}
console.log(JSON.stringify({event: 'inputs_verified', hostApi: Object.keys(files).length, srvIdentity: {source: "installed published git tag", packageVersion: identityPackage.version}, semver: semverRows.length > 0}));

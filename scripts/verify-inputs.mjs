import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const locks = JSON.parse(await readFile('deps/LOCKS.json', 'utf8'));
const digest = data => createHash('sha256').update(data).digest('hex');
assert.equal(digest(await readFile(locks.srvIdentity.artifact)), locks.srvIdentity.sha256);
assert.equal(digest(await readFile('vendor/srv-identity/contracts.d.ts')), locks.srvIdentity.contractsSha256);
const files = JSON.parse(await readFile('deps/HOST_API.sha256.json', 'utf8'));
for (const [file, expected] of Object.entries(files)) assert.equal(digest(await readFile(file)), expected, file);
const semverRows = (await readFile('vendor/SHA256SUMS', 'utf8')).trim().split('\n');
for (const row of semverRows) {
  const match = /^([a-f0-9]{64})  (vendor\/semver\/.+)$/.exec(row);
  assert.ok(match, row);
  assert.equal(digest(await readFile(match[2])), match[1], match[2]);
}
// Real sibling artifacts (STATUS §5 registered digests): hanamesh-usage 0.2.0-rc.6, @hanamesh/dsh-app-host 0.1.0-rc.21.
const siblingRows = (await readFile('vendor/siblings/SHA256SUMS', 'utf8')).trim().split('\n');
assert.equal(siblingRows.length, 3);
for (const row of siblingRows) {
  const match = /^([a-f0-9]{64})  (hanamesh-usage-0\.2\.0-rc\.6\.tgz|hanamesh-dsh-app-host-0\.1\.0-rc\.21\.tgz|hanamesh-lib-provision-0\.1\.0-rc\.1\.tgz)$/.exec(row);
  assert.ok(match, row);
  assert.equal(digest(await readFile(`vendor/siblings/${match[2]}`)), match[1], match[2]);
}
console.log(JSON.stringify({event: 'inputs_verified', hostApi: Object.keys(files).length, srvIdentity: true, semver: semverRows.length > 0, siblings: siblingRows.length}));

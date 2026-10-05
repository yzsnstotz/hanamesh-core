import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
export async function validateCoreEnvironment() {
assert.equal(createHash('sha256').update(await readFile('vendor/hanamesh-devkit-0.1.0-rc.1.tgz')).digest('hex'), '3cf0b621ca2950fbe21c114d5b31ac1a55f97a67eb0a2dada77fb2d3bf2cb6ff');
assert.equal(await readFile('vendor/DEVKIT.sha256', 'utf8'), '3cf0b621ca2950fbe21c114d5b31ac1a55f97a67eb0a2dada77fb2d3bf2cb6ff  hanamesh-devkit-0.1.0-rc.1.tgz\n');
const commands = [['dsh', ['--version']], ['psql', ['--version']]];
for (const [command, args] of commands) {
  const result = spawnSync(command, args, {encoding: 'utf8'});
  console.log(JSON.stringify({command: [command, ...args].join(' '), exit: result.status, output: result.stdout?.trim() || null, error: result.error?.code || null}));
}
for (const path of ['work/projects/hanamesh/hanamesh-dsh-runtime', 'work/projects/hanamesh/hanamesh-ui-kit', 'work/Docs/Projects/hanamesh/research/dsh-greenfield-2026-09-09/upstream', 'work/Docs/Projects/hanamesh/research/dsh-greenfield-2026-09-09/rt']) {
  console.log(JSON.stringify({path: '~/' + path, exists: existsSync(homedir() + '/' + path)}));
}
console.log(JSON.stringify({os: process.platform, arch: process.arch, userProfileAccessed: false, userPort3080Accessed: false, databaseAccessed: false}));

}

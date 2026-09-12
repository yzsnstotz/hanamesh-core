import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
const commands = [['node', ['--version']], ['pnpm', ['--version']], ['tsc', ['--version']], ['dsh', ['--version']], ['psql', ['--version']]];
for (const [command, args] of commands) {
  const result = spawnSync(command, args, {encoding: 'utf8'});
  console.log(JSON.stringify({command: [command, ...args].join(' '), exit: result.status, output: result.stdout?.trim() || null, error: result.error?.code || null}));
}
for (const path of ['work/projects/hanamesh/hanamesh-dsh-runtime', 'work/projects/hanamesh/hanamesh-ui-kit', 'work/Docs/Projects/hanamesh/research/dsh-greenfield-2026-09-09/upstream', 'work/Docs/Projects/hanamesh/research/dsh-greenfield-2026-09-09/rt']) {
  console.log(JSON.stringify({path: '~/' + path, exists: existsSync(homedir() + '/' + path)}));
}
console.log(JSON.stringify({os: process.platform, arch: process.arch, userProfileAccessed: false, userPort3080Accessed: false, databaseAccessed: false}));

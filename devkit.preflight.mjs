import {checkConsumer} from '@hanamesh/devkit/contract';
import requirement from '@hanamesh/devkit/contract/fixtures/consumer.json' with {type: 'json'};
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
/** Extra source probes are caller-supplied; no research checkout is implicit. */
export async function validateCoreEnvironment({sourcePaths = []} = {}) {
console.log(JSON.stringify({event: 'devkit_source_contract', ...checkConsumer({consumerRoot: process.cwd(), requirement})}));
const commands = [['dsh', ['--version']], ['psql', ['--version']]];
for (const [command, args] of commands) {
  const result = spawnSync(command, args, {encoding: 'utf8'});
  console.log(JSON.stringify({command: [command, ...args].join(' '), exit: result.status, output: result.stdout?.trim() || null, error: result.error?.code || null}));
}
for (const path of ['work/projects/hanamesh/hanamesh-dsh-runtime', 'work/projects/hanamesh/hanamesh-ui-kit']) {
  console.log(JSON.stringify({path: '~/' + path, exists: existsSync(homedir() + '/' + path)}));
}
for (const path of sourcePaths) console.log(JSON.stringify({path, exists: existsSync(path)}));
console.log(JSON.stringify({os: process.platform, arch: process.arch, userProfileAccessed: false, userPort3080Accessed: false, databaseAccessed: false}));

}

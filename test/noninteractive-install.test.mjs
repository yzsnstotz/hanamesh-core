import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

for (const [label, config] of [
  ['Core', new URL('../pnpm-workspace.yaml', import.meta.url)],
]) {
  test(`${label} reinstalls modules from a different store without CI or a TTY`, async t => {
    const root = await mkdtemp(join(tmpdir(), 'hm-core-install-'));
    t.after(() => rm(root, {recursive: true, force: true}));
    for (const name of ['home', 'dsh-home', 'dependency']) await mkdir(join(root, name));
    await writeFile(join(root, 'package.json'), JSON.stringify({name: 'core-install-probe', private: true, packageManager: 'pnpm@10.33.0', dependencies: {'local-probe': 'file:./dependency'}}));
    await writeFile(join(root, 'dependency/package.json'), JSON.stringify({name: 'local-probe', version: '1.0.0', main: 'index.js'}));
    await writeFile(join(root, 'dependency/index.js'), 'module.exports = 42;\n');
    const settings = await readFile(config, 'utf8').catch(error => {
      if (error.code === 'ENOENT') return '';
      throw error;
    });
    await writeFile(join(root, 'pnpm-workspace.yaml'), settings);
    await writeFile(join(root, 'user.npmrc'), '');
    const env = {PATH: process.env.PATH, HOME: join(root, 'home'), DSH_HOME: join(root, 'dsh-home'), TMPDIR: root, NPM_CONFIG_USERCONFIG: join(root, 'user.npmrc')};
    const install = (store, frozen = false) => spawnSync('pnpm', ['install', '--offline', '--store-dir', join(root, store), ...(frozen ? ['--frozen-lockfile'] : [])], {cwd: root, env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']});
    const first = install('store-a');
    assert.equal(first.status, 0, first.stdout + first.stderr);
    const second = install('store-b', true);
    assert.equal(second.status, 0, second.stdout + second.stderr);
    assert.doesNotMatch(second.stdout + second.stderr, /ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY/);
    const value = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(require("local-probe")))'], {cwd: root, env, encoding: 'utf8'});
    assert.equal(value.status, 0, value.stderr);
    assert.equal(value.stdout, '42');
  });
}

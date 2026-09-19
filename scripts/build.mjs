import { spawnSync } from 'node:child_process';
import { cp, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
const compiler = process.env.HM_TSC || 'tsc';
const version = spawnSync(compiler, ['--version'], {encoding: 'utf8'});
const pnpm = spawnSync('pnpm', ['--version'], {encoding: 'utf8'});
console.log(JSON.stringify({node: process.version, platform: process.platform, arch: process.arch,
  typescript: version.stdout?.trim() || null, pnpm: pnpm.stdout?.trim() || null, mode: process.argv[2]}));
if (process.argv.includes('--target') && (process.version !== 'v24.13.1' || version.stdout?.trim() !== 'Version 5.9.3' || pnpm.stdout?.trim() !== '10.33.0')) {
  console.error('TARGET_TOOLCHAIN_MISMATCH: Node 24.13.1, TypeScript 5.9.3 and pnpm 10.33.0 are required.'); process.exit(2);
}
if (version.error || version.status !== 0) { console.error('TYPESCRIPT_EXECUTABLE_MISSING'); process.exit(2); }
await rm('lib', {recursive: true, force: true});
const result = spawnSync(compiler, ['-p', 'tsconfig.json'], {stdio: 'inherit'});
if (result.status !== 0) process.exit(result.status ?? 1);
await cp('src/dsh.mjs', 'lib/dsh.mjs');
await rm('.build/client-cjs', {recursive: true, force: true});
const clientResult = spawnSync(compiler, ['-p', 'tsconfig.client.json'], {stdio: 'inherit'});
if (clientResult.status !== 0) process.exit(clientResult.status ?? 1);
const clientCode = await readFile('.build/client-cjs/client/index.js', 'utf8');
const packageInfo = JSON.parse(await readFile('package.json', 'utf8'));
const clientBundle = `/* Generated from strictly checked HanaMesh core client source. React is host-supplied. */\nwindow.__ModuleLoader__.load({id:${JSON.stringify(packageInfo.name)},factory:function(require){'use strict';const module={exports:{}};const exports=module.exports;(function(module,exports,require){\n${clientCode}\n})(module,exports,require);return module.exports;}});\n`;
await mkdir('lib/client', {recursive: true});
await writeFile('lib/client.js', clientBundle);
for (const file of ['lib/dsh.mjs', 'lib/client.js']) {
  const syntax = spawnSync(process.execPath, ['--check', file], {stdio: 'inherit'});
  if (syntax.status !== 0) process.exit(syntax.status ?? 1);
}
if (process.argv.includes('--target')) {
  const host = spawnSync(compiler, ['-p', 'tsconfig.host.json'], {stdio: 'inherit'});
  if (host.status !== 0) process.exit(host.status ?? 1);
}
console.log('Compiled portable TypeScript; checked adapter JavaScript syntax. Host type gate is separate from offline compilation.');

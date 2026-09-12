import { spawnSync } from 'node:child_process';
import { cp, mkdir } from 'node:fs/promises';
const compiler = process.env.HM_TSC || 'tsc';
const version = spawnSync(compiler, ['--version'], {encoding: 'utf8'});
const pnpm = spawnSync('pnpm', ['--version'], {encoding: 'utf8'});
console.log(JSON.stringify({node: process.version, platform: process.platform, arch: process.arch,
  typescript: version.stdout?.trim() || null, pnpm: pnpm.stdout?.trim() || null, mode: process.argv[2]}));
if (process.argv.includes('--target') && (process.version !== 'v24.13.1' || version.stdout?.trim() !== 'Version 5.9.3' || pnpm.stdout?.trim() !== '10.33.0')) {
  console.error('TARGET_TOOLCHAIN_MISMATCH: Node 24.13.1, TypeScript 5.9.3 and pnpm 10.33.0 are required.'); process.exit(2);
}
if (version.error || version.status !== 0) { console.error('TYPESCRIPT_EXECUTABLE_MISSING'); process.exit(2); }
const result = spawnSync(compiler, ['-p', 'tsconfig.json'], {stdio: 'inherit'});
if (result.status !== 0) process.exit(result.status ?? 1);
await mkdir('lib/ui', {recursive: true});
await cp('src/dsh.mjs', 'lib/dsh.mjs'); await cp('src/ui/login.js', 'lib/ui/login.js');
for (const file of ['lib/dsh.mjs', 'lib/ui/login.js']) {
  const syntax = spawnSync(process.execPath, ['--check', file], {stdio: 'inherit'});
  if (syntax.status !== 0) process.exit(syntax.status ?? 1);
}
if (process.argv.includes('--target')) {
  const host = spawnSync(compiler, ['-p', 'tsconfig.host.json'], {stdio: 'inherit'});
  if (host.status !== 0) process.exit(host.status ?? 1);
}
console.log('Compiled portable TypeScript; checked adapter/UI JavaScript syntax. Host type gate is separate from offline compilation.');

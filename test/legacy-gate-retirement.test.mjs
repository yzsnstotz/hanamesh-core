import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

test('retire the private S06 runner while retaining independent public and lifecycle entries', () => {
  assert.equal(existsSync(new URL('../scripts/o3/s06.mjs', import.meta.url)), false, 'private S06 runner must remain retired')
  for (const file of ['scripts/p1/verdaccio.sh', 'scripts/p1/publish.sh', 'scripts/p1/boot.sh', 'scripts/o3/t10.sh']) {
    assert(existsSync(new URL('../' + file, import.meta.url)), 'preserve independent entry: ' + file)
  }
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.bin['hanamesh-core-agent'], './lib/agent-cli.js')
  assert.equal(pkg.bin['hanamesh-core-contract-suite'], './lib/contract-cli.js')
  assert(!JSON.stringify(pkg.scripts).includes('scripts/o3/s06.mjs'))
})

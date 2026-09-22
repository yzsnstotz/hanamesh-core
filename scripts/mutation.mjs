import assert from 'node:assert/strict';
import {cp, mkdtemp, readFile, rm, writeFile, mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';

const evidence = resolve('docs/acceptance/mutations');
await mkdir(evidence, {recursive: true});
const production = new Map();
for (const file of ['dsh.mjs', 'device.js', 'registration.js', 'controller.js', 'health/evaluate.js']) production.set(file, await readFile(join('lib', file), 'utf8'));

function execute(testFile, env = {}) {
  return spawnSync(process.execPath, ['--test', '--test-reporter=tap', testFile], {env: {...process.env, ...env}, encoding: 'utf8', timeout: 20_000});
}

const baseline = execute('test/device.test.mjs');
const baselineOutput = (baseline.stdout ?? '') + (baseline.stderr ?? '');
await writeFile(join(evidence, 'baseline.tap'), baselineOutput);
assert.equal(baseline.status, 0, baselineOutput);

const root = await mkdtemp(join(tmpdir(), 'hm-core-mutation-'));
try {
  const tempLib = join(root, 'lib');
  await cp('lib', tempLib, {recursive: true});
  await cp('profile', join(root, 'profile'), {recursive: true});
  await mkdir(join(root, 'vendor'), {recursive: true});
  await cp('vendor/semver', join(root, 'vendor/semver'), {recursive: true});
  await writeFile(join(root, 'package.json'), '{"type":"module"}');
  const mutants = [
    {
      name: 'domain-name', file: 'dsh.mjs',
      mutate: code => code.replace("name: 'hanamesh_core'", "name: 'hanamesh-core'"),
      run: () => execute(resolve('test/adapter.test.mjs'), {HM_TEST_LIB: tempLib, HM_ADAPTER_EVIDENCE: 'none'}),
    },
    {
      name: 'device-integrity', file: 'device.js',
      mutate: code => code.replace('if (!derivedRaw.equals(raw) || derivedId !== device.deviceId)', 'if (false)'),
      probe: `import test from 'node:test';import assert from 'node:assert/strict';import {createDevice,signWithDevice} from './lib/device.js';test('corrupt device rejected',()=>{const d={...createDevice(),publicKey:Buffer.alloc(32,7).toString('base64url')};assert.throws(()=>signWithDevice(d,new Uint8Array([1])),e=>e?.code==='CORE_DEVICE_CORRUPT');});`,
    },
    {
      name: 'registration-device-id', file: 'registration.js',
      mutate: code => code.replace('if (result.deviceId !== device.deviceId)', 'if (false)'),
      probe: `import test from 'node:test';import assert from 'node:assert/strict';import {createDevice} from './lib/device.js';import {registerDevice} from './lib/registration.js';test('mismatch rejected',async()=>{const d=createDevice();let n=0;const t={request:async()=>++n===1?Response.json({nonce:'n',expiresAt:'x'}):Response.json({deviceId:d.deviceId+'x',principalId:'p'},{status:201})};await assert.rejects(registerDevice(t,d),e=>e?.code==='CORE_DEVICE_ID_MISMATCH');});`,
    },
    {
      name: 'registration-reverse-order', file: 'controller.js',
      mutate: code => code.replace(
        'const result = await registerDevice(this.#transport, this.#device());',
        "await this.#publish({ ...this.#state, revision: this.#state.revision + 1, registration: { status: 'registered', principalId: 'premature', registeredAt: checkedAt, lastError: null, attempts } });\n            const result = await registerDevice(this.#transport, this.#device());",
      ),
      probe: `import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {SessionController} from './lib/controller.js';import {INITIAL_CORE_SNAPSHOT} from './lib/contracts.js';test('no premature registered publication',async()=>{let value=structuredClone(INITIAL_CORE_SNAPSHOT);const pubs=[];let requested;const seen=new Promise(r=>requested=r);let release;const gate=new Promise(r=>release=r);let calls=0;const store={read:()=>structuredClone(value),publish:async next=>{value=structuredClone(next);pubs.push(value)},close:async()=>{}};const c=await SessionController.create({serverOrigin:'https://server.example',websiteOrigin:null},store,{fetcher:async(_url,init)=>{if(++calls===1)return Response.json({nonce:'n',expiresAt:'x'});requested();const raw=Buffer.from(JSON.parse(init.body).publicKey,'base64url');await gate;return Response.json({deviceId:createHash('sha256').update(raw).digest('base64url'),principalId:'p'},{status:201})}});const pending=c.register();await seen;const premature=pubs.some(x=>x.registration.status==='registered');release();await pending;assert.equal(premature,false);});`,
    },
    {
      name: 'health-repair-priority', file: 'health/evaluate.js',
      mutate: code => code.replace("['damaged', 'unreadable', 'failed', 'ambiguous']", "['unreadable', 'failed', 'ambiguous']"),
      probe: `import test from 'node:test';import assert from 'node:assert/strict';import {evaluate} from './lib/health/evaluate.js';const p={schemaVersion:1,id:'suite',version:'1.0.0',label:'Suite',runningTaskPolicy:'preserve-and-pause',components:[{id:'x',moduleName:'x',label:'X',versionRange:'1.0.0',onFailure:'notice',impact:'none'}]};test('damage repairs',()=>assert.equal(evaluate(p,[{kind:'damaged'}],1).mode,'repair'));`,
    },
    {
      name: 'points-prompt-once', file: 'controller.js',
      mutate: code => code.replace("const show = points.pendingTotal > 0 && this.#bound !== true && shownAt === null;", 'const show = true;'),
      probe: `import test from 'node:test';import assert from 'node:assert/strict';import {SessionController} from './lib/controller.js';import {INITIAL_CORE_SNAPSHOT} from './lib/contracts.js';test('bind prompt shows at most once',async()=>{let value=structuredClone(INITIAL_CORE_SNAPSHOT);const store={read:()=>structuredClone(value),publish:async next=>{value=structuredClone(next)},close:async()=>{}};const c=await SessionController.create({serverOrigin:null,websiteOrigin:null},store);await c.markPointsPromptShown();const seen=JSON.parse(JSON.stringify(await c.points()));assert.equal(seen.prompt.show,false);});`,
    },
  ];
  for (const mutant of mutants) {
    const target = join(tempLib, mutant.file);
    const original = production.get(mutant.file);
    const changed = mutant.mutate(original);
    assert.notEqual(changed, original, `${mutant.name} mutation must apply`);
    await writeFile(target, changed);
    let testFile;
    if (mutant.probe) { testFile = join(root, `${mutant.name}.test.mjs`); await writeFile(testFile, mutant.probe); }
    const result = mutant.run ? mutant.run() : execute(testFile);
    const output = (result.stdout ?? '') + (result.stderr ?? '');
    await writeFile(join(evidence, `${mutant.name}.tap`), output);
    assert.notEqual(result.status, 0, `${mutant.name} must fail`);
    assert.match(output, /ERR_ASSERTION/);
    assert.match(output, /not ok/);
    assert.doesNotMatch(output, /ERR_MODULE_NOT_FOUND|SyntaxError/);
    console.log(JSON.stringify({mutant: mutant.name, mutantExit: result.status, assertionFailure: true}));
    await writeFile(target, original);
  }
} finally { await rm(root, {recursive: true, force: true}); }

for (const [file, bytes] of production) assert.equal(await readFile(join('lib', file), 'utf8'), bytes, `${file} production copy untouched`);

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {formatSuiteInstallCommand} from '../lib/suite/index.js';
test('A2 public npm metadata carries the Core command for this exact bundle release',async()=>{
 const core=JSON.parse(await readFile(new URL('../package.json',import.meta.url)));
 const bundle=JSON.parse(await readFile(new URL('../packages/hanamesh/package.json',import.meta.url)));
 assert.deepEqual(core.hanameshSuiteInstall,{name:bundle.name,version:bundle.version,command:formatSuiteInstallCommand(bundle.version)});
});

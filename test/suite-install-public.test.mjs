import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as suite from '@hanamesh/core/suite';

test('Core metadata and its public suite export do not advertise aggregate installation',async()=>{
 const core=JSON.parse(await readFile(new URL('../package.json',import.meta.url)));
 assert.equal(Object.hasOwn(core,'hanameshSuiteInstall'),false);
 for(const helper of ['formatSuiteInstallCommand','suiteInstallArgs','createSuiteInstallRelease'])
   assert.equal(Object.hasOwn(suite,helper),false,helper);
});

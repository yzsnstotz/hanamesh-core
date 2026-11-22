import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {formatSuiteInstallCommand, suiteInstallArgs, createSuiteInstallRelease} from '../lib/suite/index.js';
test('Core metadata does not advertise the retired aggregate install command',async()=>{
 const core=JSON.parse(await readFile(new URL('../package.json',import.meta.url)));
 assert.equal(Object.hasOwn(core,'hanameshSuiteInstall'),false);
});

test('one public definition owns rendered command and executable argv, including the chosen source and profile',()=>{
 const options={profile:'work',registry:'https://registry.example.test/'};
 const args=suiteInstallArgs('0.1.3',options);
 assert.deepEqual(args,['plugin','--profile','work','add','--save-exact','--registry=https://registry.example.test/','@hanamesh/hanamesh@0.1.3']);
 assert.equal(formatSuiteInstallCommand('0.1.3',options),['dsh',...args].join(' '));
 assert.deepEqual(createSuiteInstallRelease('0.1.3',options),{name:'@hanamesh/hanamesh',version:'0.1.3',command:formatSuiteInstallCommand('0.1.3',options),args});
 for(const version of [null,undefined,'latest','^0.1.3','v0.1.3'])assert.throws(()=>suiteInstallArgs(version),{code:'CORE_SUITE_CANDIDATE_INVALID'});
 assert.throws(()=>suiteInstallArgs('0.1.3',{profile:'../owner'}));
 assert.throws(()=>suiteInstallArgs('0.1.3',{registry:'https://user:secret@registry.example.test/'}));
});

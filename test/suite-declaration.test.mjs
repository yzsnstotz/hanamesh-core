import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('published suite declaration is an optional protocol1 capability with one generated manifest',async()=>{
 const pkg=JSON.parse(await readFile('package.json','utf8'));
 assert.ok(pkg.exports['./suite'],'PUBLIC_SUITE_EXPORT_MISSING');
 assert.ok(pkg.hanameshSuite,'PUBLIC_SUITE_METADATA_MISSING');
 const {SUITE_MANIFEST}=await import('hanamesh-core/suite');
 assert.deepEqual(SUITE_MANIFEST,pkg.hanameshSuite);
 const {CORE_OPTIONAL_METHODS,CORE_REQUIRED_METHODS}=await import('../lib/contract.js');
 assert.ok(CORE_OPTIONAL_METHODS.includes('getSuiteDeclaration'),'OPTIONAL_SUITE_METHOD_MISSING');
 assert.ok(!CORE_REQUIRED_METHODS.includes('getSuiteDeclaration'));
});

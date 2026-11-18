import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {components} from '../packages/hanamesh/build.mjs';
test('CL6 bundle owns a fifth independently packaged market plugin alongside Theme',()=>{
 assert(components.some(([role,name])=>role==='market'&&name==='@hanamesh/market'),'bundle builder must require the market source artifact');
});
test('CL6 market follows the independent Theme package convention and supplies a native tab entry',async()=>{
 let pkg;try{pkg=JSON.parse(await readFile('packages/hanamesh-market/package.json','utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 assert.equal(pkg?.name,'@hanamesh/market','market is an independent npm package');assert.equal(pkg.repository.directory,'packages/hanamesh-market');assert.equal(pkg.dsh.bundle.patch,'./cordis.patch.yml');
 const bundle=JSON.parse(await readFile('packages/hanamesh/package.json','utf8'));assert(Object.hasOwn(bundle.dependencies,'@hanamesh/market'));
});

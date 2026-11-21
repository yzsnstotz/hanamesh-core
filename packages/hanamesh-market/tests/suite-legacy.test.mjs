import test from 'node:test';
import assert from 'node:assert/strict';
import {createCoreSuiteAdapter} from '../src/library/suite.js';
import {declaration,core} from './fixtures/core-suite-declaration.mjs';

const names=['@hanamesh/core','@hanamesh/usage','@hanamesh/dsh-app-host'];
const versions=['0.3.24','0.3.0-rc.7','0.6.16'];

for(const status of ['installed','unknown'])test(`DT7 current runtime forwards Core legacy verdict ${status}`,async()=>{
 const reason={code:status==='installed'?'CORE_LEGACY_COMPONENTS_INSTALLED':'CORE_LEGACY_COMPONENTS_UNKNOWN',
  message:'Core 旧套件读回',action:'查看 DSH 安装说明'};
 const components=names.map((name,index)=>({name,version:versions[index],active:true,status:'present'}));
 const blocked=[{code:'CORE_SUITE_CLIENT_PEER_NOT_CONNECTED'}];
 const provider=core({...declaration(),bundleVersion:null,completeness:'unknown',
  legacy:{status,components,issues:[],reason},blocked});
 const result=await createCoreSuiteAdapter({core:()=>provider}).readFacts();
 assert.equal(result.status,status);
 assert.equal(result.version,null);
 assert.equal(result.completeness,'unknown');
 assert.deepEqual(result.components,components);
 assert.deepEqual(result.reason,reason);
 assert.deepEqual(result.blocked,blocked);
});

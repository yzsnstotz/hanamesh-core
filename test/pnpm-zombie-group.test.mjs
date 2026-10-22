import test from 'node:test';
import assert from 'node:assert/strict';
import * as helper from './support/pnpm-process.mjs';
const denied=()=>{throw Object.assign(Error('kill EPERM'),{code:'EPERM'})};
test('owned zombie-only group is terminated; EPERM for a live or unknown group remains a failure',()=>{
 assert.equal(typeof helper.processGroupAlive,'function');
 const base={probe:denied,uid:501};
 assert.equal(helper.processGroupAlive(123,{...base,members:()=>[{pid:123,pgid:123,uid:501,state:'Z'}]}),false);
 assert.throws(()=>helper.processGroupAlive(123,{...base,members:()=>[{pid:123,pgid:123,uid:501,state:'S'}]}),{code:'EPERM'});
 assert.throws(()=>helper.processGroupAlive(123,{...base,members:()=>[{pid:123,pgid:123,uid:0,state:'Z'}]}),{code:'EPERM'});
 assert.throws(()=>helper.processGroupAlive(123,{...base,members:()=>[]}),{code:'EPERM'});
 assert.throws(()=>helper.processGroupAlive(123,{...base,members:()=>{throw Error('PS_UNAVAILABLE')}}),/PS_UNAVAILABLE/);
 assert.equal(helper.processGroupAlive(123,{...base,probe:()=>{throw Object.assign(Error(),{code:'ESRCH'})},members:()=>{throw Error('unexpected ps')}}),false);
});

test('Darwin native EPERM with a valid complete inventory proving this group empty is exited',()=>{
 const other={pid:456,pgid:456,uid:501,state:'S'};
 assert.equal(helper.processGroupAlive(123,{probe:denied,members:()=>[other],uid:501,platform:'darwin'}),false);
 assert.throws(()=>helper.processGroupAlive(123,{probe:denied,members:()=>[other],uid:501,platform:'linux'}),{code:'EPERM'});
 for(const invalid of [[],[{pid:NaN,pgid:NaN,uid:501,state:'S'}]])assert.throws(()=>helper.processGroupAlive(123,{probe:denied,members:()=>invalid,uid:501,platform:'darwin'}),{code:'EPERM'});
});

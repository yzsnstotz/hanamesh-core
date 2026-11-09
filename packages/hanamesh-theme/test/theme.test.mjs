import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {apply,inject,tokens} from '../src/client.js';

test('A palette uses paired website colors, fonts and consumed radius tokens',()=>{
  assert.deepEqual(inject,['theme']);
  assert.deepEqual(tokens['--dsw-alias-bg-base'],{light:'#f4f6fb',dark:'#06080e'});
  assert.deepEqual(tokens['--dsw-alias-label-primary'],{light:'#0d1424',dark:'#eaf0fb'});
  assert.deepEqual(tokens['--dsw-alias-brand-primary'],{light:'#0891b2',dark:'#22d3ee'});
  for(const [key,value] of Object.entries(tokens)){
    assert.match(key,/^--(dsw|dsh)-/);
    assert.equal(typeof value.light,'string'); assert.equal(typeof value.dark,'string');
    assert(value.light.length&&value.dark.length);
  }
  assert.equal(tokens['--dsw-specific-sidebar-fill'].dark,'#0a0e18');
  assert.equal(tokens['--dsw-specific-input-major'].dark,'#0f1422');
  assert.equal(tokens['--dsw-radius-lg'].dark,'18px');
  assert.match(tokens['--dsh-font-family-text-default'].dark,/PingFang SC/);
  assert.match(tokens['--dsh-font-family-code-default'].light,/Menlo/);
});
test('one owning effect retracts precisely its layer without changing theme preference or settings',()=>{
  const calls=[],layers=new Map();let dispose;
  const theme={overrideTokens(source,value){calls.push(source);layers.set(source,value);return()=>layers.delete(source);}};
  layers.set('other-plugin',{keep:true});
  apply({theme,effect(run,label){assert.equal(label,'hanamesh-theme:tokens');dispose=run();}});
  assert.deepEqual(calls,['@hanamesh/theme']);assert.equal(layers.get('@hanamesh/theme'),tokens);
  dispose();assert.equal(layers.has('@hanamesh/theme'),false);assert.deepEqual(layers.get('other-plugin'),{keep:true});
  apply({theme,effect(run){dispose=run();}});assert.equal(layers.size,2);dispose();assert.equal(layers.size,1);
});
test('missing override API is an explicit compatibility failure',()=>{
  assert.throws(()=>apply({theme:{},effect(run){run();}}),/HANAMESH_THEME_API_UNAVAILABLE/);
});
test('packed client factory has no duplicated React or host runtime',async()=>{
  const source=await readFile(new URL('../lib/client.js',import.meta.url),'utf8');let factory;
  runInNewContext(source,{window:{__ModuleLoader__:{load(record){assert.equal(record.id,'@hanamesh/theme');factory=record.factory;}}}});
  const client=factory(()=>{throw Error('UNEXPECTED_RUNTIME_IMPORT');});
  assert.equal(typeof client.apply,'function');assert.equal(String(client.inject),'theme');
});

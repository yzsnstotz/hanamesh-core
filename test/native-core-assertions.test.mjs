import test from 'node:test';
import assert from 'node:assert/strict';
import {SessionController} from '../lib/controller.js';
import {INITIAL_CORE_SNAPSHOT} from '../lib/contracts.js';
import {memoryStore} from './fixtures/core-store.mjs';
import {callExamples} from './fixtures/native-core-observer/call-examples.mjs';
import {assertCallExamples,budgetPhrases} from './fixtures/native-core-assertions.mjs';

// Tests of observer/consumer support against SOURCE. Never a REAL_CLIENT claim.
test('SOURCE provider satisfies the same full call examples that the native observer must execute',async t=>{
  const controller=await SessionController.create({serverOrigin:null,websiteOrigin:null},memoryStore(INITIAL_CORE_SNAPSHOT).store);
  t.after(()=>controller.dispose());
  assertCallExamples(await callExamples(controller.service));
});
test('client example verifier rejects changed signatures, omitted session fields and wrong health',async t=>{
  const controller=await SessionController.create({serverOrigin:null,websiteOrigin:null},memoryStore(INITIAL_CORE_SNAPSHOT).store);
  t.after(()=>controller.dispose());
  const original=await callExamples(controller.service);
  for(const corrupt of [s=>{s.raw.signature=Buffer.alloc(64).toString('base64url');},s=>{s.requests[0].headers['x-hm-signature']=Buffer.alloc(64).toString('base64url');},s=>{delete s.session.reason;},s=>{s.health.mode='unknown';}]) {
    const changed=structuredClone(original);corrupt(changed);assert.throws(()=>assertCallExamples(changed));
  }
});
test('budget projection accepts the actual span without origin, null, flags or the shared path',async t=>{
  const controller=await SessionController.create({serverOrigin:null,websiteOrigin:null,sharedIdentityDir:'/FIXTURE/shared',allowSystemBrowser:false},memoryStore(INITIAL_CORE_SNAPSHOT).store);
  t.after(()=>controller.dispose());
  const actual='请求时限 10000ms；健康检查 3000ms；名称请求时限 1500ms；Hana 行预算 200；响应字节预算 1048576；界面轮询 10000ms；积分刷新 60000ms；贡献刷新 60000ms；活动每次 5 页、显示 25 行；名称并发 4。可在插件配置中修改。';
  for(const phrase of budgetPhrases(controller.state().configuration)) assert.ok(actual.includes(phrase));
  for(const phrase of budgetPhrases({...controller.state().configuration,maxHanaRows:201})) if(phrase.includes('Hana 行预算')) assert.equal(actual.includes(phrase),false);
  assert.doesNotMatch(actual,/null|false|FIXTURE|https?:/);
});

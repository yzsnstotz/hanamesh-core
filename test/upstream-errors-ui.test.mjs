import test from 'node:test';import assert from 'node:assert/strict';import {readFile}from'node:fs/promises';import vm from'node:vm';import ts from'typescript';
test('visible upstream errors name the refusal/status and never call HTTP rejection unreachable',async()=>{
 const sandbox={exports:{},require:name=>{assert.equal(name,'react');return{};}};vm.runInNewContext(ts.transpileModule(await readFile('src/client/index.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);
 assert.equal(typeof sandbox.exports.coreErrorText,'function');const message=sandbox.exports.coreErrorText('IDENTITY_ORIGIN_REJECTED',403);assert.match(message,/服务端拒绝.*来源未被信任.*IDENTITY_ORIGIN_REJECTED.*403/);assert.doesNotMatch(message,/不可达/);
 assert.match(sandbox.exports.coreErrorText('CORE_UPSTREAM_HTTP_ERROR',502),/502/);assert.doesNotMatch(sandbox.exports.coreErrorText('CORE_UPSTREAM_HTTP_ERROR',502),/不可达/);
 assert.match(sandbox.exports.coreErrorText('CORE_UPSTREAM_UNAVAILABLE'),/不可达/);assert.match(sandbox.exports.coreErrorText('CORE_UPSTREAM_RESPONSE_INVALID',200),/响应.*格式/);
});

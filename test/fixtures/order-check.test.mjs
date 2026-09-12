/** Executed separately against durable post-SIGKILL records. */
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {join} from 'node:path';
test('declared cross-medium safety direction',()=>{
  const d=process.env.HM_CRASH_DIR,s=process.env.HM_CRASH_SCENARIO;
  const local=JSON.parse(readFileSync(join(d,'local.json'),'utf8'));
  const remote=JSON.parse(readFileSync(join(d,'remote-fixture.json'),'utf8'));
  if(s==='login') assert.ok(local.status!=='signed_in'||remote.active,'local login completion must follow remote login');
  else assert.ok(local.logoutPending||remote.revoked,'local logout completion must follow remote revocation');
});

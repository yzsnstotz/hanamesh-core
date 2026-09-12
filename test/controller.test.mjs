import test from 'node:test';
import assert from 'node:assert/strict';
import {IdentityController, setup, config, login, A, B, secret, memoryStore, INITIAL_OBSERVATION, deferred, json, cookie} from './fixtures/support.mjs';
const rejectsCode = (promise, code) => assert.rejects(promise, e => e.code === code);
test('five distinct session states; success only after verified principal and durable observation', async () => {
  const {controller, remote, store} = setup(); const states = [];
  controller.subscribe(s => states.push(s.status));
  assert.equal(controller.getState().status, 'signed_out');
  const inFlight = controller.signIn(login);
  assert.equal(controller.getState().status, 'signing_in');
  await inFlight;
  assert.equal(controller.getState().principal.principalId, A);
  assert.equal(store.writes.at(-1).status, 'signed_in');
  assert.equal(controller.getState().protectedOperations, 'resource-check-required');
  remote.unavailable = true;
  await rejectsCode(controller.checkIdentity(), 'AUTH_UNAVAILABLE');
  assert.equal(controller.getState().status, 'unavailable');
  remote.unavailable = false; await controller.checkIdentity();
  await controller.signOut();
  assert.equal(controller.getState().status, 'expired');
  assert.equal(controller.getState().logoutPending, false);
  assert.deepEqual(new Set(states), new Set(['signed_out','signing_in','signed_in','expired','unavailable']));
  await controller.dispose();
});
test('anonymous 401 means identity service reachable, not unavailable', async () => {
  const {controller} = setup();
  assert.deepEqual(await controller.checkIdentity(), {serviceReady:true, authenticated:false, resourceAuthorization:'not-evaluated'});
  assert.equal(controller.getState().status, 'signed_out');
});
test('required-login is configurable and never makes protected APIs anonymous', async () => {
  for (const requiredLogin of [false, true]) {
    const {controller, remote} = setup({requiredLogin});
    assert.equal(controller.service.checkLocalAccess('local').allowed, !requiredLogin);
    assert.equal(controller.service.checkLocalAccess('protected').allowed, false);
    await rejectsCode(controller.request({path:'/v1/identity/me'}), 'AUTH_REQUIRED');
    assert.equal(remote.requests.length, 0);
    assert.equal(controller.service.checkLocalAccess('unknown').allowed, false);
  }
});
test('restored signed_in sidecar is expired and cannot make any authenticated call', async () => {
  const {controller, remote} = setup({}, {...INITIAL_OBSERVATION, status:'signed_in', revision:8, observedAt:new Date().toISOString()});
  assert.equal(controller.getState().status, 'expired'); assert.equal(controller.getState().principal, null);
  await rejectsCode(controller.request({path:'/v1/identity/me'}), 'AUTH_REQUIRED');
  assert.equal(remote.requests.length, 0);
});
test('forged sidecar with principal/token fields is rejected; private data is not deleted', async () => {
  const {controller, store} = setup({}, {...INITIAL_OBSERVATION, principalId:B, token:secret});
  assert.equal(controller.getState().status, 'unavailable');
  assert.equal(controller.getState().reason, 'STORAGE_UNAVAILABLE');
  assert.equal(controller.getState().privateWork, 'preserved'); assert.equal(store.writes.length, 0);
});
test('bad login input never reaches the remote', async () => {
  const {controller, remote} = setup();
  for (const value of [null, {}, {...login,password:'short'}, {...login,role:'admin'}, {...login,email:'x'}]) await rejectsCode(controller.signIn(value), 'IDENTITY_INPUT_INVALID');
  assert.equal(remote.requests.length,0); assert.equal(controller.getState().status,'signed_out');
});
test('login 401 / throttling are distinct from service outage', async () => {
  for (const code of [401,429]) {
    const {controller, remote} = setup(); remote.loginStatus=code;
    await assert.rejects(controller.signIn(login));
    assert.equal(controller.getState().status,'signed_out'); assert.equal(controller.getState().serviceReady,true);
    assert.ok(!JSON.stringify(controller.getState()).includes(secret));
  }
});
test('200 login without an HttpOnly cookie never authenticates', async () => {
  const {controller,remote}=setup(); remote.cookieValue=null;
  await rejectsCode(controller.signIn(login),'UPSTREAM_INVALID_RESPONSE');
  assert.equal(controller.getState().principal,null);
});
test('foreign deployment and unexpected privilege scope are not accepted', async () => {
  const a=setup(); a.remote.deploymentId='other';
  await rejectsCode(a.controller.signIn(login),'IDENTITY_DEPLOYMENT_MISMATCH');
  const b=setup(); b.remote.extraPrincipal={scopes:['admin']};
  await rejectsCode(b.controller.signIn(login),'UPSTREAM_INVALID_RESPONSE');
});
test('A reading B is sent to resource and rejected; identity remains signed in', async () => {
  const {controller,remote}=setup(); await controller.signIn(login);
  await rejectsCode(controller.request({path:'/v1/identity/principals/'+B}),'AUTH_FORBIDDEN');
  assert.equal(remote.requests.at(-1).path,'/v1/identity/principals/'+B);
  assert.equal(remote.requests.at(-1).credentialPresent,true);
  assert.equal(controller.getState().status,'signed_in');
});
test('revoked session is rechecked before each protected request', async () => {
  const {controller,remote}=setup(); await controller.signIn(login); remote.revoked=true;
  const before=remote.requests.length;
  await rejectsCode(controller.request({path:'/v1/identity/principals/'+A}),'AUTH_REQUIRED');
  assert.equal(remote.requests.length,before+1); assert.equal(remote.requests.at(-1).path,'/v1/identity/me');
  assert.equal(controller.getState().status,'expired');
});
test('resource can revoke between identity check and resource request', async () => {
  const {controller,remote}=setup(); await controller.signIn(login); remote.resourceUnauthorized=true;
  await rejectsCode(controller.request({path:'/v1/identity/principals/'+A}),'AUTH_REQUIRED');
  assert.equal(controller.getState().status,'expired');
});
test('outage blocks NEW protected operations without another remote call', async () => {
  const {controller,remote}=setup(); await controller.signIn(login); remote.unavailable=true;
  await rejectsCode(controller.checkIdentity(),'AUTH_UNAVAILABLE'); const before=remote.requests.length;
  await rejectsCode(controller.request({path:'/v1/identity/me'}),'AUTH_UNAVAILABLE');
  assert.equal(remote.requests.length,before); assert.equal(controller.getState().privateWork,'preserved');
  remote.unavailable=false; await controller.checkIdentity(); assert.equal(controller.getState().status,'signed_in');
});
test('unconfirmed sign-out blocks business but allows revocation retry', async () => {
  const {controller,remote}=setup(); await controller.signIn(login); remote.unavailable=true;
  const out=controller.signOut(); assert.equal(controller.getState().principal,null);
  await assert.rejects(out); assert.equal(controller.getState().logoutPending,true);
  await assert.rejects(controller.request({path:'/v1/identity/me'}));
  await rejectsCode(controller.signIn(login),'REVOCATION_UNCONFIRMED');
  remote.unavailable=false; await controller.signOut();
  assert.equal(controller.getState().logoutPending,false); assert.equal(remote.revoked,true);
});
test('cannot confirm an old revocation from a no-op sign-out after restart', async () => {
  const {controller}=setup({}, {...INITIAL_OBSERVATION,status:'expired',logoutPending:true});
  await controller.signOut(); assert.equal(controller.getState().logoutPending,true);
  assert.equal(controller.getState().reason,'REVOCATION_UNCONFIRMED');
});
test('durability failure cannot publish authenticated state', async () => {
  const {controller,store,remote}=setup(); remote.onRequest=async path=>{if(path==='/v1/identity/me')store.fail=true;};
  await rejectsCode(controller.signIn(login),'STORAGE_UNAVAILABLE');
  assert.equal(controller.getState().status,'unavailable'); assert.equal(controller.getState().principal,null);
});
test('storage already closing never prevents remote sign-out', async () => {
  const {controller,store,remote}=setup(); await controller.signIn(login); store.fail=true;
  await rejectsCode(controller.signOut(),'STORAGE_UNAVAILABLE'); assert.equal(remote.revoked,true);
  assert.equal(controller.getState().principal,null); await controller.dispose(); assert.equal(store.closed,1);
});
test('late login response cannot resurrect after sign-out (abort-ignoring fixture)', async () => {
  const {controller,remote}=setup(); const started=deferred(), finish=deferred();
  remote.onRequest=async path=>{if(path==='/api/auth/sign-in/email'){started.resolve();await finish.promise;return json({ok:true},200,{'set-cookie':cookie()});}};
  const inFlight=controller.signIn(login); const rejection=assert.rejects(inFlight,e=>e.code==='OPERATION_SUPERSEDED');
  await started.promise; const out=controller.signOut(); finish.resolve();
  await rejection; await out; assert.notEqual(controller.getState().status,'signed_in');
});
test('late resource response is discarded after logout begins', async () => {
  const {controller,remote}=setup(); await controller.signIn(login); const started=deferred(), finish=deferred();
  remote.onRequest=async path=>{if(path==='/v1/identity/principals/'+A){started.resolve(); await finish.promise;return json({private:'must not escape'});}};
  const request=controller.request({path:'/v1/identity/principals/'+A}); const rejected=assert.rejects(request,e=>e.code==='OPERATION_SUPERSEDED');
  await started.promise; const out=controller.signOut(); finish.resolve(); await rejected; await out;
  assert.equal(controller.getState().principal,null);
});
test('observer exceptions cannot roll back state; SDK is a frozen narrow facade', async () => {
  const {controller}=setup(); controller.subscribe(()=>{throw new Error(secret);}); await controller.signIn(login);
  assert.equal(controller.getState().status,'signed_in');
  assert.deepEqual(Object.keys(controller.service).sort(),['checkIdentity','checkLocalAccess','getState','request','subscribe']);
  assert.throws(()=>{controller.getState().principal.scopes.push('admin');},TypeError);
  assert.throws(()=>{controller.service.token=secret;},TypeError);
  assert.ok(!JSON.stringify(controller.service).includes(secret));
});
test('dispose is idempotent, clears access and does not delete private work', async () => {
  const {controller,store}=setup(); await controller.signIn(login); await controller.dispose(); await controller.dispose();
  assert.equal(store.closed,1); assert.equal(controller.getState().principal,null);
  assert.equal(controller.getState().privateWork,'preserved');
  await rejectsCode(controller.request({path:'/v1/identity/me'}),'DISPOSED');
});
test('resource responses suppress cookies and token-shaped nested fields', async () => {
  const {controller,remote}=setup({protectedPrefixes:['/v1/identity','/v1/catalog']}); await controller.signIn(login);
  const result=await controller.request({path:'/v1/catalog/mine'});
  assert.equal(result.data.echo,'[redacted]'); assert.equal(result.data.nested.token,undefined);
  assert.ok(!JSON.stringify(result).includes(secret));
  assert.equal(remote.requests.at(-1).authorizationPresent,false); assert.equal(remote.requests.at(-1).selfHeaderPresent,false);
});

test('revoking a new session cannot clear an older unconfirmed revocation', async () => {
  const {controller}=setup({}, {...INITIAL_OBSERVATION,status:'expired',logoutPending:true});
  await controller.signIn(login); assert.equal(controller.getState().logoutPending,true);
  await controller.signOut(); assert.equal(controller.getState().logoutPending,true);
  assert.equal(controller.getState().reason,'REVOCATION_UNCONFIRMED');
});

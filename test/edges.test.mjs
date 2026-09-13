import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setup, login, secret, config, configOf, requestOf, IdentityTransport, json, cookie, ROUTES, createRouteHandler, BrowserIdentityClient, A} from './fixtures/support.mjs';
const expectCode = (action, code) => assert.throws(action, error => error.code === code);
const host = 'https://dsh.example.invalid';
function post(path, value, headers = {}) {return new Request(host+path,{method:'POST',headers:{origin:host,'content-type':'application/json',...headers},body:JSON.stringify(value)});}

test('configuration fixes the origin, rejects remote plaintext, userinfo and invalid prefixes', () => {
  for(const identityOrigin of ['http://example.invalid','https://user:pass@example.invalid','https://example.invalid/base','https://example.invalid?token=x','https://example.invalid#x']) {
    expectCode(()=>configOf({...config,identityOrigin}),'IDENTITY_ORIGIN_REJECTED');
  }
  assert.equal(configOf({...config,identityOrigin:'http://127.0.0.1:40001',allowInsecureLoopback:true}).allowInsecureLoopback,true);
  for(const protectedPrefixes of [42,{},'/v1/catalog',['/api/auth'],['/v1/../auth']]) assert.throws(()=>configOf({...config,protectedPrefixes}));
});
test('path allowlist rejects traversal, forged headers, credential queries and generic auth routes', () => {
  const checked=configOf(config);
  for(const path of ['https://attacker.invalid/v1/identity/me','//attacker.invalid/v1/identity/me','/v1/identity/../auth','/v1/identity/%2e%2e/me','/v1/identity/%252e%252e/me','/v1/identity/%2fme','/v1/identity/%5cme','/v1/identity/me?token=x','/v1/identity/me?%63ookie=x','/v1/identityevil/me','/api/auth/get-session','/v1/identity/me#x','/v1/identity/%zz']) {
    expectCode(()=>requestOf({path},checked),'REQUEST_NOT_ALLOWED');
  }
  expectCode(()=>requestOf({path:'/v1/identity/me',headers:{'x-principal-id':A}},checked),'REQUEST_NOT_ALLOWED');
  expectCode(()=>requestOf({path:'/v1/identity/me',method:'GET',body:{}},checked),'REQUEST_NOT_ALLOWED');
});
test('identity PATCH consumes only the locked displayName contract', async () => {
  const {controller,remote}=setup(); await controller.signIn(login);
  const result=await controller.request({path:'/v1/identity/me',method:'PATCH',body:{displayName:'Safe name'}});
  assert.equal(result.status,200); assert.equal(remote.requests.at(-1).origin,config.identityOrigin);
  await assert.rejects(controller.request({path:'/v1/identity/me',method:'PATCH',body:{displayName:'Safe',scopes:['admin']}}),e=>e.code==='IDENTITY_INPUT_INVALID');
});
test('account switch requires an explicit successful logout rather than discarding an active cookie',async()=>{
  const {controller,remote}=setup(); await controller.signIn(login); const n=remote.requests.length;
  await assert.rejects(controller.signIn(login),e=>e.code==='REVOCATION_UNCONFIRMED');
  assert.equal(remote.requests.length,n); assert.equal(controller.getState().status,'signed_in');
  await controller.signOut(); remote.revoked=false; await controller.signIn(login); assert.equal(controller.getState().status,'signed_in');
});
test('cookie parser refuses non-HttpOnly, cross-domain, bad prefixes, expiry and duplicate attributes', async () => {
  for(const text of [
    `hm=${secret}; Secure; Path=/`, `hm=${secret}; HttpOnly; Path=/`,
    `hm=${secret}; HttpOnly; Secure; Domain=attacker.invalid; Path=/`,
    `__Host-hm=${secret}; HttpOnly; Secure; Domain=identity.example.invalid; Path=/`,
    `hm=${secret}; HttpOnly; Secure; Path=/; Path=/other`,
    `hm=${secret}; HttpOnly; Secure; Path=/; Max-Age=abc`,
    `hm=${secret}; HttpOnly; Secure; Path=/; Expires=garbage`,
  ]) {
    const transport=new IdentityTransport(configOf(config),async()=>json({ok:true},200,{'set-cookie':text}));
    await assert.rejects(transport.auth('login','{}',new AbortController().signal),e=>e.code==='UPSTREAM_INVALID_RESPONSE');
    assert.equal(transport.hasCredentials(),false);
  }
});
test('cookie expiry and path scoping do not authenticate /me', async () => {
  for(const text of [cookie()+'; Max-Age=0',cookie().replace('Path=/;','Path=/api/auth;')]) {
    const transport=new IdentityTransport(configOf(config),async()=>json({ok:true},200,{'set-cookie':text}));
    await transport.auth('login','{}',new AbortController().signal); assert.equal(transport.hasCredentials(),false);
  }
});
test('multiple cookies commit together; malformed auth and errors never import a cookie', async () => {
  const headers=new Headers({'content-type':'application/json'});headers.append('set-cookie',cookie()); headers.append('set-cookie','second=synthetic; HttpOnly; Secure; Path=/');
  const t=new IdentityTransport(configOf(config),async()=>new Response('{"ok":true}',{headers}));
  await t.auth('login','{}',new AbortController().signal);assert.equal(t.hasCredentials(),true);t.clear();assert.equal(t.hasCredentials(),false);
  for(const [body,status] of [[{ok:true,token:secret},200],[{ok:true},401]]) {
    const bad=new IdentityTransport(configOf(config),async()=>json(body,status,{'set-cookie':cookie()}));
    if(status===200) await assert.rejects(bad.auth('login','{}',new AbortController().signal)); else await bad.auth('login','{}',new AbortController().signal);
    assert.equal(bad.hasCredentials(),false);
  }
});
test('timeout cannot import a late cookie even from an abort-ignoring implementation',async()=>{
  const t=new IdentityTransport(configOf({...config,timeoutMs:10}),async()=>{await new Promise(r=>setTimeout(r,25));return json({ok:true},200,{'set-cookie':cookie()});});
  await assert.rejects(t.auth('login','{}',new AbortController().signal),e=>e.code==='AUTH_UNAVAILABLE');assert.equal(t.hasCredentials(),false);
});
test('transport binds fetch receiver, rejects redirects and enforces response size/content type',async()=>{
  let called=false;
  const t=new IdentityTransport(configOf(config),async function(url,init){assert.equal(this,globalThis);assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');called=true;return json({error:'denied'},401);});
  assert.equal((await t.readPrincipal(new AbortController().signal)).status,401);assert.ok(called);
  for(const response of [new Response('html',{headers:{'content-type':'text/html'}}),json({body:'x'.repeat(1024*1024)}),new Response('{bad',{headers:{'content-type':'application/json'}})]) {
    const bad=new IdentityTransport(configOf(config),async()=>response);
    await assert.rejects(bad.readPrincipal(new AbortController().signal),e=>e.code==='UPSTREAM_INVALID_RESPONSE');
  }
  const response=json({ok:true});Object.defineProperty(response,'redirected',{value:true});
  await assert.rejects(new IdentityTransport(configOf(config),async()=>response).readPrincipal(new AbortController().signal));
});
test('UI routes distinguish method, exact path, origin and Fetch Metadata',async()=>{
  const {controller}=setup(); const route=createRouteHandler(controller);
  assert.equal((await route(new Request(host+ROUTES.state))).status,200);
  assert.equal((await route(new Request(host+ROUTES.state+'?debug=1'))).status,404);
  assert.equal((await route(new Request(host+'/api/auth/get-session'))).status,404);
  assert.equal((await route(new Request(host+ROUTES.signIn))).status,405);
  for(const headers of [{origin:'https://attacker.invalid'},{origin:'null'},{origin:''},{'sec-fetch-site':'cross-site'},{'sec-fetch-site':'same-site'}]) {
    assert.equal((await route(post(ROUTES.signIn,login,headers))).status,403);
  }
});
test('DSH HTTP bridge accepts a fenced Host and Origin despite its internal Request URL',async()=>{
  const {controller}=setup();const route=createRouteHandler(controller);
  const bridged=new Request('http://dsh.internal'+ROUTES.signIn,{method:'POST',headers:{
    host:'127.0.0.1:53110',origin:'http://127.0.0.1:53110','content-type':'application/json'},body:JSON.stringify(login)});
  assert.equal((await route(bridged)).status,200);
  for(const origin of ['http://attacker.invalid:53110','http://127.0.0.1:9999','null']){
    const rejected=new Request('http://dsh.internal'+ROUTES.signIn,{method:'POST',headers:{
      host:'127.0.0.1:53110',origin,'content-type':'application/json'},body:JSON.stringify(login)});
    assert.equal((await route(rejected)).status,403);
  }
});
test('UI body limits, exact fields and error text never return secrets',async()=>{
  const {controller}=setup();const route=createRouteHandler(controller);
  for(const [request,status] of [[post(ROUTES.signIn,login,{'content-type':'text/plain'}),415],[post(ROUTES.signIn,login,{'content-length':'999999'}),413],[post(ROUTES.signIn,{...login,token:secret}),400],[post(ROUTES.signIn,{email:'x',password:'x'.repeat(9000)}),413],[post(ROUTES.signOut,{token:secret}),400]]) {
    const response=await route(request);assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'no-store');assert.ok(!(await response.text()).includes(secret));
  }
});
test('diagnostics/state never expose password, remote cookie, email or raw auth',async()=>{
  const {controller}=setup();const route=createRouteHandler(controller);
  assert.equal((await route(post(ROUTES.signIn,login))).status,200);
  for(const path of [ROUTES.state,ROUTES.diagnostics]) {
    const output=await (await route(new Request(host+path))).text();
    for(const forbidden of [login.email,login.password,secret,'set-cookie','rawAuth'])assert.ok(!output.includes(forbidden));
    if(path===ROUTES.diagnostics)assert.ok(!output.includes(A));
  }
});
test('SDK is receiver-bound, same-origin and exposes no credential methods',async()=>{
  const {controller}=setup(); const calls=[];
  const client=new BrowserIdentityClient(host,async function(url,init){assert.equal(this,globalThis);calls.push({url:String(url),init});return json(controller.getState());});
  assert.equal((await client.state()).status,'signed_out');assert.equal(calls[0].init.credentials,'same-origin');assert.equal(calls[0].url,host+ROUTES.state);
  assert.equal(client.signIn,undefined);assert.equal(client.token,undefined);assert.equal(client.cookie,undefined);
  const failing=new BrowserIdentityClient(host,async()=>json({password:secret},403));await assert.rejects(failing.state(),e=>e.code==='AUTH_FORBIDDEN'&&!e.message.includes(secret));
});
test('all five views exist without unsafe markup/storage or simulated ui-kit tokens',async()=>{
  const {renderLoginPage,STATE_PRESENTATION}=await import('../lib/view.js');
  assert.equal(Object.keys(STATE_PRESENTATION).length,5);
  const page=renderLoginPage();assert.ok(page.includes('role="status"'));assert.ok(page.includes('type="password"'));assert.ok(page.includes('ui-kit'));
  const ui=await readFile('src/ui/login.js','utf8');
  assert.ok(!/innerHTML|localStorage|sessionStorage|document\.cookie/.test(ui));
  for(const status of Object.keys(STATE_PRESENTATION))assert.ok(ui.includes(status));
});
test('consistency declaration validates locally and covers one group and both boundaries',async()=>{
  const c=JSON.parse(await readFile('consistency.json','utf8'));
  assert.equal(c.module,'plugin-identity');assert.equal(c.exempt,false);assert.equal(c.groups.length,1);assert.equal(c.boundaries.length,2);
  const names=new Set();for(const g of c.groups){assert.ok(g.name&&!names.has(g.name));names.add(g.name);assert.ok(g.medium.startsWith('storage-domain:'));assert.ok(g.why);assert.ok(Array.isArray(g.facts)&&g.facts.length>1);assert.equal(new Set(g.facts).size,g.facts.length);}
  for(const b of c.boundaries){assert.ok(b.name&&b.why);assert.equal(b.sides.length,2);assert.ok(b.sides.includes(b.safeDirection));}
  const adapter=await readFile('src/dsh.mjs','utf8');assert.match(adapter,/name: 'hanamesh_identity'/);assert.match(adapter,/layout: 'single'/);assert.equal((adapter.match(/await domain\.global\.set\(/g)||[]).length,1);
  assert.ok(!/appendCustom|ctx\.session|session\.append/.test(adapter));
});

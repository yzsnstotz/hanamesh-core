import test from 'node:test';import assert from 'node:assert/strict';import {apply} from '../../lib/dsh.mjs';import {config,INITIAL_OBSERVATION} from './support.mjs';
function fixture(failAt){
  const facts={routes:[],assets:[],events:[],closed:0,disposed:0,writes:[],provided:[],effects:[]};let observation=INITIAL_OBSERVATION;
  const dispose=()=>{facts.disposed++;};
  const ctx={
    storageDomain:{async open(spec){facts.spec=spec;if(failAt==='open')throw Error('synthetic open failure');return {global:{get:()=>observation,async set(value){if(facts.closed)throw Error('closed');observation=value;facts.writes.push(value);}},async close(){facts.closed++;}};}},
    provide(name,value){facts.provided.push({name,value});return dispose;},
    connection:{fetch:{register(route){if(failAt==='register')throw Error('synthetic register failure');facts.routes.push(route);return async()=>dispose();}},requestRejection(req){return req.headers['x-synthetic-auth']?undefined:401;}},
    webServer:{register(route){facts.assets.push(route);return dispose;}},
    on(name,fn){facts.events.push({name,fn});return dispose;},
    effect(fn){facts.effects.push(fn());return dispose;},
  };
  return {facts,ctx};
}
test('adapter uses supplied service API names, one domain, exact routes and narrow service',async()=>{
  const {facts,ctx}=fixture();await apply(ctx,config);
  assert.equal(facts.spec.name,'hanamesh_identity');assert.equal(facts.spec.layout,'single');assert.deepEqual(facts.spec.tables,{});
  assert.equal(facts.routes.length,6);assert.ok(facts.routes.every(r=>r.requestBody==='buffered'&&r.path.startsWith('/api/hanamesh/identity/')));
  assert.equal(facts.provided[0].name,'hanameshIdentity');assert.equal(facts.provided[0].value.signIn,undefined);assert.equal(facts.assets.length,2);
  const rows=[];facts.events[0].fn(rows);assert.equal(rows[0].kind,'html');assert.ok(rows[0].html.includes('/hanamesh/identity'));
  await facts.effects[0]();assert.equal(facts.closed,1);assert.equal(facts.disposed,10);
});
test('adapter assets require host browser authentication and cannot be framed',async()=>{
  const {facts,ctx}=fixture();await apply(ctx,config);
  const page=facts.assets.find(r=>r.path==='/hanamesh/identity');
  const response=()=>({status:null,headers:null,body:null,writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body;}});
  const denied=response();page.handler({method:'GET',headers:{}},denied);assert.equal(denied.status,401);assert.ok(!denied.body.includes('<form'));
  const granted=response();page.handler({method:'GET',headers:{'x-synthetic-auth':'fixture'}},granted);assert.equal(granted.status,200);assert.ok(granted.body.includes('账户'));assert.equal(granted.headers['cache-control'],'no-store');assert.match(granted.headers['content-security-policy'],/frame-ancestors 'none'/);
  const head=response();page.handler({method:'HEAD',headers:{'x-synthetic-auth':'fixture'}},head);assert.equal(head.body,undefined);
  await facts.effects[0]();
});
test('adapter activation failures do not silently install an anonymous substitute',async()=>{
  for(const kind of ['open','register']){
    const {facts,ctx}=fixture(kind);await assert.rejects(apply(ctx,config));
    assert.equal(facts.effects.length,0);assert.equal(facts.routes.length,0);assert.equal(facts.closed,kind==='open'?0:1);
  }
});
test('disposing after the storage facility closes still clears public access',async()=>{
  const {facts,ctx}=fixture();await apply(ctx,config);facts.closed=1;
  await facts.effects[0]();assert.equal(facts.provided[0].value.getState().status,'unavailable');
  assert.equal(facts.provided[0].value.checkLocalAccess('protected').allowed,false);
});

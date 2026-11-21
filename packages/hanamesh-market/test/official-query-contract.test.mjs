import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createCatalogClient} from '../src/catalog.js';
import {createMarketHandler} from '../src/routes.js';
import {createMarketService,initialState} from '../src/service.js';

// Provider-owned examples: catalogPath at the recorded website commit. The gate
// executes that exact provider function against these examples before this test.
const contract=JSON.parse(await readFile(new URL('../tests/fixtures/catalog-official-contract.json',import.meta.url)));
const example=name=>contract.cases.find(row=>row.name===name);
const page=query=>({items:[],page:Number(query.page??1),limit:50,total:101,totalPages:3,facets:{
 categories:[{id:'tools',count:101}],channels:[{id:'dsh',count:101}],
 sources:['hanamesh-official','awesome','github','npm'].map(id=>({id,name:id==='hanamesh-official'?'官方':id,count:101})),
}});
function sameRequest(actual,name){
 const expected=new URL(example(name).catalogPath,'https://catalog.example');
 actual=new URL(actual,'https://catalog.example');
 assert.equal(actual.pathname,expected.pathname);
 assert.deepEqual([...actual.searchParams].sort(),[...expected.searchParams].sort(),`Market request must match website catalogPath: ${name}`);
}
async function fixture(t){
 const outbound=[];
 const client=createCatalogClient({websiteOrigin:'https://catalog.example',serverOrigin:'https://host.example',fetchImpl:async url=>{
  const parsed=new URL(url);outbound.push(parsed.href);return Response.json(page(Object.fromEntries(parsed.searchParams)));
 }});
 const service=createMarketService({config:{websiteOrigin:'https://catalog.example',serverOrigin:'https://host.example'},
  domain:{global:{get:async()=>initialState()}},manager:()=>({listBundles:async()=>[]}),
  anchor:new URL('../package.json',import.meta.url),fetchImpl:async url=>{
   const parsed=new URL(url);outbound.push(parsed.href);return Response.json(page(Object.fromEntries(parsed.searchParams)));
  }});
 await service.init();
 const server=createServer(createMarketHandler({service,connection:{requestRejection:()=>undefined}}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await service.close();await new Promise(resolve=>server.close(resolve));});
 return{client,outbound,base:'http://127.0.0.1:'+server.address().port};
}
function hooks(){
 const values=[],effects=[],cleanups=[];let cursor=0,change=Promise.withResolvers();
 const notify=()=>{const previous=change;change=Promise.withResolvers();previous.resolve();};
 return{React:{Fragment:Symbol.for('fragment'),createElement:(type,props,...children)=>({type,props:props??{},children}),
  useState(value){const i=cursor++;if(!(i in values))values[i]=typeof value==='function'?value():value;return[values[i],next=>{values[i]=typeof next==='function'?next(values[i]):next;notify();}];},
  useRef(value){const i=cursor++;return values[i]??(values[i]={current:value});},
  useEffect(fn,deps){const i=cursor++,old=values[i];if(!old||!deps||deps.some((value,n)=>!Object.is(value,old[n]))){values[i]=deps;effects.push(()=>{cleanups[i]?.();cleanups[i]=fn();});}}},
  changed:()=>change.promise,render(Component){cursor=0;const tree=Component({});while(effects.length)effects.shift()();return tree;},close(){for(const fn of cleanups)fn?.();}};
}
function find(node,predicate){
 if(Array.isArray(node)){for(const child of node){const result=find(child,predicate);if(result)return result;}}
 else if(node&&typeof node==='object'){if(predicate(node))return node;return find(node.children,predicate);}
}
async function pageFixture(t,f){
 const ui=hooks(),pending=[],timers=new Map();let timerId=0,loaded;
 const scope={fetch:(url,init)=>{
  const path=new URL(url,f.base).pathname;
  if(path.endsWith('/catalog')){
   const read=fetch(new URL(url,f.base),init).then(async response=>Response.json(await response.json(),{status:response.status}));pending.push(read);return read;
  }
  const value=path.endsWith('/settings')?{settings:{}}:path.endsWith('/suite')?{status:'unknown'}:
   path.endsWith('/domains')?{domains:[]}:path.endsWith('/featured')?{items:[]}:path.endsWith('/stage-config')?{phase:'early'}:undefined;
  assert.notEqual(value,undefined,'unexpected client read '+path);return Promise.resolve(Response.json(value));
 }};
 // Execute the shipped Loader bundle. Only the client's debounce clock is
 // controlled; real Node HTTP/fetch timers and the handler/service stay intact.
 new Function('window','globalThis','document','setTimeout','clearTimeout',await readFile(new URL('../lib/client.js',import.meta.url),'utf8'))(
  {__ModuleLoader__:{load:value=>{loaded=value;}}},scope,{createElement:()=>({}),head:{append(){}}},
  fn=>{timers.set(++timerId,fn);return timerId;},id=>timers.delete(id));
 const module=loaded.factory(id=>{
  if(id==='react')return ui.React;
  if(id==='@deepseek-ai/dsh-client-ui-primitives')return{Modal:()=>{},DetailDocument:()=>{},useDetailDocumentLabels:()=>({})};
  assert.fail('unexpected client import '+id);
 });
 const Frame=()=>{},Results=()=>{},Component=module.createMarketPage({Frame,Results});let tree=ui.render(Component);
 t.after(()=>{ui.close();assert.equal(timers.size,0,'client debounce is disposed');});
 const frame=()=>find(tree,node=>node.type===Frame);
 const render=()=>{tree=ui.render(Component);return frame();};
 async function finish(){
  // A transport response is not a rendered listing. Subscribe before reading
  // state so no completion can fall between the predicate and the next change.
  for(;;){const changed=ui.changed(),current=render(),snapshot=find(current.props.body,node=>node.type===Results).props.snapshot;
   if(snapshot.status==='error')assert.fail(snapshot.error);
   if(snapshot.status==='ready'){await Promise.all(pending.splice(0));return current;}
   await changed;
  }
 }
 frame().props.onNavigate('search');render();
 const submit=async()=>{find(frame().props.body,node=>node.type==='form').props.onSubmit({preventDefault(){}});return finish();};
 await submit();
 return{frame,render,submit,finish,
  choose(key,value){const label=find(frame().props.body,node=>node.type==='label'&&node.props.key===key);assert.ok(label,'actual filter '+key);find(label,node=>node.type==='select').props.onChange({target:{value}});render();},
  keyword(value){find(frame().props.body,node=>node.type==='input'&&node.props.type==='search').props.onChange({target:{value}});render();},
  async debounce(){const jobs=[...timers.values()];timers.clear();assert.equal(jobs.length,1);jobs[0]();return finish();},
  async more(){const results=find(frame().props.body,node=>node.type===Results);assert.equal(results.props.snapshot.status,'ready','more starts only after the actual listing is ready');results.props.onMore();return finish();},
  async clear(){find(frame().props.body,node=>node.type==='button'&&node.props.className==='textbtn').props.onClick();render();return this.debounce();},
 };
}

test('official UI selection, combined filters, more and clear emit website catalogPath parameters through the real Market handler and service',async t=>{
 const f=await fixture(t),ui=await pageFixture(t,f);
 const official=find(ui.frame().props.body,node=>node.type==='option'&&node.props.value==='hanamesh-official');assert.equal(official.children[0],'官方');
 ui.choose('source',official.props.value);await ui.debounce();sameRequest(f.outbound.at(-1),'official');
 assert.equal(new URL(f.outbound.at(-1)).searchParams.has('source'),false,'official is an attribute, not a source ID');
 ui.keyword('notes');ui.choose('category','tools');ui.choose('channel','dsh');await ui.submit();sameRequest(f.outbound.at(-1),'official-filtered');
 await ui.more();sameRequest(f.outbound.at(-1),'official-more');
 ui.keyword('');await ui.clear();sameRequest(f.outbound.at(-1),'all');
 for(const source of ['awesome','github','npm']){ui.choose('source',source);await ui.debounce();sameRequest(f.outbound.at(-1),source);}
});
test('catalog official booleans match provider examples without changing literal source-ID semantics',async t=>{
 const f=await fixture(t);
 for(const name of ['official','official-filtered','official-more','official-false','source-id','all']){
  const{limit,...query}=example(name).query;await f.client.list(query);sameRequest(f.outbound.at(-1),name);
 }
});
test('local catalog GET decodes explicit official booleans and preserves source IDs',async t=>{
 const f=await fixture(t);
 for(const name of ['official','official-false','source-id']){
  const{limit,...query}=example(name).query;
  const response=await fetch(f.base+'/hanamesh/market/catalog?'+new URLSearchParams(query));
  assert.equal(response.status,200,name);sameRequest(f.outbound.at(-1),name);
 }
});
test('malformed catalog official values are rejected before any outgoing request',async t=>{
 const f=await fixture(t);
 for(const official of ['true','false',0,1,null,[],{}])await assert.rejects(f.client.list({official}),{code:'INVALID_QUERY'});
 for(const value of ['', '1','0','yes','TRUE'])assert.equal((await fetch(f.base+'/hanamesh/market/catalog?official='+value)).status,400);
 assert.equal((await fetch(f.base+'/hanamesh/market/catalog?official=true&official=false')).status,400);
 assert.equal(f.outbound.length,0);
});

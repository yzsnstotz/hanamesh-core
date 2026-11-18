import {join} from 'node:path';
import test from 'node:test';import assert from 'node:assert/strict';
import {declaration,core} from './fixtures/core-suite-declaration.mjs';
const module=await import('../src/library/installation-status.js').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return{};throw e});
function reader(options={}){assert.equal(typeof module.createInstallationStatusReader,'function');const {readers={},...rest}=options;return module.createInstallationStatusReader({profileState:async()=>'present',discoverReader:async({channel})=>{if(readers[channel])return readers[channel];throw Object.assign(new Error('not found'),{code:'AGENT_READER_UNAVAILABLE'})},...rest})}
const configured={executable:join(import.meta.dirname,'official','cli'),home:join(import.meta.dirname,'configured','user'),configDir:join(import.meta.dirname,'configured','user','config'),pluginName:'hanamesh',marketplace:'registered-suite',marketplaceUrl:'https://market.example/plugins.git',timeoutMs:2000,maxOutputBytes:20000};
function official(channel,installed=true,extra={}){const id='hanamesh@registered-suite';return channel==='claude'?{version:'2.1.301 (Claude Code)',plugins:installed?[{id,version:'0.1.0',scope:'user',enabled:true,installPath:'/private/never-return',...extra}]:[],marketplaces:[{name:'registered-suite',source:'url',url:configured.marketplaceUrl}]}:{version:'codex-cli 0.162.1',plugins:{installed:installed?[{pluginId:id,name:'hanamesh',marketplaceName:'registered-suite',version:'0.1.0',installed:true,enabled:true,marketplaceSource:{sourceType:'git',source:configured.marketplaceUrl},...extra}]:[],available:[]},marketplaces:{marketplaces:[{name:'registered-suite',marketplaceSource:{sourceType:'git',source:configured.marketplaceUrl}}]}}}
function command(channel,values,calls=[]){return async({args,signal})=>{calls.push(args);signal.throwIfAborted();if(args.includes('--version'))return values.version;return JSON.stringify(args.includes('marketplace')?values.marketplaces:values.plugins)}}
const observation=(result,channel,id)=>result.observations.find(x=>x.channel===channel&&(!id||x.scope.id===id));
test('fresh Core authority: complete, unknown with versions retained only in components, removal and safe failure',async()=>{
 let value=declaration(),service=core(value),calls=[];service.getSuiteDeclaration=async(...args)=>{calls.push(args);return value};
 const read=reader({client:'hanamesh',core:()=>service});let result=await read();assert.equal(observation(result,'hanamesh').status,'installed');assert.equal(observation(result,'hanamesh').version,'0.1.0');assert.equal(observation(result,'hanamesh').versionKind,'suite-bundle');assert.equal(observation(result,'hanamesh').components[0].version,'0.3.12');assert.deepEqual(calls,[[]]);assert.equal(observation(result,'dsh').status,'unknown');
 value={...value,completeness:'unknown',blocked:[{code:'CORE_SUITE_PEER_UNKNOWN'}]};result=await read();assert.equal(observation(result,'hanamesh').status,'unknown');assert.equal(observation(result,'hanamesh').version,null);assert.equal(observation(result,'hanamesh').components[0].version,'0.3.12');assert.equal(observation(result,'hanamesh').blocked[0].code,'CORE_SUITE_PEER_UNKNOWN');
 value={...value,completeness:'incomplete'};assert.equal(observation(await read(),'hanamesh').status,'incomplete');
 service=undefined;assert.equal(observation(await read(),'hanamesh').reason.code,'CORE_SUITE_DECLARATION_MISSING');service={protocolVersion:'1',getSuiteDeclaration:()=>{throw new Error('/Users/owner/secret token')}};result=await read();assert.equal(observation(result,'hanamesh').reason.code,'CORE_SUITE_READ_FAILED');assert.doesNotMatch(JSON.stringify(result),/secret|\/Users/);
});
for(const channel of ['claude','codex'])test(`${channel} official list matches qualified identity/source and preserves exact scope`,async()=>{
 let value=official(channel),calls=[];const read=reader({readers:{[channel]:configured},runCommand:async request=>command(channel,value,calls)(request)});
 let result=await read(),row=observation(result,channel,'agent-cli');assert.equal(row.status,'installed');assert.equal(row.version,'0.1.0');assert.deepEqual(row.identity,{pluginName:'hanamesh',marketplace:'registered-suite'});assert.equal(row.components[0].active,true);assert.doesNotMatch(JSON.stringify(result),/private|installPath/);assert.ok(calls.some(x=>x.includes('marketplace')));
 value=official(channel,false);assert.equal(observation(await read(),channel,'agent-cli').status,'not-installed');
 value=official(channel);if(channel==='claude')value.plugins[0].id='hanamesh@unrelated';else {value.plugins.installed[0].pluginId='hanamesh@unrelated';value.plugins.installed[0].marketplaceName='unrelated'}assert.equal(observation(await read(),channel,'agent-cli').status,'not-installed');
 value=official(channel);if(channel==='claude')value.marketplaces[0].url='https://other.example/marketplace.json';else value.marketplaces.marketplaces[0].marketplaceSource.source='https://other.example/plugins.git';result=await read();assert.equal(observation(result,channel,'agent-cli').status,'unknown','a mismatched marketplace source must remain unknown');assert.equal(observation(result,channel,'agent-cli').reason.code,'AGENT_MARKETPLACE_SOURCE_MISMATCH');
 if(channel==='codex')assert.equal(observation(result,'codex','desktop-app').reason.code,'CODEX_DESKTOP_SCOPE_UNOBSERVABLE');
});
test('missing registration/reader/config, unsupported CLI and malformed list never become absence',async()=>{
 assert.equal(observation(await reader()(),'claude').reason.code,'AGENT_READER_UNAVAILABLE');
 for(const [config,runCommand,expected]of [[{...configured,pluginName:undefined},async()=>assert.fail('no read'),'AGENT_READER_DISCOVERY_INVALID'],[configured,async()=> 'codex-cli 0.162.0','AGENT_READER_VERSION_UNSUPPORTED'],[configured,async({args})=>args.includes('--version')?'codex-cli 0.162.1':'','AGENT_INVENTORY_INVALID'],[configured,async()=>{throw new Error('private token')},'AGENT_READER_FAILED']]){const result=await reader({readers:{codex:config},runCommand})();assert.equal(observation(result,'codex','agent-cli').reason.code,expected);assert.equal(observation(result,'codex','agent-cli').status,'unknown');assert.doesNotMatch(JSON.stringify(result),/private token/)}
});
test('late Core results and agent work are cancelled without a cached installed response',async()=>{
 let release;const read=reader({core:()=>({protocolVersion:'1',getSuiteDeclaration:()=>new Promise(r=>release=r)})});const c=new AbortController();const pending=read({signal:c.signal});c.abort();await assert.rejects(pending,{code:'INSTALLATION_STATUS_CANCELLED'});release(declaration());read.close();await assert.rejects(read(),{code:'INSTALLATION_STATUS_CANCELLED'});
});
for(const channel of ['claude','codex'])test(`${channel} incomplete/unknown version/conflicting inventory and malformed data do not claim absence`,async()=>{
 let value=official(channel);const read=reader({readers:{[channel]:configured},runCommand:async q=>command(channel,value)(q)});
 if(channel==='claude')value.plugins[0].errors=['private path /Users/secret'];else value.plugins.installed[0].installed=false;
 assert.equal(observation(await read(),channel,'agent-cli').status,'incomplete');
 value=official(channel);if(channel==='claude')value.plugins[0].version='unknown';else delete value.plugins.installed[0].version;
 let result=await read();assert.equal(observation(result,channel,'agent-cli').status,'installed');assert.equal(observation(result,channel,'agent-cli').version,null);
 value=official(channel);const rows=channel==='claude'?value.plugins:value.plugins.installed;rows.push({...rows[0]});assert.equal(observation(await read(),channel,'agent-cli').reason.code,'AGENT_INVENTORY_CONFLICT');
 value=official(channel);if(channel==='claude')value.plugins=[{id:'unrelated',scope:'user'}];else value.plugins.installed=[{pluginId:'unrelated'}];assert.equal(observation(await read(),channel,'agent-cli').reason.code,'AGENT_INVENTORY_INVALID');
 value=official(channel);if(channel==='claude')value.plugins[0].scope='project';else value.plugins={available:[]};assert.equal(observation(await read(),channel,'agent-cli').status,'unknown');
});
test('Codex per-install marketplace provenance cannot be replaced by the current marketplace mapping',async()=>{
 const value=official('codex');value.plugins.installed[0].marketplaceSource={sourceType:'git',source:'https://other.example/unrelated.git'};
 const read=reader({readers:{codex:configured},runCommand:command('codex',value)});let row=observation(await read(),'codex','agent-cli');assert.equal(row.status,'unknown','conflicting installed provenance must not report installed');assert.equal(row.reason.code,'AGENT_MARKETPLACE_SOURCE_MISMATCH');
 delete value.plugins.installed[0].marketplaceSource;row=observation(await read(),'codex','agent-cli');assert.equal(row.status,'unknown');assert.equal(row.reason.code,'AGENT_MARKETPLACE_SOURCE_UNAVAILABLE');
});
for(const [channel,newer,lower,malformed]of [['claude','2.1.319 (Claude Code)','2.1.300 (Claude Code)','2.1.319'],['codex','codex-cli 0.167.0','codex-cli 0.162.0','other-cli 0.167.0']])test(`AH1 ${channel} minimum version and JSON schema gate`,async()=>{
 const value=official(channel);value.version=newer;
 const read=reader({readers:{[channel]:configured},runCommand:command(channel,value)});
 assert.equal(observation(await read(),channel,'agent-cli').status,'installed','newer official CLI must pass');
 value.version=channel==='claude'?'99.0.0 (Claude Code)':'codex-cli 99.0.0';assert.equal(observation(await read(),channel,'agent-cli').status,'installed','no upper bound');
 value.version=lower;assert.equal(observation(await read(),channel,'agent-cli').reason.code,'AGENT_READER_VERSION_UNSUPPORTED');
 value.version=malformed;assert.equal(observation(await read(),channel,'agent-cli').reason.code,'AGENT_READER_VERSION_INVALID');
 value.version=newer;value.plugins={unexpected:[]};assert.equal(observation(await read(),channel,'agent-cli').reason.code,'AGENT_INVENTORY_INVALID');
});

test('DT2 Claude official GitHub marketplace records identify the canonical repository',async()=>{
 const config={...configured,marketplace:'hanamesh',marketplaceUrl:'https://github.com/yzsnstotz/hanamesh-plugins'};
 const value={version:'2.1.303 (Claude Code)',plugins:[{id:'hanamesh@hanamesh',version:'0.1.3',scope:'user',enabled:true,installPath:'/private/never-return'}],marketplaces:[{name:'hanamesh',source:'github',repo:'yzsnstotz/hanamesh-plugins'}]};
 const read=reader({readers:{claude:config},runCommand:command('claude',value)});
 const row=observation(await read(),'claude','agent-cli');assert.equal(row.status,'installed');assert.equal(row.version,'0.1.3');
 value.marketplaces[0].repo='other/hanamesh-plugins';
 assert.equal(observation(await read(),'claude','agent-cli').reason.code,'AGENT_MARKETPLACE_SOURCE_MISMATCH');
});

test('DT2 Claude official HTTPS GitHub registration keeps the same repository with .git suffix',async()=>{
 const config={...configured,marketplace:'hanamesh',marketplaceUrl:'https://github.com/yzsnstotz/hanamesh-plugins'};
 const value={version:'2.1.319 (Claude Code)',plugins:[{id:'hanamesh@hanamesh',version:'0.1.3',scope:'user',enabled:true,installPath:'/private/never-return'}],marketplaces:[{name:'hanamesh',source:'git',url:'https://github.com/yzsnstotz/hanamesh-plugins.git'}]};
 const read=reader({readers:{claude:config},runCommand:command('claude',value)});
 assert.equal(observation(await read(),'claude','agent-cli').status,'installed');
 value.marketplaces[0].url='https://github.com/other/hanamesh-plugins.git';
 assert.equal(observation(await read(),'claude','agent-cli').reason.code,'AGENT_MARKETPLACE_SOURCE_MISMATCH');
});

test('DT3 Codex official GitHub add normalizes .git in both marketplace and per-install sources',async()=>{
 const url='https://github.com/yzsnstotz/hanamesh-plugins';
 const config={...configured,marketplace:'hanamesh',marketplaceUrl:url};
 const value=official('codex');value.plugins.installed[0]={...value.plugins.installed[0],pluginId:'hanamesh@hanamesh',marketplaceName:'hanamesh',version:'0.2.8'};value.marketplaces.marketplaces[0].name='hanamesh';
 const read=reader({readers:{codex:config},runCommand:command('codex',value)});
 for(const mapping of [url,url+'.git'])for(const installed of [url,url+'.git']){
  value.marketplaces.marketplaces[0].marketplaceSource={sourceType:'git',source:mapping};
  value.plugins.installed[0].marketplaceSource={sourceType:'git',source:installed};
  const row=observation(await read(),'codex','agent-cli');assert.equal(row.status,'installed');assert.equal(row.version,'0.2.8');
 }
 for(const source of [url+'.git?ref=main',url+'.git#main',url+'.git/',url+'.git/other','https://github.com/other/hanamesh-plugins.git','https://user@github.com/yzsnstotz/hanamesh-plugins.git','http://github.com/yzsnstotz/hanamesh-plugins.git','https://github.com/yzsnstotz/hanamesh-plugins%2egit']){
  value.marketplaces.marketplaces[0].marketplaceSource={sourceType:'git',source:url+'.git'};
  value.plugins.installed[0].marketplaceSource={sourceType:'git',source};
  assert.equal(observation(await read(),'codex','agent-cli').reason.code,'AGENT_MARKETPLACE_SOURCE_MISMATCH','per-install source remains independently authoritative');
  value.plugins.installed[0].marketplaceSource={sourceType:'git',source:url+'.git'};
  value.marketplaces.marketplaces[0].marketplaceSource={sourceType:'git',source};
  assert.equal(observation(await read(),'codex','agent-cli').reason.code,'AGENT_MARKETPLACE_SOURCE_MISMATCH','mapping source also remains authoritative');
 }
});

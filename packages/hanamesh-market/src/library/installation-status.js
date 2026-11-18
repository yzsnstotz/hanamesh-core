import {readLegacyProfileFacts} from './installation-profile.js';
/** Read fresh public installation facts. No compatibility calculation, persistence or polling. */
import semver from 'semver';
import {AppHostError} from '../errors.js';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {realpathSync} from 'node:fs';
import {homedir} from 'node:os';
import {SUITE_BUNDLE,createCoreSuiteAdapter,SUITE_PACKAGES,readSuiteStatus} from './suite.js';
import {readerVersionFailure,validReader,runOfficialInstallationCommand,installationCommandDiagnostic} from './installation-cli.js';
import {discoverOfficialReader,agentProfileState,AGENT_INSTALLATION_TARGET} from './installation-discovery.js';
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=x=>typeof x==='string'&&semver.valid(x)===x?x:null;
const reason=(code,message,action)=>({code,message,action});
const interrupted=()=>new AppHostError('INSTALLATION_STATUS_CANCELLED','Installation read was cancelled.',{},499);
function abortable(work,signal){
 if(signal.aborted)return Promise.reject(interrupted());
 return new Promise((resolve,reject)=>{const abort=()=>reject(interrupted());signal.addEventListener('abort',abort,{once:true});Promise.resolve(work).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort))});
}
const base=(channel,id,kind,label)=>({channel,scope:{id,kind,label},status:'unknown',version:null,versionKind:['dsh','hanamesh'].includes(channel)?'suite-bundle':'agent-distribution',components:[],identity:null,reason:null});
const unknown=(row,code,message,action)=>({...row,status:'unknown',version:null,reason:reason(code,message,action)});
const agentBase=channel=>base(channel,'agent-cli','official-user-profile',channel==='claude'?'Claude Code 用户级插件（不覆盖项目或其他隔离资料）':'Codex CLI 本地市场用户资料（不代表桌面 App、项目或其他隔离资料）');
const inventoryError=()=>{throw new AppHostError('AGENT_INVENTORY_INVALID','Official inventory shape is unsupported.',{},503)};
const qualified=x=>typeof x==='string'&&/^[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9._-]*$/.test(x)&&x.length<=257;
function githubGitUrl(url){return typeof url==='string'&&/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git$/.test(url)?url.slice(0,-4):url;}
function codexMarketplaceUrl(source){return source?.sourceType==='git'?githubGitUrl(source.source):source?.sourceType==='url'?source.source:null;}
function claudeMarketplaceUrl(value){
 if(value.source==='github'&&typeof value.repo==='string'&&/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.repo))return `https://github.com/${value.repo}`;
 const url=['url','git'].includes(value.source)?value.url:null;
 return value.source==='git'?githubGitUrl(url):url;
}
function parseInventory(channel,plugins,marketplaces,target){
 let rows,markets;
 if(channel==='claude'){
  if(!Array.isArray(plugins)||!Array.isArray(marketplaces))inventoryError();rows=plugins;markets=marketplaces;
  if(!rows.every(r=>object(r)&&qualified(r.id)&&['user','project','local','managed','session','synced'].includes(r.scope)&&typeof r.enabled==='boolean'&&typeof r.version==='string'&&typeof r.installPath==='string'&&(r.errors===undefined||Array.isArray(r.errors))&&(r.notes===undefined||Array.isArray(r.notes))))inventoryError();
 }else{
  if(!object(plugins)||!Array.isArray(plugins.installed)||!Array.isArray(plugins.available)||!object(marketplaces)||!Array.isArray(marketplaces.marketplaces))inventoryError();rows=plugins.installed;markets=marketplaces.marketplaces;
  if(!rows.every(r=>object(r)&&qualified(r.pluginId)&&r.pluginId===`${r.name}@${r.marketplaceName}`&&typeof r.installed==='boolean'&&typeof r.enabled==='boolean'))inventoryError();
 }
 if(!markets.every(r=>object(r)&&typeof r.name==='string'&&r.name.length>0&&r.name.length<=128))inventoryError();
 const sourceRows=markets.filter(r=>r.name===target.marketplace);
 if(sourceRows.length>1)throw new AppHostError('AGENT_INVENTORY_CONFLICT','Conflicting marketplace identities.',{},503);
 if(sourceRows.length){const m=sourceRows[0],url=channel==='claude'?claudeMarketplaceUrl(m):codexMarketplaceUrl(m.marketplaceSource);
  if(url!==target.marketplaceUrl)throw new AppHostError('AGENT_MARKETPLACE_SOURCE_MISMATCH','The configured marketplace source is not the registered target.',{},503);
 }
 const id=`${target.pluginName}@${target.marketplace}`;
 const matches=rows.filter(r=>(channel==='claude'?r.id:r.pluginId)===id);
 const scoped=channel==='claude'?matches.filter(r=>r.scope==='user'):matches;
 if(matches.length&&!scoped.length)throw new AppHostError('AGENT_SCOPE_UNOBSERVABLE','The target is outside the configured user scope.',{},503);
 if(scoped.length>1)throw new AppHostError('AGENT_INVENTORY_CONFLICT','Conflicting target installations.',{},503);
 if(!scoped.length)return{status:'not-installed',version:null,components:[],reason:null};
 if(!sourceRows.length)throw new AppHostError('AGENT_MARKETPLACE_SOURCE_UNAVAILABLE','The target marketplace source is not observable.',{},503);
 const installedSource=scoped[0].marketplaceSource;
 if(channel==='codex'){
  if(!installedSource||!['git','url'].includes(installedSource.sourceType)||typeof installedSource.source!=='string')throw new AppHostError('AGENT_MARKETPLACE_SOURCE_UNAVAILABLE','Installed marketplace source is not observable.',{},503);
  if(codexMarketplaceUrl(installedSource)!==target.marketplaceUrl)throw new AppHostError('AGENT_MARKETPLACE_SOURCE_MISMATCH','Installed marketplace source conflicts with the registered target.',{},503);
 }
 const row=scoped[0],version=exact(channel==='claude'&&row.readFromFolder!==undefined?row.folderVersion:row.version);
 const failed=channel==='claude'?Boolean(row.errors?.length||row.notes?.length):!row.installed;
 return{status:failed?'incomplete':'installed',version,components:[{name:target.pluginName,version,active:row.enabled}],
  reason:failed?reason(channel==='claude'?'AGENT_PLUGIN_LOAD_FAILED':'AGENT_PLUGIN_PAYLOAD_MISSING','官方清单报告插件负载或加载问题。','在该官方客户端的插件详情中检查并修复。'):version===null?reason('AGENT_VERSION_UNAVAILABLE','已确认该作用域的安装记录，但实际版本未知。','在该官方客户端插件详情中核对实际版本。'):null};
}
const failureCodes=new Set(['AGENT_SHELL_ENV_UNAVAILABLE','AGENT_READER_DISCOVERY_INVALID','AGENT_READER_ENTRYPOINT_UNAVAILABLE','AGENT_READER_UNAVAILABLE','AGENT_READER_PERMISSION_DENIED','AGENT_READER_NODE_REQUIRED','AGENT_PROFILE_UNAVAILABLE','AGENT_READER_TIMEOUT','AGENT_READER_OUTPUT_LIMIT','AGENT_READER_CLEANUP_FAILED','AGENT_READER_DIAGNOSTIC','AGENT_READER_FAILED','AGENT_INVENTORY_INVALID','AGENT_INVENTORY_CONFLICT','AGENT_MARKETPLACE_SOURCE_MISMATCH','AGENT_MARKETPLACE_SOURCE_UNAVAILABLE','AGENT_SCOPE_UNOBSERVABLE']);
/** Physical DSH profile inventory; Core alone assesses individually installed components. */
async function profileSuite(row,profileDir,suite){
 let profile;try{profile=JSON.parse(await readFile(join(profileDir,'package.json'),'utf8'))}
 catch(error){if(['ENOENT','ENOTDIR'].includes(error.code))return{...row,status:'not-installed'};return unknown(row,'DSH_PROFILE_UNREADABLE','DSH 桌面版 profile 清单无法读取。','打开 DSH 确认其插件页可用后重新检测。')}
 if(!object(profile)||!object(profile.dependencies))return unknown(row,'DSH_PROFILE_UNREADABLE','DSH 桌面版 profile 清单无法读取。','打开 DSH 确认其插件页可用后重新检测。');
 if(!Object.hasOwn(profile.dependencies,SUITE_BUNDLE)){
  try{
   const value=await suite.assessLegacy(await readLegacyProfileFacts(profileDir,profile));
   return{...row,status:value.status,components:value.components,reason:value.reason,blocked:value.issues.map(({code,moduleName})=>({code,moduleName}))};
  }catch(error){return unknown(row,error.code==='CORE_LEGACY_ASSESSOR_MISSING'?error.code:'CORE_LEGACY_ASSESSMENT_FAILED','旧组件状态暂时无法确认。','打开包含新版 Core 的 HanaMesh 客户端后重新检测，或按 DSH 安装说明升级。')}
 }
 const value=await readSuiteStatus(profileDir);
 const components=value.components.map(c=>({name:c.name,version:c.version,active:c.active}));
 if(value.status==='installed'&&value.version)return{...row,status:'installed',version:value.version,components};
 if(value.status==='unknown')return unknown(row,'DSH_PROFILE_UNREADABLE','DSH 桌面版 profile 清单无法读取。','打开 DSH 确认其插件页可用后重新检测。');
 return{...row,status:'incomplete',version:value.version,components,reason:reason('DSH_PROFILE_SUITE_INCOMPLETE','DSH 桌面版 profile 中的 HanaMesh 套件缺组件或未启用。','在 DSH 插件页启用 HanaMesh，或按 DSH 安装说明重新安装总包后重启 DSH。')};
}
/** Official DSH desktop profile; only distinct, resolvable physical profiles may answer for another client. */
export function officialDshDesktopProfile(ownProfileDir,home=homedir()){
 const dir=join(home,'.dsh','profiles','desktop');
 if(typeof ownProfileDir!=='string'||!ownProfileDir)return null;
 try{return realpathSync(ownProfileDir)===realpathSync(dir)?null:dir}catch{return null}
}
/** Automatic current-user discovery only; `core` is the optional public protocol-1 Cordis service accessor.
 * `otherProfileDir`: a fresh selector of the official DSH desktop profile (HanaMesh client only); trusted fixtures may supply a path. */
export function createInstallationStatusReader({logger,client='dsh',core=()=>undefined,workerNode,runCommand=runOfficialInstallationCommand,discoverReader=discoverOfficialReader,profileState=agentProfileState,otherProfileDir=null}={}){
 if(!['dsh','hanamesh'].includes(client))throw new TypeError('client must be dsh or hanamesh');
 const active=new Set();let closed=false;
 const suite=createCoreSuiteAdapter({core});
 async function runtime(signal){
  const row=base(client,'current-runtime','responding-runtime',client==='dsh'?'当前响应的 DSH runtime':'当前响应的 HanaMesh 客户端 runtime');
  try{const value=await abortable(suite.readFacts(),signal);
   const components=value.components.map(c=>({name:c.name,version:exact(c.version),...(['satisfied','missing','incompatible','damaged','unreadable','inactive','failed','ambiguous'].includes(c.status)?{status:c.status}:{}),...(typeof c.active==='boolean'?{active:c.active}:{})}));
   const blocked=value.blocked.map(r=>({code:/^CORE_[A-Z0-9_]{1,75}$/.test(r.code)?r.code:'CORE_SUITE_BLOCKED',...(r.moduleName===SUITE_BUNDLE||SUITE_PACKAGES.some(c=>c.name===r.moduleName)?{moduleName:r.moduleName}:{})}));
   return{...row,status:value.status,version:value.status==='unknown'?null:exact(value.version),components,blocked,
    reason:value.reason??(value.status==='unknown'?reason('CORE_SUITE_DECLARATION_UNKNOWN','Core 尚不能确认本 runtime 的套件完整性。','查看 Core 设置中的具名阻断原因，补齐其公开事实后重新检测。'):value.status==='incomplete'?reason('CORE_SUITE_CURRENT_INCOMPLETE','Core 报告本 runtime 的套件不完整。','在本客户端按 Core 组件说明修复后重新检测。'):null)};
  }catch(error){if(signal.aborted)throw interrupted();const code=['CORE_SUITE_DECLARATION_MISSING','CORE_SUITE_DECLARATION_INVALID'].includes(error.code)?error.code:'CORE_SUITE_READ_FAILED';return unknown(row,code,code==='CORE_SUITE_DECLARATION_MISSING'?'本 runtime 未提供 Core 套件声明方法。':'本次 Core 套件声明读取失败。','启用支持 protocol 1 getSuiteDeclaration 的 Core，查看其设置并重新检测。')}
 }
 async function agent(channel,signal){
  const initial=agentBase(channel);let row=initial;
  try{
   if(await abortable(profileState({channel}),signal)==='absent')return{...initial,status:'not-installed',identity:{pluginName:AGENT_INSTALLATION_TARGET.pluginName,marketplace:AGENT_INSTALLATION_TARGET.marketplace}};
   const config=await abortable(discoverReader({channel,signal,workerNode}),signal);
   if(!validReader(config))throw new AppHostError('AGENT_READER_DISCOVERY_INVALID','Invalid automatic reader.',{},503);
   row={...initial,identity:{pluginName:config.pluginName,marketplace:config.marketplace}};
   const invoke=(stage,args)=>abortable(runCommand({channel,reader:config,args,signal,workerNode,stage}),signal);
   const versionFailure=readerVersionFailure(channel,await invoke('version',['--version']));
   if(versionFailure)return unknown(row,versionFailure,versionFailure==='AGENT_READER_VERSION_INVALID'?'官方 CLI 版本输出格式无效。':'官方 CLI 低于支持的最低版本。','通过官方渠道升级 Claude Code 至 2.1.301 或以上、Codex CLI 至 0.162.1 或以上，再重新检测。');
   const suffix=channel==='codex'?['--disable','remote_plugin']:[];
   const text=await invoke('plugin-list',['plugin','list','--json',...suffix]);
   const sourceText=await invoke('marketplace-list',['plugin','marketplace','list','--json',...suffix]);
   let plugins,marketplaces;try{plugins=JSON.parse(text);marketplaces=JSON.parse(sourceText)}catch{inventoryError()}
   return{...row,...parseInventory(channel,plugins,marketplaces,config)};
  }catch(error){
   const diagnostic=installationCommandDiagnostic(error.details?.command);
   if(diagnostic)try{logger?.warn?.('APPHOST_INSTALLATION_COMMAND_DIAGNOSTIC %s',JSON.stringify({channel,code:failureCodes.has(error.code)?error.code:'AGENT_READER_FAILED',...diagnostic}))}catch{}
   if(signal.aborted||error.code==='INSTALLATION_STATUS_CANCELLED')throw interrupted();
   const code=failureCodes.has(error.code)?error.code:'AGENT_READER_FAILED';const messages={AGENT_READER_UNAVAILABLE:'未在当前用户的 PATH 或常见安装位置找到官方 CLI。',AGENT_SHELL_ENV_UNAVAILABLE:'登录 shell 的 PATH 未能读取。',AGENT_PROFILE_UNAVAILABLE:'当前用户的官方资料目录不存在或不可访问。',AGENT_READER_TIMEOUT:'本次官方只读检测超时。',AGENT_INVENTORY_INVALID:'官方清单 JSON 不符合受支持的格式。',AGENT_READER_DISCOVERY_INVALID:'自动发现的官方 CLI 信息无效。',AGENT_READER_ENTRYPOINT_UNAVAILABLE:'已发现 Windows 命令入口，但官方 npm 程序文件缺失。'};return unknown(row,code,messages[code]??'本次官方清单读取未能提供完整且一致的安装事实。','在终端确认官方 CLI 可运行，并在其用户级插件页面检查清单、权限和市场来源后重新检测。')}
 }
 async function other(signal){
  const profileDir=client==='hanamesh'?(typeof otherProfileDir==='function'?otherProfileDir():otherProfileDir):null;
  if(profileDir)return abortable(profileSuite(base('dsh','other-runtime','other-client','DSH 桌面版 profile（磁盘只读清单；运行中的 DSH 由其自身监听回答）'),profileDir,suite),signal);
  return unknown(base(client==='dsh'?'hanamesh':'dsh','other-runtime','other-client','另一客户端 runtime（须由其自身监听回答）'),'OTHER_RUNTIME_NOT_OBSERVED','本监听未读取另一客户端的 runtime。','启动该客户端，并向其已广告的状态入口显式检测。');
 }
 const read=async({signal}={})=>{
  if(closed||signal?.aborted)throw interrupted();const controller=new AbortController();active.add(controller);const combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
  try{const current=await runtime(combined);const agents=await Promise.all(['claude','codex'].map(channel=>agent(channel,combined)));if(combined.aborted)throw interrupted();
   return{schemaVersion:1,client,checkedAt:new Date().toISOString(),observations:[current,
    await other(combined),...agents,
    unknown(base('codex','desktop-app','desktop-app','Codex / ChatGPT 桌面 App（独立作用域）'),'CODEX_DESKTOP_SCOPE_UNOBSERVABLE','Codex CLI 清单不能证明桌面 App 的安装。','在桌面 App 的插件目录核对；需官方公开桌面状态协议后才可接入。')]};
  }finally{active.delete(controller)}
 };
 read.close=()=>{closed=true;for(const controller of active)controller.abort();active.clear()};return read;
}

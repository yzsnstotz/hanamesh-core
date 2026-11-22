import semver from 'semver';
import {randomUUID} from 'node:crypto';
import {requireCondition} from '../errors.js';

export const SUITE_BUNDLE='@hanamesh/hanamesh';
export const SUITE_TARGET='hanamesh:suite-upgrade';
export const CORE_SUITE_DECLARATION_MISSING='Core 未提供套件声明';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=value=>typeof value==='string'&&value.length>0;
const exact=value=>typeof value==='string'&&semver.valid(value)===value;
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const nullableText=value=>value===null||text(value);
const invalid=()=>requireCondition(false,'CORE_SUITE_DECLARATION_INVALID','Core 套件声明无法用于精确安装。',{},503);
function validInstallation(value,version){
  return object(value)&&value.name===SUITE_BUNDLE&&value.version===version&&text(value.command)&&Array.isArray(value.args)&&value.args.length>0&&value.args.every(text);
}
function matchesMembers(rows,members,key,validRow){
  if(!Array.isArray(rows)||rows.length!==members.size)return false;
  const seen=new Set();
  for(const row of rows){
    if(!object(row))return false;
    const name=row[key],member=members.get(name);
    if(!member||seen.has(name)||!validRow(row,member))return false;
    seen.add(name);
  }
  return true;
}
const memberIdentity=(row,member)=>row.id===member.id&&row.repository===member.repository;
function validateDeclaration(value){
  if(!object(value)||value.schemaVersion!==1||!text(value.checkedAt)||!nullableText(value.installCommand)||!digest(value.declarationId)||!text(value.nodeVersion)||!nullableText(value.registry)||!(value.bundleVersion===null||exact(value.bundleVersion))||!['complete','incomplete','unknown'].includes(value.completeness))invalid();
  const manifest=value.manifest;
  if(!object(manifest)||manifest.schemaVersion!==1||!text(manifest.id)||!object(manifest.bundle)||manifest.bundle.name!==SUITE_BUNDLE||!text(manifest.bundle.repository)||!object(manifest.core)||!text(manifest.core.name)||!exact(manifest.core.version)||!text(manifest.core.repository)||!Array.isArray(manifest.components))invalid();
  const members=new Map([[manifest.core.name,{id:'core',repository:manifest.core.repository}]]);
  const ids=new Set(['core']);
  for(const row of manifest.components){
    if(!object(row)||!text(row.id)||ids.has(row.id)||!text(row.moduleName)||members.has(row.moduleName)||!text(row.versionRange)||!text(row.repository))invalid();
    members.set(row.moduleName,row);
    ids.add(row.id);
  }
  if(!matchesMembers(value.installed,members,'moduleName',(row,member)=>memberIdentity(row,member)&&text(row.requiredRange)&&(row.actualVersion===null||exact(row.actualVersion))&&nullableText(row.actualRepository)&&text(row.status)&&(row.runningVersion===undefined||exact(row.runningVersion))))invalid();
  if(!Array.isArray(value.upgrades)||!Array.isArray(value.blocked)||!object(value.peerFacts)||!object(value.metadataDigests))invalid();
  if(value.bundleVersion===null&&value.upgrades.length>0)invalid();
  for(const row of value.blocked)if(!object(row)||!text(row.code)||(row.bundleVersion!==undefined&&!exact(row.bundleVersion))||(row.moduleName!==undefined&&!text(row.moduleName)))invalid();
  if(!Object.values(value.peerFacts).every(nullableText)||!Object.values(value.metadataDigests).every(text))invalid();
  for(const upgrade of value.upgrades){
    if(!object(upgrade)||!object(upgrade.bundle)||!text(upgrade.bundle.id)||upgrade.bundle.moduleName!==manifest.bundle.name||!exact(upgrade.bundle.version)||upgrade.bundle.repository!==manifest.bundle.repository||!digest(upgrade.bundle.metadataDigest)||!text(upgrade.registry))invalid();
    if(!validInstallation(upgrade.installation,upgrade.bundle.version))invalid();
    if(!matchesMembers(upgrade.targets,members,'moduleName',(row,member)=>memberIdentity(row,member)&&exact(row.version)&&digest(row.metadataDigest)))invalid();
  }
  if(value.legacy!==undefined){
    if(value.bundleVersion!==null)invalid();
    validateLegacyAssessment(value.legacy,members);
  }
  return structuredClone(value);
}
/** Validate the format of Core's verdict and forward it unchanged. */
function validateLegacyAssessment(value,members){
  const invalid=()=>requireCondition(false,'CORE_LEGACY_ASSESSMENT_INVALID','Core 旧组件判定返回格式无效。',{},503);
  if(!object(value)||!['installed','incomplete','not-installed','unknown'].includes(value.status)||!Array.isArray(value.issues))invalid();
  if(!matchesMembers(value.components,members,'name',row=>nullableText(row.version)&&text(row.status)&&(row.active===undefined||typeof row.active==='boolean')))invalid();
  if(!value.issues.every(row=>object(row)&&text(row.code)&&text(row.moduleName)&&text(row.message)))invalid();
  if(value.reason!==null&&(!object(value.reason)||!text(value.reason.code)||!text(value.reason.message)||!text(value.reason.action)))invalid();
  if(value.status!=='not-installed'&&value.reason===null)invalid();
}
/** Read only the optional protocol-1 public state; absence is unobservable, never starting/ready. */
export function readSuiteSourceState(source){

  requireCondition(source!==undefined&&source!==null,'CORE_SUITE_SOURCE_MISSING','Core 本机套件来源尚不可观察；请检查 Core 插件及其来源设置。',{},503);
  requireCondition(object(source)&&source.protocolVersion==='1'&&typeof source.getState==='function','CORE_SUITE_SOURCE_INVALID','Core 本机套件来源协议或读取接口无效。',{},503);
  let state;try{state=source.getState();}catch{requireCondition(false,'CORE_SUITE_SOURCE_INVALID','Core 本机套件来源读取失败。',{},503);}
  requireCondition(object(state)&&state.protocolVersion==='1'&&['disabled','ready','failed','disposed'].includes(state.status)&&['configured','custom','disabled'].includes(state.selection)&&(state.registry===null||text(state.registry))&&Number.isSafeInteger(state.archiveCount)&&state.archiveCount>=0&&(state.lastError===null||typeof state.lastError==='string'),'CORE_SUITE_SOURCE_INVALID','Core 本机套件来源状态无效。',{},503);
  return{protocolVersion:state.protocolVersion,status:state.status,selection:state.selection,registry:state.registry,archiveCount:state.archiveCount,lastError:state.lastError};
}
/** Consume only the optional protocol-1 Cordis method and the public C-CORE section D DTO. */
export function createCoreSuiteAdapter({core=()=>undefined,registry,suiteSourceMode=()=>'configured',suiteSourceService=()=>undefined,profileName}={}){
  const current=()=>{const value=core();return value?.protocolVersion==='1'&&typeof value.getSuiteDeclaration==='function'?value:undefined;};
  // Market-local service identity only: Core protocol 1 supplies no revision/generation.
  const instances=new WeakMap();
  function sourceBinding(){
    const mode=suiteSourceMode();
    requireCondition(['configured','core'].includes(mode),'INVALID_SUITE_SOURCE_SETTINGS','套件安装包来源选择无效。');
    if(mode==='configured')return{mode,registry};
    const source=suiteSourceService();
    const state=readSuiteSourceState(source);
    requireCondition(state.status==='ready'&&state.selection!=='disabled'&&text(state.registry),'CORE_SUITE_SOURCE_NOT_READY','Core 本机套件来源未就绪（'+state.status+'）。',{status:state.status,selection:state.selection,lastError:state.lastError},409);
    let url;try{url=new URL(state.registry);}catch{}
    requireCondition(url&&['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&!url.search&&!url.hash,'CORE_SUITE_SOURCE_INVALID','Core 本机套件来源 registry 无效。',{},503);
    if(!instances.has(source))instances.set(source,randomUUID());
    return{mode,registry:state.registry,selection:state.selection,serviceInstance:instances.get(source)};
  }
  async function read(request){
    const service=current();
    requireCondition(service,'CORE_SUITE_DECLARATION_MISSING',CORE_SUITE_DECLARATION_MISSING,{},503);
    const result=request===undefined?await service.getSuiteDeclaration():await service.getSuiteDeclaration(request);
    requireCondition(current()===service,'CORE_SUITE_DECLARATION_MISSING',CORE_SUITE_DECLARATION_MISSING,{},503);
    return validateDeclaration(result);
  }
  const get=async({bundleVersion}={})=>{
    const binding=sourceBinding();
    const declaration=await read({...(binding.registry===undefined?{}:{registry:binding.registry}),...(profileName===undefined?{}:{profile:profileName}),...(bundleVersion===undefined?{}:{bundleVersion})});
    requireCondition(JSON.stringify(sourceBinding())===JSON.stringify(binding),'SUITE_PLAN_CHANGED','套件安装包来源已变化，请重新查看并确认。',{},409);
    requireCondition(declaration.completeness==='complete','CORE_SUITE_CURRENT_INCOMPLETE','Core 套件完整性：'+declaration.completeness,{completeness:declaration.completeness,blocked:declaration.blocked},409);
    let expected;try{const url=new URL(binding.registry);url.pathname=url.pathname.replace(/\/$/,'')+'/';expected=url.href;}catch{}
    requireCondition(text(declaration.registry)&&(binding.registry===undefined||declaration.registry===expected),'CORE_SUITE_SOURCE_MISMATCH','Core 声明来源与执行 registry 不符。',{blocked:declaration.blocked},409);
    requireCondition(declaration.upgrades.length>0,'CORE_SUITE_NO_COMPATIBLE_TUPLE','Core 未提供可执行升级组合。',{blocked:declaration.blocked},409);
    // The first displayed Core tuple is the presentation default; Market never ranks versions.
    const selectedUpgrade=declaration.upgrades[0];
    requireCondition(selectedUpgrade.registry===declaration.registry,'CORE_SUITE_SOURCE_MISMATCH','Core 升级组合来源与执行 registry 不符。',{},409);
    const targets=new Map(selectedUpgrade.targets.map(row=>[row.moduleName,row.version]));
    const components=declaration.installed.map(({moduleName,actualVersion})=>{
      if(!exact(actualVersion))invalid();
      return{name:moduleName,label:moduleName,from:actualVersion,to:targets.get(moduleName)};
    });
    return{available:true,bundle:{name:SUITE_BUNDLE,from:declaration.bundleVersion,to:selectedUpgrade.bundle.version},components,installation:selectedUpgrade.installation,installCommand:declaration.installCommand,sourceBinding:binding,declarationId:declaration.declarationId,registry:declaration.registry,selectedUpgrade,physicalBaseline:declaration.installed,upgrades:declaration.upgrades,blocked:declaration.blocked};
  };
  Object.defineProperty(get,'unavailable',{get:()=>current()?null:CORE_SUITE_DECLARATION_MISSING});
  get.readFacts=async()=>{
    const declaration=await read();
    if(declaration.legacy)return{...declaration.legacy,version:null,checkedAt:declaration.checkedAt,completeness:declaration.completeness,blocked:[...declaration.blocked.filter(row=>row.code.startsWith('CORE_SUITE_CLIENT_PEER_')),...declaration.legacy.issues.map(({code,moduleName})=>({code,moduleName}))]};
    return{status:declaration.completeness==='complete'?'installed':declaration.completeness,completeness:declaration.completeness,version:declaration.bundleVersion,checkedAt:declaration.checkedAt,
      components:declaration.installed.map(row=>({...row,name:row.moduleName,label:row.moduleName,version:row.actualVersion})),blocked:declaration.blocked};
  };
  return get;
}
/** Validate the normalized exact plan at the Market execution boundary. */
export async function prepareSuiteUpgrade({coreSuitePlan,bundleVersion}={}){
  requireCondition(typeof coreSuitePlan==='function','CORE_SUITE_DECLARATION_MISSING',CORE_SUITE_DECLARATION_MISSING,{},503);
  const plan=await coreSuitePlan(bundleVersion===undefined?undefined:{bundleVersion});
  requireCondition(plan!==undefined&&plan!==null,'CORE_SUITE_DECLARATION_MISSING',CORE_SUITE_DECLARATION_MISSING,{},503);
  if(!object(plan)||typeof plan.available!=='boolean'||!object(plan.bundle)||plan.bundle.name!==SUITE_BUNDLE||!exact(plan.bundle.from)||!exact(plan.bundle.to)||!nullableText(plan.installCommand)||!validInstallation(plan.installation,plan.bundle.to)||!Array.isArray(plan.components)||plan.components.length===0)invalid();
  const names=new Set();
  for(const row of plan.components){
    if(!object(row)||!text(row.name)||!text(row.label)||names.has(row.name)||!exact(row.from)||!exact(row.to))invalid();
    names.add(row.name);
  }
  return structuredClone(plan);
}

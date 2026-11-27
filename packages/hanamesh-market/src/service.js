import {randomUUID} from 'node:crypto';
import semver from 'semver';
import {createCatalogClient,readJson,publicOrigin,MarketError,ensure} from './catalog.js';
import {createDiscoveryHttpClient} from './discovery.js';
import {createNativeMarketPolicy} from './native-market-policy.js';
import {createDocumentReader} from './documents.js';
import {SerialQueue} from './errors.js';
import {createCoreSuiteAdapter,prepareSuiteUpgrade,readSuiteSourceState,SUITE_TARGET} from './library/suite.js';
import {catalogPackageTargets,sameInstallTarget,pinnedGithubSpec} from './library/github-target.js';
const empty={schema:1,revision:0,settings:null};
export const initialState=()=>structuredClone(empty);
const installName=target=>target.source==='npm'?target.name:target.packageName;
export function nativeInstallation(name,version,bundles){
 if(bundles===null)return{status:'unknown'};const bundle=bundles.find(row=>row.name===name);
 if(!bundle||!bundle.installed&&bundle.availability!=='installation')return{status:'not-installed'};
 const installedVersion=bundle.version;
 if(!bundle.installed)return{status:'provided',installedVersion};
 if(version===null||installedVersion===version)return{status:'installed',installedVersion};
 return{status:semver.valid(version??'')&&semver.valid(installedVersion??'')&&semver.gt(version,installedVersion)?'update-available':'different-version',installedVersion};
}
export function createMarketService({config={},domain,manager=()=>undefined,core=()=>undefined,suiteSource=()=>undefined,appHost=()=>undefined,fetchImpl=fetch,anchor,logger}){
 let state=initialState();const writer=new SerialQueue(),reviews=new Map(),lifetime=new AbortController();
 const transport=(url,init={})=>fetchImpl(url,{...init,signal:AbortSignal.any([lifetime.signal,...(init.signal?[init.signal]:[])])});
 const defaults={websiteOrigin:config.websiteOrigin??'https://market.hanamesh.com',serverOrigin:config.serverOrigin??'https://api.hanamesh.com',registry:config.registry||null,suiteSourceMode:'configured'};
 const settings=()=>state.settings===null?defaults:{...defaults,...Object.fromEntries(Object.keys(defaults).filter(key=>Object.hasOwn(state.settings,key)).map(key=>[key,state.settings[key]]))};
 const client=()=>createCatalogClient({...settings(),fetchImpl:transport,timeoutMs:config.readTimeoutMs??8000,maxBytes:config.maxResponseBytes??2097152});
 const discoveryClient=()=>createDiscoveryHttpClient({...settings(),fetchImpl:transport,timeoutMs:config.readTimeoutMs??8000,maxBytes:config.maxResponseBytes??2097152});
 const policy=createNativeMarketPolicy({anchor,pluginManager:manager});
 const documents=createDocumentReader({fetchImpl:transport,timeoutMs:config.readTimeoutMs??8000,lifetime:lifetime.signal});
 let adapterRevision=-1,adapter;const suiteAdapter=()=>{if(adapterRevision!==state.revision){adapterRevision=state.revision;adapter=createCoreSuiteAdapter({core,registry:settings().registry??undefined,suiteSourceMode:()=>settings().suiteSourceMode,suiteSourceService:suiteSource,profileName:config.profileName});}return adapter;};
 async function bundles(){try{const native=manager();ensure(typeof native?.listBundles==='function','DSH_BUNDLES_UNAVAILABLE',503);const rows=await native.listBundles();ensure(manager()===native&&Array.isArray(rows),'DSH_BUNDLES_UNAVAILABLE',503);return rows;}catch(error){logger?.warn?.('hanamesh-market native installed facts unavailable: %s',error.code??'DSH_BUNDLES_UNAVAILABLE');return null;}}
 function project(item,rows){const targets=catalogPackageTargets(item),target=targets[0];return{...item,nativeInstallation:target?nativeInstallation(installName(target),target.source==='npm'?target.version:null,rows):{status:'not-installed'},...(target?{nativeUpdate:{action:'openPackage',packageName:installName(target)}}:{})};}
 async function resolveTarget(input){
  ensure(input&&typeof input==='object'&&Object.keys(input).every(key=>['itemId','version'].includes(key)),'INVALID_INPUT');
  if(input.itemId===SUITE_TARGET){const plan=await prepareSuiteUpgrade({coreSuitePlan:suiteAdapter(),bundleVersion:input.version});return{item:{hanaId:SUITE_TARGET,id:SUITE_TARGET,displayName:'HanaMesh 套件',package:{name:plan.bundle.name},kind:'suite-upgrade',suiteUpgrade:plan},target:{source:'npm',name:plan.bundle.name,version:plan.bundle.to,allowBuild:[]},suite:plan};}
  ensure(typeof input.itemId==='string','INVALID_INPUT');
  const item=await client().detail(input.itemId);
  let [target]=catalogPackageTargets(item);
  ensure(target,'NOT_INSTALLABLE',409);if(input.version!==undefined){ensure(target.source==='npm'&&semver.valid(input.version)===input.version,'INVALID_VERSION');target={...target,version:input.version};}
  return{item:{...item,id:item.hanaId,package:{name:installName(target)},kind:'plugin'},target};
 }
 async function nativePlan(target,suite,expectedAction){const rows=await bundles();ensure(rows!==null,'DSH_BUNDLES_UNAVAILABLE',503);const installed=rows.some(row=>row.name===installName(target)&&(row.installed||row.availability==='installation'));const action=suite||installed?'openPackage':'install';if(expectedAction)ensure(action===expectedAction,'NATIVE_INSTALLATION_CHANGED',409);if(suite)return{action:'openPackage',metadataPlan:suite};if(!installed)return{action:'install'};if(target.source==='github')return{action:'openPackage'};const native=manager();ensure(typeof native?.registries==='function','DSH_REGISTRY_UNAVAILABLE',503);const plan=await native.registries();ensure(manager()===native,'DSH_REGISTRY_UNAVAILABLE',503);const registry=settings().registry??plan.registry??plan.resolved;ensure(typeof registry==='string','DSH_REGISTRY_UNAVAILABLE',503);return{action:'openPackage',metadataPlan:{registry}};}
 async function manifestFor(target,suite){
  if(target.source==='github'){const path=target.path?target.path+'/':'';return{manifest:await readJson(transport,'https://raw.githubusercontent.com/'+target.repo+'/'+target.ref+'/'+path+'package.json',{method:'GET'},{timeoutMs:config.readTimeoutMs??8000}),install:{spec:pinnedGithubSpec(target.repo,target.ref,target.path),title:'',version:''}};}
  const native=manager();ensure(typeof native?.inspect==='function','DSH_INSTALL_UNAVAILABLE',503);
  const result=suite?{status:'accepted',registry:suite.registry}:await native.inspect(target.name+'@'+target.version,settings().registry?{registry:settings().registry}:undefined);ensure(result.status==='accepted',result.problem==='not-a-bundle'?'DSH_BUNDLE_REQUIRED':'DSH_INSPECT_FAILED',409);
  const registry=result.registry??(await native.registries()).resolved;ensure(typeof registry==='string','DSH_REGISTRY_UNAVAILABLE',503);const origin=new URL(registry);ensure(!origin.username&&!origin.password&&!origin.search&&!origin.hash,'INVALID_REGISTRY');publicOrigin(origin.origin);
  const manifest=await readJson(transport,new URL(encodeURIComponent(target.name)+'/'+encodeURIComponent(target.version),registry.endsWith('/')?registry:registry+'/').href,{method:'GET'},{timeoutMs:config.readTimeoutMs??8000});
  return{manifest,install:{spec:target.name+'@'+target.version,registry,title:'',version:target.version}};
 }
 function isApplication(item,manifest){
  return item.categories?.includes('hanamesh-app')||Object.hasOwn(manifest.hanamesh??{},'app');
 }
 function isApplicationTarget(item,manifest,nativeAction){
  if(nativeAction!=='install'||!isApplication(item,manifest))return false;
  const declaration=manifest.hanamesh?.app;
  ensure(declaration===true||typeof declaration==='string'&&declaration.length>0,'APPHOST_DEFINITION_REQUIRED',409);
  return true;
 }
 function applicationInstaller(){
  const provider=appHost();
  return typeof provider?.installApplication==='function'?provider:undefined;
 }
 async function installApplication(provider,target,install){
  let result;
  try{result=await provider.installApplication({target,version:install.version,...(target.source==='npm'?{registry:install.registry}:{})});}
  catch(error){
   const code=typeof error?.code==='string'&&/^[A-Z][A-Z0-9_]+$/u.test(error.code)?error.code:'APPHOST_INSTALL_FAILED';
   const failure=new MarketError(code,Number.isInteger(error?.status)&&error.status>=400&&error.status<=599?error.status:502);
   if(['not-needed','restored','failed'].includes(error?.recovery?.status))failure.recovery=error.recovery.status;
   throw failure;
  }
  ensure(result?.status==='ready'&&result.packageName===installName(target)&&result.version===install.version&&
    typeof result.restartRequired==='boolean'&&typeof result.appId==='string'&&result.appId,'APPHOST_INSTALL_READBACK_INVALID',502);
  return{status:result.status,packageName:result.packageName,version:result.version,appId:result.appId,restartRequired:result.restartRequired};
 }
 return{
  async init(){state=await domain.global.get();ensure(state?.schema===1&&Number.isSafeInteger(state.revision),'MARKET_STATE_INVALID',500);return this;},
  settings(){return structuredClone(settings());},
  async saveSettings(input){return writer.run(async()=>{ensure(input&&Object.keys(input).every(key=>Object.hasOwn(defaults,key)),'INVALID_SETTINGS');const next={...settings(),...input};next.websiteOrigin=publicOrigin(next.websiteOrigin);next.serverOrigin=publicOrigin(next.serverOrigin);ensure(next.registry===null||typeof next.registry==='string','INVALID_REGISTRY');if(next.registry)publicOrigin(new URL(next.registry).origin);ensure(['configured','core'].includes(next.suiteSourceMode),'INVALID_SUITE_SOURCE_SETTINGS');const record={schema:1,revision:state.revision+1,settings:next};await domain.global.set(record);state=record;reviews.clear();return this.settings();});},
  async discovery(kind,input={},options={}){
   const inputs={domains:[],stage:[],featured:['domain'],detail:['hanaId'],fields:['hanaIds']};
   ensure(Object.hasOwn(inputs,kind),'DISCOVERY_READ_UNAVAILABLE',404);
   ensure(input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).every(key=>inputs[kind].includes(key)),'INVALID_QUERY');
   const revision=state.revision,source=discoveryClient();let value;
   if(kind==='domains')value=await source.domains(options);
   else if(kind==='stage')value=await source.stage(options);
   else if(kind==='detail')value=await source.detail(input.hanaId,options);
   else if(kind==='fields'){
    value=await source.listFields(input.hanaIds,options);
    ensure(value.items.length===input.hanaIds.length&&new Set(value.items.map(row=>row.hanaId)).size===value.items.length&&value.items.every(row=>input.hanaIds.includes(row.hanaId)),'DISCOVERY_RESPONSE_INVALID',502);
   }else{
    const [page,rows]=await Promise.all([source.featured(input.domain,options),bundles()]);
    value={...page,items:page.items.map(item=>project(item,rows)),nativeBundles:rows};
   }
   ensure(revision===state.revision,'CATALOG_CHANGED',409);return value;
  },
  async list(query,options){const revision=state.revision;const [page,rows]=await Promise.all([client().list(query,options),bundles()]);ensure(revision===state.revision,'CATALOG_CHANGED',409);return{...page,items:page.items.map(item=>project(item,rows)),nativeBundles:rows};},
  async search(input,options){
   const revision=state.revision,[page,rows]=await Promise.all([client().search(input,options),bundles()]);
   ensure(revision===state.revision,'CATALOG_CHANGED',409);
   return {...page,items:page.items.map(item=>project(item,rows)),nativeBundles:rows};
  },
  async detail(id,options){
   const revision=state.revision,[item,rows]=await Promise.all([client().detail(id,options),bundles()]);
   const value=project(item,rows),target=catalogPackageTargets(item)[0],bundle=target&&rows?.find(row=>row.name===installName(target));
   // A pinned Git target has no catalog npm version. Read its immutable manifest only for
   // an installed Git copy's detail; the official SDK owns repository-origin eligibility.
   if(target?.source==='github'&&bundle?.installed&&bundle.update==='git'){
    const facts=await manifestFor(target);ensure(facts.manifest.name===target.packageName&&semver.valid(facts.manifest.version)&&facts.manifest.dsh?.bundle?.patch,'PACKAGE_IDENTITY_CHANGED',409);
    value.nativeInstallation=nativeInstallation(target.packageName,facts.manifest.version,rows);
    const compatibility=await policy.compatibility(facts.manifest);
    const update=compatibility.compatible||compatibility.exempted?await policy.gitUpdate(bundle,facts.install.spec,facts.manifest.version):null;
    if(update)value.nativeUpdate={action:'update',target:update};
   }
   ensure(revision===state.revision,'CATALOG_CHANGED',409);return value;
  },
  async prepare(input){
   const revision=state.revision,{item,target,suite}=await resolveTarget(input);
   const native=await nativePlan(target,suite),facts=await manifestFor(target,native.metadataPlan);
   ensure(facts.manifest.name===installName(target)&&semver.valid(facts.manifest.version),'PACKAGE_IDENTITY_CHANGED',409);
   if(target.source==='npm')ensure(facts.manifest.version===target.version,'PACKAGE_IDENTITY_CHANGED',409);
   ensure(facts.manifest.dsh?.bundle?.patch,'DSH_BUNDLE_REQUIRED',409);
   const compatibility=await policy.compatibility(facts.manifest);ensure(compatibility.compatible||compatibility.exempted,'DSH_INCOMPATIBLE',409);
   const applicationTarget=isApplicationTarget(item,facts.manifest,native.action);
   const provider=applicationTarget?applicationInstaller():undefined;
   const action=provider?'installApplication':native.action;
   ensure(revision===state.revision,'CATALOG_CHANGED',409);
   const install={...facts.install,title:item.displayName,version:facts.manifest.version};
   const value={reviewId:randomUUID(),item,target,install,compatibility,action,...(suite?{suite}:{})};
   reviews.set(value.reviewId,{...value,revision,input:structuredClone(input),nativeAction:native.action,applicationTarget,provider});
   return value;
  },
  async confirm({reviewId}){
   const review=reviews.get(reviewId);
   ensure(review,'CONFIRMATION_STALE',409);
   reviews.delete(reviewId);ensure(review.revision===state.revision,'CATALOG_CHANGED',409);
   const current=await resolveTarget(review.input);
   ensure(sameInstallTarget(current.target,review.target),'CATALOG_CHANGED',409);
   if(review.suite){
    const binding=plan=>({declarationId:plan.declarationId,sourceBinding:plan.sourceBinding,selectedUpgrade:plan.selectedUpgrade,physicalBaseline:plan.physicalBaseline});
    ensure(JSON.stringify(binding(current.suite))===JSON.stringify(binding(review.suite)),'SUITE_PLAN_CHANGED',409);
   }
   const native=await nativePlan(review.target,review.suite,review.nativeAction);
   const fresh=await manifestFor(review.target,native.metadataPlan);
   ensure((fresh.install.registry??null)===(review.install.registry??null),'CATALOG_CHANGED',409);
   ensure(fresh.manifest.name===installName(review.target)&&fresh.manifest.version===review.install.version&&
    fresh.manifest.dsh?.bundle?.patch,'PACKAGE_IDENTITY_CHANGED',409);
   const compatibility=await policy.compatibility(fresh.manifest);
   ensure(compatibility.compatible||compatibility.exempted,'DSH_INCOMPATIBLE',409);
   const applicationTarget=isApplicationTarget(current.item,fresh.manifest,native.action);
   ensure(applicationTarget===review.applicationTarget,'CATALOG_CHANGED',409);
   ensure(review.revision===state.revision,'CATALOG_CHANGED',409);
   if(applicationTarget)ensure(applicationInstaller()===review.provider,'APPHOST_INSTALL_CHANGED',409);
   if(review.action==='installApplication'){
    const application=await installApplication(review.provider,review.target,review.install);
    return{action:review.action,application};
   }
   return{install:review.install,target:review.target,item:review.item,compatibility,action:review.action,...(review.suite?{suite:review.suite}:{})};
  },
  cancel({reviewId}){reviews.delete(reviewId);return{cancelled:true};},
  async versions({itemId}){const{target}=await resolveTarget({itemId});ensure(target.source==='npm','VERSIONS_UNAVAILABLE');const native=manager();ensure(typeof native?.registries==='function','DSH_REGISTRY_UNAVAILABLE',503);const plan=await native.registries(),registry=settings().registry??plan.registry??plan.resolved;ensure(typeof registry==='string','DSH_REGISTRY_UNAVAILABLE',503);const value=await readJson(transport,new URL(encodeURIComponent(target.name),registry.endsWith('/')?registry:registry+'/').href,{method:'GET'},{maxBytes:config.versionLookupMaxBytes??16777216,timeoutMs:config.readTimeoutMs??8000});ensure(value.name===target.name&&value.versions,'VERSIONS_INVALID',502);const versions=[];for(const version of Object.keys(value.versions).filter(v=>semver.valid(v)===v).sort(semver.rcompare)){const manifest=value.versions[version];if(manifest.name!==target.name||manifest.version!==version||!manifest.dsh?.bundle?.patch)continue;versions.push({version,publishedAt:value.time?.[version]??null,prerelease:semver.prerelease(version)!==null,compatibility:await policy.compatibility(manifest)});}return{versions};},
  async document({itemId,version,language},signal){const item=await client().detail(itemId,{signal});let target=catalogPackageTargets(item)[0];if(version){ensure(target?.source==='npm'&&semver.valid(version)===version,'INVALID_VERSION');target={...target,version};}return documents.read({item,target,version,language},signal);},
  image:(...args)=>documents.image(...args),
  async suitePlan({version}={}){return prepareSuiteUpgrade({coreSuitePlan:suiteAdapter(),...(version?{bundleVersion:version}:{})});},
  async suiteStatus(){return suiteAdapter().readFacts();},
  suiteSource(){return readSuiteSourceState(suiteSource());},
  async close(){lifetime.abort();reviews.clear();documents.close();await writer.drained();},
 };
}

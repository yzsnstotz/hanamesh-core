import {marketMessages,marketContentLocale,marketLocalizedSelection,marketLocaleNames} from './client-locale.js';
import * as React from 'react';
import {Modal,DetailDocument,useDetailDocumentLabels} from '@deepseek-ai/dsh-client-ui-primitives';
import {createNativeMarketActions,createNativeMarketListing,formatDiscoveryScore,formatDiscoveryCount,createMarketDiscoveryState,withDiscoveryFields,withoutDiscoveryFields} from './client-state.js';
import {marketStyles,marketAssets,marketIcons,marketDomains,marketDomainColors} from './client-visual.js';
const h=React.createElement;
export const name='hanamesh-market-client',inject=['slots','locale'];
let locale,navigate;
const t=key=>locale?locale.bind('hanamesh.market')(key):marketMessages.zh[key]??key;
const language=()=>locale?.getSnapshot?.().active??'zh';
function useLocale(){const[,set]=React.useState(0);React.useEffect(()=>locale?.subscribe(()=>set(n=>n+1)),[]);}
async function request(path,body,signal){const response=await globalThis.fetch('/hanamesh/market/'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',redirect:'error',headers:{'content-type':'application/json','X-HanaMesh-Client':'market-v1'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal});const value=await response.json();if(!response.ok){const code=value.error?.code??'MARKET_READ_FAILED';const guidance=code==='LIBRARY_INSTALL_UNAVAILABLE'?' '+t('appInstallUnavailable'):'';const recovery=value.error?.recovery;const status=recovery==='restored'?' '+t('appRecoveryRestored'):recovery==='failed'?' '+t('appRecoveryFailed'):'';throw Object.assign(new Error(code+guidance+status),{code});}return value;}
function safeLink(value){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}}
const targetOf=item=>item.oneClickInstall?.allowed===true?(item.installMethods??[]).find(method=>['dsh','hanamesh'].includes(method.channel)&&method.target)?.target:null;
const nameOf=item=>{const target=targetOf(item);return target?(target.source==='npm'?target.name:target.packageName):item.npmPackageName;};
const summary=item=>localized(item.summary);
const websiteFor=(item,origin)=>safeLink(origin+'/hana/'+encodeURIComponent(item.hanaId));
function ErrorNotice({error,retry}){return error?h('div',{role:'alert',className:'hm-m-error'},h('p',null,String(error.message??error)),retry?h('button',{type:'button',onClick:retry},t('retry')):null):null;}
export function NativeMarketExternalActions({command,website,copy}){return h('div',{className:'hm-m-actions'},h('button',{type:'button',disabled:!command,onClick:()=>copy(command)},t('copy')),safeLink(website)?h('a',{href:safeLink(website),target:'_blank',rel:'noopener noreferrer'},t('website')):null);}
export function NativeMarketResults({snapshot,card,onRetry,onMore}){return h('div',null,snapshot.status==='loading'?h('p',{role:'status'},t(snapshot.items.length?'loadingPrevious':'loading')):null,snapshot.semanticNotice?h('p',{role:'status'},snapshot.semanticNotice):null,snapshot.error?h('div',{role:'alert'},h('p',null,t('failurePrevious')),h('p',null,String(snapshot.error)),h('button',{type:'button',onClick:onRetry},t('retry'))):null,h('div',{className:'hm-m-grid','aria-busy':snapshot.status==='loading'},...snapshot.items.map(item=>card(item)),...(snapshot.status==='loading'&&!snapshot.items.length?Array.from({length:6},(_,key)=>h('article',{className:'hm-m-skeleton',key,'aria-hidden':true,'data-hanamesh-market-skeleton':true},h('span'),h('span'),h('span'))):[])),snapshot.status==='ready'&&!snapshot.items.length?h('p',{className:'hm-m-empty'},t('none')):null,snapshot.hasMore?h('button',{type:'button',disabled:snapshot.status!=='ready',onClick:onMore},t('more')):null);}
export function NativeMarketConfirmation({review,actions,Modal:NativeModal=Modal,onClose,onConfirm}){
 const item=review.item??review.entry,manage=review.action==='openPackage',close=()=>{actions.cancel();onClose?.();};
 const title=manage?t('manage'):t('installTitle').replace('{name}',()=>item.displayName);
 const label=manage?t('manage'):t('confirm');
 return h(NativeModal,{open:true,title,closeLabel:t('close'),onClose:close,footer:h('div',{className:'hm-market hm-m-confirmation hm-m-actions'},h('button',{type:'button',onClick:close},t('cancel')),h('button',{type:'button',className:'pri',onClick:onConfirm??(()=>{actions.confirm(review);onClose?.();})},label))},h('section',{className:'hm-market hm-m-confirmation'},h('div',{className:'row'},h('img',{src:marketAssets.dsh,width:32,height:32,alt:''}),h('div',null,h('h3',null,item.displayName),h('p',{className:'fine'},review.install.version))),h('dl',null,h('dt',null,t('author')),h('dd',null,item.publisher?.name??'—'),h('dt',null,t('packageName')),h('dd',null,h('code',null,review.install.spec)),h('dt',null,t('origin')),h('dd',null,review.target?.source??'npm',' · ',review.install.registry??'—'),h('dt',null,t('version')),h('dd',null,h('code',null,review.install.version),t('exactVersion')),h('dt',null,t('compatibility')),h('dd',{className:review.compatibility?.compatible?'good':'warn'},review.compatibility?.runtimeVersion??'—',' · ',review.compatibility?.exempted?t('existingExemption'):review.compatibility?.compatible?t('compatible'):t('compatibilityUnknown'))),...(item.sourceLinks??[]).map((row,index)=>h('p',{key:index,className:'fine'},row.sourceId+' · '+row.sourceUrl)),h('p',{className:'smallnote warn'},t('installPermissions')),h('p',{className:'fine'},t('configure'))));
}
function OptionalFact({title,value}){let text;if(typeof value==='string'||typeof value==='number')text=String(value);else if(value&&typeof value==='object'){const summary=value.summary??value.label??value.text;text=typeof summary==='string'?summary:localized(summary);if(!text&&typeof value.score==='number')text=String(value.score);}return h('section',{className:'hm-m-panel'},h('h3',null,title),h('p',{className:typeof text==='string'?undefined:'hm-m-muted'},typeof text==='string'?text:t('optional')));}
function Document({item,version}){
 useLocale();const[state,set]=React.useState({status:'loading'}),[attempt,setAttempt]=React.useState(0);
 React.useEffect(()=>{let live=true;const controller=new AbortController();set(previous=>({...previous,status:'loading'}));void request('document?'+new URLSearchParams({itemId:item.hanaId,language:marketContentLocale(language()),...(version?{version}:{})}),undefined,controller.signal).then(value=>{if(live)set(value);},error=>{if(live)set({status:'error',message:error.message});});return()=>{live=false;controller.abort();};},[item.hanaId,version,attempt,language()]);
 const labels=useDetailDocumentLabels({title:t('about'),loading:t('loading'),retry:t('retry'),copy:t('copy'),copied:t('copyDone'),codeBlock:'Code',wrap:'Wrap',unwrap:'Unwrap',footnotes:'Notes'});
 return typeof DetailDocument==='function'?h(DetailDocument,{state:state.status==='found'?{status:'found',markdown:state.markdown}:state.status==='none'?{status:'none'}:state.status==='error'?state:{status:'loading'},labels,images:state.document?{resolve:path=>'/hanamesh/market/image?'+new URLSearchParams({document:state.document,path})}:undefined,onRetry:()=>setAttempt(n=>n+1)}):h('pre',null,state.markdown??state.message??t('loading'));
}
export function MarketSettings({view='page',onChanged}={}){
 useLocale();const[value,set]=React.useState(null),[error,setError]=React.useState(null),[saved,setSaved]=React.useState(false);
 const load=()=>request('settings').then(result=>set(result.settings),setError);React.useEffect(()=>{if(view==='page')void load();},[view]);
 if(view==='summary')return h('span',null,t('settingsIntro'));
 const field=(key,label)=>h('label',{key},label,h('input',{value:value[key]??'',onChange:event=>set(old=>({...old,[key]:event.target.value||null}))}));
 return h('section',{className:'hm-market hm-m-settings'},h('h2',null,t('settings')),h('p',null,t('settingsIntro')),h(ErrorNotice,{error,retry:load}),value?h('form',{onSubmit:async event=>{event.preventDefault();try{const saved=await request('settings',value);onChanged?.(saved.settings);setSaved(true);setError(null);}catch(error){setError(error);}}},field('websiteOrigin','Website / catalog'),field('serverOrigin','Semantic Host'),field('registry','npm registry'),h('label',null,'Suite source',h('select',{value:value.suiteSourceMode,onChange:event=>set(old=>({...old,suiteSourceMode:event.target.value}))},h('option',{value:'configured'},'Configured registry'),h('option',{value:'core'},'Core local source'))),h('button',{type:'submit'},t('save')),saved?h('p',{role:'status'},t('saved')):null):h('p',{role:'status'},t('loading')));
}
export function NativeMarketCard({item,summaryText,actions,onDetails,onCategory,onInspect,children,view}){
 if(view==='detail')return h('article',{'data-market-entry':item.hanaId},children);
 return h('article',{className:'card hm-m-card','data-market-entry':item.hanaId},h('header',null,h(RepositoryIcon,{native:Boolean(targetOf(item))}),h('div',{className:'grow'},h('div',{className:'card-title-line'},h('button',{type:'button',className:'hm-m-name',onClick:onDetails,title:item.displayName},item.displayName),h(FeaturedBadge,{item})),h('div',{className:'cardmeta'},[...(item.channels??[]),item.publisher?.name,targetOf(item)?.version].filter(Boolean).join(' · '))),Number.isFinite(item.signals?.stars)?h('span',{className:'hm-m-stars num'},'GitHub '+item.signals.stars.toLocaleString(marketContentLocale(language()))):null),h('div',{className:'platform-data-slot'},h('div',{className:'ds1-addon ds1-card-compact'},h(NativeMarketScore,{item,onInspect}),h('p',{className:'ds1-one carddesc',title:summaryText},summaryText),h('div',{className:'tags ds1-tags'},...(item.categories??[]).slice(0,3).map(category=>h('button',{className:'tag',key:category,type:'button',onClick:()=>onCategory(category)},category))),h(TrustBadges,{item,onInspect}))),item.matchKind==='meaning'?h('p',{className:'fine'},'按意思匹配'):null,actions,children);
}
export function NativeMarketFrame({title,tabs,activeTab,onNavigate,messages,suite,body,detail}){
 return h(React.Fragment,null,!detail?h(React.Fragment,null,h('header',{className:'marketbar'},h('div',{className:'marketbrand'},h('img',{src:marketAssets.logo,alt:''}),h('b',null,title))),h('nav',{className:'subtabs hm-m-tabs','aria-label':'HanaMesh market'},...tabs.map(row=>h('button',{type:'button',key:row.id,className:activeTab===row.id?'on':'','aria-current':activeTab===row.id?'page':undefined,onClick:()=>onNavigate(row.id)},row.label)))):null,messages,body,activeTab==='settings'?suite:null);
}
// Internal React composition seam. Views receive facts and bound actions, not a transport or DSH manager.
export function createMarketPage(presentation={}){const selected={...presentation};return function MarketPageWithPresentation(owner){return renderMarketPage(owner,selected);};}
export function MarketPage(owner){return renderMarketPage(owner,{});}
function renderMarketPage(owner,presentation,observeInstall){
 const{Frame=NativeMarketFrame,Card=NativeMarketCard,Results=NativeMarketResults,Confirmation=NativeMarketConfirmation,ExternalActions=NativeMarketExternalActions,Discovery=NativeMarketDiscovery,DomainFilters=NativeMarketDomainFilters}=presentation;
 useLocale();const[tab,setTab]=React.useState('recommend'),[query,setQuery]=React.useState(''),[filters,setFilters]=React.useState({category:'',channel:'',source:''}),[ai,setAI]=React.useState(false),[scene,setScene]=React.useState(''),[sceneRows,setSceneRows]=React.useState(null),[detail,setDetail]=React.useState(null),[review,setReview]=React.useState(null),[error,setError]=React.useState(null),[settings,setSettings]=React.useState(null),[facets,setFacets]=React.useState({}),[history,setHistory]=React.useState(null),[showPre,setShowPre]=React.useState(false),[suite,setSuite]=React.useState(null),[suitePlan,setSuitePlan]=React.useState(null),[browseOnly,setBrowseOnly]=React.useState(new Set()),[notice,setNotice]=React.useState('');
 const[factSelection,setFactSelection]=React.useState(null),[selectedVersion,setSelectedVersion]=React.useState(null);
 const discoveryRef=React.useRef(null);
 if(!discoveryRef.current)discoveryRef.current=createMarketDiscoveryState({read:(kind,input,{signal})=>{
  const paths={domains:'discovery/domains',featured:'discovery/featured',detail:'discovery/detail',stage:'discovery/stage-config',fields:'discovery/list-fields'};
  return kind==='fields'?request(paths[kind],input,signal):request(paths[kind]+(Object.keys(input).length?'?'+new URLSearchParams(input):''),undefined,signal);
 }});
 const[discovery,setDiscovery]=React.useState(discoveryRef.current.snapshot());
 const bootDiscovery=domain=>{void discoveryRef.current.domains();void discoveryRef.current.stage();void discoveryRef.current.featured(domain);};
 React.useEffect(()=>{const stop=discoveryRef.current.subscribe(setDiscovery);bootDiscovery('office');return()=>{stop();discoveryRef.current.reset();};},[]);

 const[favorites,setFavorites]=React.useState(()=>{try{return Object.fromEntries(Object.entries(JSON.parse(globalThis.localStorage?.getItem('hanamesh.market.favorites')??'{}')).map(([id,item])=>[id,withoutDiscoveryFields(item)]));}catch{return{};}});
 const native=React.useRef(null);React.useEffect(()=>{native.current=createNativeMarketActions(owner);return()=>{native.current?.cancel();native.current=null;};},[owner.install,owner.openPackage,owner.update]);
 const storeRef=React.useRef(null);
 if(!storeRef.current)storeRef.current=createNativeMarketListing({pagination:'catalog',readPage:(input,{signal})=>{
  const {ai,limit,source,q,...query}=input;
  // The existing official choice means the website's official attribute.
  if(source==='hanamesh-official')query.official=true;else if(source)query.source=source;
  if(ai)return request('search',{query:q,...query},signal);
  return request('catalog?'+new URLSearchParams({q,...query}),undefined,signal);
 }});
 const[snapshot,setSnapshot]=React.useState(storeRef.current.snapshot());
 React.useEffect(()=>{if(tab==='favorites')void discoveryRef.current.fields(Object.keys(favorites));},[tab,favorites]);

 React.useEffect(()=>{const stop=storeRef.current.subscribe(next=>{setSnapshot(next);if(next.facets)setFacets(next.facets);});void request('settings').then(value=>setSettings(value.settings),setError);void request('suite').then(setSuite,error=>setSuite({status:'unknown',blocked:[{code:error.message}]}));return()=>{stop();storeRef.current.dispose();};},[]);
 React.useEffect(()=>{const timer=setTimeout(()=>{if(!ai)void storeRef.current.load({q:query,...filters});},300);return()=>clearTimeout(timer);},[query,filters,ai]);
 const prepare=async(item,version)=>{try{setError(null);const value=await request('prepare',{itemId:item.hanaId,...(version?{version}:{})});if(value.action==='install')native.current.review({entry:value.item,install:value.install,compatibility:value.compatibility});setReview(value);}catch(error){setError(error);if(['DSH_BUNDLE_REQUIRED','NOT_INSTALLABLE'].includes(error.message))setBrowseOnly(previous=>new Set([...previous,item.hanaId]));}};
 const detailRead=React.useRef({id:null,controller:null,enrich:false});
 const closeDetail=()=>{detailRead.current.controller?.abort();detailRead.current={id:null,controller:null,enrich:false};};
 const readDetail=async(id,enrich)=>{
  detailRead.current.controller?.abort();
  const controller=new AbortController(),read={id,controller,enrich};detailRead.current=read;
  try{const fresh=await request('item?'+new URLSearchParams({itemId:id}),undefined,controller.signal);
   if(detailRead.current!==read)return;
   setDetail(fresh);if(enrich)void discoveryRef.current.detail(fresh.hanaId);
  }catch(error){if(detailRead.current===read&&!controller.signal.aborted)setError(error);}
  finally{if(detailRead.current===read)detailRead.current={id,controller:null,enrich:false};}
 };
 const showDetail=item=>{
  const {signals,...base}=withoutDiscoveryFields(item);
  setDetail(previous=>previous?.hanaId===item.hanaId?previous:base);
  setHistory(null);setSelectedVersion(null);
  return readDetail(item.hanaId,true);
 };
 React.useEffect(()=>{
  const stop=observeInstall?.(()=>{const {id,enrich}=detailRead.current;if(id!==null)void readDetail(id,enrich);});
  return()=>{stop?.();closeDetail();};
 },[observeInstall]);
 const saveFavorite=item=>{const next={...favorites};if(next[item.hanaId])delete next[item.hanaId];else next[item.hanaId]=withoutDiscoveryFields(item);try{globalThis.localStorage?.setItem('hanamesh.market.favorites',JSON.stringify(next));setFavorites(next);}catch(error){setError(error);}};
 const copy=async item=>{try{const command=(item.installMethods??[]).find(method=>typeof method.command==='string')?.command;if(!command)throw Error(t('copyMissing'));await globalThis.navigator.clipboard.writeText(command);setNotice(t('copyDone'));}catch(error){setError(error);}};
 const openPackage=item=>{try{native.current.openInstalled(nameOf(item));}catch(error){setError(error);}};
 const updatePackage=item=>{try{native.current.updateAvailable(item.nativeUpdate??{action:'openPackage',packageName:nameOf(item)});}catch(error){setError(error);}};
 const inspect=(kind,item)=>setFactSelection({kind,item});
 const refreshDetail=async()=>{if(detail)await showDetail(detail);void storeRef.current.retry();};
 const card=(base,isDetail=false)=>{
  const detailFields=isDetail&&discovery.detail?.hanaId===base.hanaId?discovery.detail:null;
  const item=withDiscoveryFields(base,detailFields??base.discovery??(tab==='favorites'?discovery.fields[base.hanaId]:undefined),Boolean(detailFields));
  const target=targetOf(item),status=!isDetail&&snapshot.bundles===null?'unknown':item.nativeInstallation?.status??'unknown',installed=['installed','provided','different-version','update-available'].includes(status),external=!target||browseOnly.has(item.hanaId),link=websiteFor(item,settings?.websiteOrigin??'https://market.hanamesh.com');
  const externalActions=h(ExternalActions,{command:(item.installMethods??[]).find(method=>typeof method.command==='string')?.command,website:link,copy:()=>void copy(item)});
  const auxiliary=h(React.Fragment,null,safeLink(item.githubRepo?'https://github.com/'+item.githubRepo:null)?h('a',{href:'https://github.com/'+item.githubRepo,target:'_blank',rel:'noopener noreferrer'},'GitHub ↗'):null,h('button',{type:'button',className:'sm',onClick:()=>saveFavorite(base)},favorites[item.hanaId]?t('unfavorite'):t('favorite')));
  const actions=external?externalActions:h('div',{className:'hm-m-actions'},h('details',{className:'cardaux'},h('summary',null,'更多'),h('div',null,auxiliary)),h('span',{className:'grow'}),installed?h('button',{type:'button',onClick:()=>status==='update-available'?updatePackage(item):openPackage(item)},t(({installed:'installed',provided:'provided','different-version':'different','update-available':'update'})[status])):h('button',{type:'button',className:'pri',disabled:status==='unknown'||!native.current?.capabilities.install,onClick:()=>void prepare(item)},t(status==='unknown'?'unknown':'install')));
  if(!isDetail)return h(Card,{key:item.hanaId,item,summaryText:overviewText(item),actions,onInspect:inspect,onDetails:()=>void showDetail(base),onCategory:category=>{setTab('search');setAI(false);setFilters(old=>({...old,category}));}});
  const version=selectedVersion??target?.version;
  const versions=history?.filter(row=>showPre||!row.prerelease)??[];
  const detailView=h('div',{className:'hm-m-detail'},h('div',{className:'detailhead'},h(RepositoryIcon,{native:Boolean(target)}),h('div',{className:'grow'},h('h2',null,item.displayName),h('p',{className:'fine'},[item.publisher?.name,item.githubRepo,item.license,version?'v'+version:null].filter(Boolean).join(' · ')),h('p',{className:'t2'},summary(item)),h(FactTags,{item}),h('div',{className:'row'},auxiliary)),h(NativeMarketDetailAction,{item,external,onInstall:()=>void prepare(item,version),onUpdate:()=>updatePackage(item),onOpen:()=>openPackage(item),onRefresh:()=>void refreshDetail(),externalActions},h('div',{className:'cta-row'},target?.source==='npm'?h('select',{'aria-label':'选择安装版本',value:version??'',onFocus:()=>void loadVersions(item),onChange:event=>setSelectedVersion(event.target.value)},...(!versions.some(row=>row.version===version)&&version?[h('option',{key:version,value:version},version)]:[]),...versions.map(row=>h('option',{key:row.version,value:row.version,disabled:!row.compatibility.compatible&&!row.compatibility.exempted},row.version))):null,h('a',{className:'cta-sub btn',href:link,target:'_blank',rel:'noopener noreferrer'},'在网站查看')))),h(NativeMarketDetailTrust,{item,onInspect:inspect}),h('div',{className:'detailgrid'},h('div',{className:'stack'},h(NativeMarketOverview,{item,onInspect:inspect}),h('details',{className:'panel readme',id:'hm-market-readme'},h('summary',null,h('span',null,'作者原文'),h('span',{className:'fine'},'README')),h('div',{className:'readmecopy'},h(Document,{item,version}))),item.similarGroup?h('section',{className:'panel'},h('h3',null,'同类插件'),h('details',{className:'similar'},h('summary',null,'相似插件 · 独立身份'),...item.similarGroup.members.map(id=>h('p',{key:id},h('button',{type:'button',className:'textbtn',onClick:()=>void showDetail({hanaId:id,displayName:id})},id))),h(Evidence,{sources:item.similarGroup.sources}))):null),h('aside',{className:'stack'},h(NativeMarketSignals,{item,stageConfig:discovery.stage}),h('section',{className:'panel'},h('h3',null,'版本与兼容'),target?h(React.Fragment,null,h('button',{type:'button',onClick:()=>void loadVersions(item)},t('history')),h('label',{className:'fine'},h('input',{type:'checkbox',checked:showPre,onChange:event=>setShowPre(event.target.checked)}),t('pre')),history?h('div',null,...versions.map(row=>h('div',{key:row.version,className:'hm-m-version'},h('code',null,row.version),h('span',{className:row.compatibility.compatible||row.compatibility.exempted?'good':'warn'},row.compatibility.exempted?'已豁免':row.compatibility.compatible?'兼容':'不兼容')))):null):h('p',{className:'fine'},'不支持在 DSH 安装')),h('section',{className:'panel'},h('h3',null,'来源与安装方式'),h('p',{className:'fine'},target?'精确版本 / 固定提交；确认后交给 DSH 原生安装管道。':'作者提供的安装命令；只可复制并前往网站。'),...(item.sourceLinks??[]).map((source,index)=>h('p',{key:index},safeLink(source.sourceUrl)?h('a',{href:safeLink(source.sourceUrl),target:'_blank',rel:'noopener noreferrer'},source.sourceId+' · '+source.sourceRef):source.sourceId)),...(item.installMethods??[]).map((method,index)=>h('details',{key:index},h('summary',null,method.channel),h('pre',{className:'command'},method.command??method.spec)))))));
  return h(Card,{item,summaryText:overviewText(item),actions,onDetails:()=>void showDetail(base),onCategory:category=>{setTab('search');setFilters(old=>({...old,category}));},view:'detail'},detailView);
 };
 const loadVersions=async item=>{if(history)return;try{setHistory((await request('versions?'+new URLSearchParams({itemId:item.hanaId}))).versions);}catch(error){setError(error);}};
 const results=h(Results,{snapshot,card,onRetry:()=>void storeRef.current.retry(),onMore:()=>void storeRef.current.more()});
 const searchForm=h('form',{className:'search hm-m-search',onSubmit:event=>{event.preventDefault();setTab('search');void storeRef.current.load({q:query,...filters,ai});}},h(Icon,{name:'search'}),h('input',{type:'search',value:query,placeholder:'直接说你要做什么','aria-label':t('query'),onChange:event=>setQuery(event.target.value)}),h('button',{type:'submit',className:'pri sm',disabled:ai&&!query.trim()},t('search')));
 const search=h('div',{className:'section'},searchForm,h('div',{className:'filterbox hm-m-filters'},h(DomainFilters,{}),h('div',{className:'row'},...Object.entries({category:'categories',channel:'channels',source:'sources'}).map(([key,facet])=>h('label',{key},t(key),h('select',{value:filters[key],disabled:ai,onChange:event=>setFilters(old=>({...old,[key]:event.target.value}))},h('option',{value:''},t('all')),...(facets[facet]??[]).map(row=>h('option',{key:row.id,value:row.id},row.name??row.id+' · '+row.count))))),h('button',{type:'button',className:'textbtn',onClick:()=>setFilters({category:'',channel:'',source:''})},t('clear')),h('label',null,h('input',{type:'checkbox',checked:ai,disabled:Object.values(filters).some(Boolean),onChange:event=>setAI(event.target.checked)}),t('semantic')))),Object.values(filters).some(Boolean)?h('p',{className:'fine'},t('semanticFilters')):null,h(NativeMarketDiscoveryCounts,{page:snapshot}),results);
 const recommend=h('div',{className:'section'},searchForm,h('div',{className:'examples'},h('span',null,'试试看'),...['把会议录音整理成待办','给代码做审查','读论文并核对来源'].map(text=>h('button',{type:'button',key:text,onClick:()=>{setQuery(text);setTab('search');}},text))),h(Discovery,{domain:discovery.featuredDomain??'office',domains:discovery.domains?.domains??[],items:discovery.featured?.items??[],status:discovery.loading.featured?'loading':undefined,onDomain:domain=>void discoveryRef.current.featured(domain),onInspect:inspect,onDetails:item=>void showDetail(item)}),h('section',{className:'panel section'},h('div',{className:'row between'},h('h3',null,t('scene'))),h('p',{className:'fine'},t('sceneHint')),h('form',{className:'search hm-m-search',onSubmit:async event=>{event.preventDefault();try{const page=await request('search',{query:scene});setSceneRows(page.items);setError(page.semanticNotice??null);}catch(error){setError(error);}}},h('input',{value:scene,'aria-label':t('scene'),onChange:event=>setScene(event.target.value)}),h('button',{type:'submit',disabled:!scene.trim()},t('sceneAction'))),sceneRows?h('div',{className:'hm-m-grid'},...sceneRows.map(item=>card(item))):null),...['recGuess','recFeatured','recRecent'].map(key=>h('section',{className:'section',key},h('div',{className:'sechead'},h('h3',null,t(key))),h('p',{className:'hm-market-empty'},t('recommendEmpty')))));
 const exportFavorites=()=>{const blob=new Blob([JSON.stringify({schema:1,favorites,preferences:{ai:false}},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='hanamesh-market-favorites.json';a.click();URL.revokeObjectURL(url);};
 const body=detail?h('div',null,h('button',{type:'button',className:'textbtn',onClick:()=>{closeDetail();setDetail(null);setHistory(null);}},t('back')),card(detail,true)):tab==='search'?search:tab==='recommend'?recommend:tab==='packs'?h('section',{className:'hm-m-panel'},h('h3',null,t('packs')),h('p',{className:'hm-m-empty'},t('packsEmpty'))):tab==='favorites'?h('div',{className:'hm-m-grid'},...Object.values(favorites).map(saved=>card(snapshot.items.find(row=>row.hanaId===saved.hanaId)??{...saved,nativeInstallation:{status:'unknown'}})),!Object.keys(favorites).length?h('p',null,t('favoritesEmpty')):null):h('div',null,h(MarketSettings,{onChanged:next=>{setSettings(next);const domain=discovery.featuredDomain??'office';discoveryRef.current.reset();bootDiscovery(domain);}}),h('section',{className:'hm-m-panel'},h('button',{type:'button',onClick:exportFavorites},t('backup')),h('label',null,t('restore'),h('input',{type:'file',accept:'.json,application/json',onChange:async event=>{try{const file=event.target.files[0];if(!file||file.size>2097152)throw Error('BACKUP_TOO_LARGE');const value=JSON.parse(await file.text());if(value.schema!==1||!value.favorites||typeof value.favorites!=='object'||Array.isArray(value.favorites)||Object.keys(value.favorites).length>1000)throw Error('BACKUP_INVALID');const next={...favorites};for(const[id,item]of Object.entries(value.favorites)){if(item?.hanaId!==id||typeof item.displayName!=='string')throw Error('BACKUP_INVALID');next[id]={...withoutDiscoveryFields(item),nativeInstallation:{status:'unknown'}};}globalThis.localStorage.setItem('hanamesh.market.favorites',JSON.stringify(next));setFavorites(next);}catch(error){setError(error);}}}))));
 const aggregateInstalled=typeof suite?.version==='string';
 const suitePanel=suite?h('details',{className:'hm-m-panel'},
  h('summary',null,t('suite')+' · '+(suite.version??suite.status??'—')),
  h('p',null,suite.completeness??suite.status),
  ...(suite.blocked??[]).map((row,index)=>h('p',{key:'blocked-'+index,role:'status'},row.code)),
  ...(suite.components??[]).map(row=>h('p',{key:row.name},(row.label??row.name)+' · '+(row.version??'—'))),
  aggregateInstalled?h('button',{type:'button',onClick:async()=>{
   try{setSuitePlan(await request('suite-plan'));}catch(error){setError(error);}
  }},t('suitePlan')):null,
  aggregateInstalled&&suitePlan?h('div',null,
   h('p',null,suitePlan.bundle.from+' → '+suitePlan.bundle.to),
   ...suitePlan.components.map(row=>h('p',{key:row.name},row.label+' · '+row.from+' → '+row.to)),
   h('button',{type:'button',onClick:()=>{try{owner.openPackage(suitePlan.bundle.name);}catch(error){setError(error);}}},t('manage'))):null):null;
 return h('section',{className:'hm-market','data-plugin-tab':'hanamesh','data-market-phase':discovery.stage?.phase??snapshot.phase??'early'},h(Frame,{detail:Boolean(detail),title:'HanaMesh',tagline:'Discover. Use. Own.',tabs:['recommend','search','packs','favorites','settings'].map(id=>({id,label:t(id)})),activeTab:tab,onNavigate:key=>{closeDetail();setTab(key);setDetail(null);},messages:h(React.Fragment,null,h(ErrorNotice,{error,retry:()=>{setError(null);void storeRef.current.retry();}}),notice?h('p',{role:'status'},notice):null,...Object.entries(discovery.errors).map(([kind,code])=>h(ErrorNotice,{key:kind,error:new Error(code),retry:()=>void discoveryRef.current.retry(kind)}))),suite:suitePanel,body}),factSelection?h(FactDialog,{selection:factSelection,onClose:()=>setFactSelection(null)}):null,review?h(Confirmation,{review,actions:native.current,onClose:()=>{void request('cancel',{reviewId:review.reviewId}).catch(setError);setReview(null);},onConfirm:async()=>{
  const selected=review;
  setReview(null);
  if(selected.action==='installApplication')setNotice(t('appInstalling'));
  try{
   const current=await request('confirm',{reviewId:selected.reviewId});
   if(current.action==='installApplication'){
    setNotice(t('appReady')+(current.application.restartRequired?' '+t('appRestart'):''));
   }else if(current.action==='openPackage'){
    native.current.openInstalled(current.target.source==='npm'?current.target.name:current.target.packageName);
   }else{
    const reviewed=native.current.review({entry:current.item,install:current.install,compatibility:current.compatibility});
    native.current.confirm(reviewed);
   }
  }catch(error){
   if(selected.action==='installApplication')setNotice('');
   setError(error);
  }
 }}):null);
}
function EntryHint({slots}){useLocale();const[available,set]=React.useState(()=>Boolean(slots.snapshot?.('plugins.tab')?.length));React.useEffect(()=>slots.subscribe?.('plugins.tab',()=>set(Boolean(slots.snapshot?.('plugins.tab')?.length))),[slots]);return h('section',{className:'hm-market'},h('p',null,available?'HanaMesh Market':t('unavailable')),h('button',{type:'button',disabled:!available||!navigate,onClick:()=>navigate?.('plugins')},t('openPlugins')));}
export function apply(ctx){locale=ctx.locale;ctx.effect(()=>locale?.register('hanamesh.market',marketMessages),'hanamesh-market:locale');ctx.effect(()=>{const style=document.createElement('style');style.textContent=styles;document.head.append(style);return()=>style.remove();},'hanamesh-market:style');ctx.inject?.(['layout'],child=>{navigate=id=>child.layout.selectPanel(id);return()=>{navigate=undefined;};});
 // The Host sends this after processing an install, including unsuccessful attempts.
 // It invalidates the snapshot; only a fresh detail read can prove it is installed.
 const installObservers=new Set();let start,stop;
 const syncObserver=()=>{
  if(start&&installObservers.size){stop??=start();}else{stop?.();stop=undefined;}
 };
 const observeInstall=listener=>{installObservers.add(listener);syncObserver();return()=>{installObservers.delete(listener);syncObserver();};};
 ctx.inject?.(['remote','remoteAccess'],child=>{
  if(!child.remote?.$on||!child.remoteAccess?.whenAccess)return;
  start=()=>child.remoteAccess.whenAccess('pluginManager/listBundles',function*(){
   yield child.remote.$on('plugin-manager/changed',change=>{
    if(change?.reason==='install')for(const listener of installObservers)listener();
   });
  });
  syncObserver();
  return()=>{start=undefined;syncObserver();};
 });
 const Page=owner=>renderMarketPage(owner,{},observeInstall);
 ctx.effect(()=>ctx.slots.inject('plugins.tab',()=>ctx.slots.register({name:'plugins.tab',id:'hanamesh',order:10,label:'HanaMesh'},Page)),'hanamesh-market:tab');
 ctx.effect(()=>ctx.slots.inject('hanamesh.home.continue',()=>ctx.slots.register({name:'hanamesh.home.continue',id:'market-entry',order:100},()=>h(EntryHint,{slots:ctx.slots}))),'hanamesh-market:entry-hint');
 for(const key of ['@hanamesh/market#hanamesh-market','@hanamesh/hanamesh#hanamesh-market'])ctx.effect(()=>ctx.slots.inject('plugins.row.config',()=>ctx.slots.register({name:'plugins.row.config',key},MarketSettings)),'hanamesh-market:config:'+key);
 ctx.effect(()=>ctx.slots.inject('plugins.bundle.config',()=>ctx.slots.register({name:'plugins.bundle.config',key:'@hanamesh/market'},MarketSettings)),'hanamesh-market:bundle-config');
}
const styles=marketStyles;
// Optional SC1 catalog/discovery facts. Presentation never scores, classifies, ranks, or issues trust.
const localized=(value,lang=language())=>value?.byLocale ? marketLocalizedSelection(value,lang).text : typeof value==='string'?value:value?.[marketContentLocale(lang)]??value?.en??value?.zh??'';
const domainColor=id=>marketDomainColors[id]??'var(--c-bond)';
const overviewText=(item,lang=language())=>localized(item.overview?.does,lang)||summary(item);
const badgeLabels={'official':'HanaMesh 官方','author-claimed':'作者已认领','installation-tested':'安装测试通过','recent-maintenance':'近期维护'};
const factLabels={audience:'适合谁',difficulty:'上手难度',difficultyReason:'上手说明',apiKey:'API key',commandLine:'命令行',selfHostedService:'自托管服务',installation:'安装步骤',examples:'使用示例',localFileRead:'读取本地文件',localFileWrite:'修改本地文件',network:'网络访问',paidAccount:'付费账号',scenarioTags:'典型用法'};
const factValue=(value,lang=language())=>typeof value==='boolean'?t(value?'languageYes':'languageNo'):typeof value==='number'?value.toLocaleString(marketContentLocale(lang)):Array.isArray(value)?value.map(v=>factValue(v,lang)).join(' · '):localized(value,lang);
function RepositoryIcon({native}){const image='url("'+marketAssets[native?'dsh':'github']+'")';return h('span',{className:'repoicon hm-m-repoicon','aria-hidden':true,style:{maskImage:image,WebkitMaskImage:image}});}
function Icon({name,className}){const markup=marketIcons[name];return markup?h('span',{className,'aria-hidden':true,dangerouslySetInnerHTML:{__html:markup}}):null;}
function Evidence({sources=[]}){return h('div',{className:'hm-m-evidence'},...sources.map((row,index)=>h('p',{key:index},safeLink(row.sourceUrl)?h('a',{href:safeLink(row.sourceUrl),target:'_blank',rel:'noopener noreferrer'},row.key??row.sourceUrl):row.key??'—',row.observedAt?h('small',null,' · '+row.observedAt):null,row.quote?h('q',null,row.quote):null)));}
function FactTags({item}){const facts=item.overview?.facts??{};return h('div',{className:'tags ds1-tags'},...['apiKey','commandLine','paidAccount'].filter(key=>facts[key]?.value===true).map(key=>h('span',{key,className:'tag '+(key==='commandLine'?'risk':'need')},factLabels[key])));}
function FeaturedBadge({item}){return item.featured?.length?h('span',{className:'ds1-featured-badge'},h(Icon,{name:'award'}),t('platformPick')):null;}
function TrustBadges({item,onInspect,detail=false,children}){return h('div',{className:detail?'row':'ds1-score-trust'},...(item.trustBadges??[]).filter(row=>Array.isArray(row.sources)&&row.sources.length&&badgeLabels[row.kind]).map(row=>h('button',{type:'button',key:row.kind,onClick:()=>onInspect?.('trust',item)},badgeLabels[row.kind])),children);}
export function NativeMarketScore({item,detail=false,onInspect}){
 const score=item.score,known=score?.status==='scored'&&Number.isFinite(score.displayTotal);
 return h('button',{type:'button',className:detail?'ds1-detail-score':'ds1-score-badge'+(known?'':' score-pending'),onClick:()=>onInspect?.('score',item),'aria-label':known?t('assessment')+' '+formatDiscoveryScore(score)+' / '+score.displayScale:t('assessment')+' · '+t(score?.status==='insufficient'?'assessmentInsufficient':'assessmentPending')},known?h('b',null,formatDiscoveryScore(score)):null,h('span',null,t(known?'assessment':score?.status==='insufficient'?'assessmentInsufficient':'assessmentPending'),known&&detail?h('small',null,'/ '+score.displayScale):null));
}
export function NativeMarketDetailAction({item,external,onInstall,onUpdate,onOpen,onRefresh,externalActions,children}){
 const state=item.nativeInstallation?.status??'unknown',update=state==='update-available',installed=['installed','provided','different-version'].includes(state),unknown=state==='unknown';
 const label=update?t('updateAvailable'):state==='provided'?t('openProvided'):installed?t('openInstalled'):unknown?t('unknown'):t('install');
 return h('aside',{className:'detail-cta'},external?externalActions:h('button',{type:'button',className:'cta-main'+(!installed&&!unknown?' pri':''),disabled:unknown,onClick:update?onUpdate:installed?onOpen:onInstall},label),external?h('p',{className:'fine'},t('cannotInstall')):unknown?h('button',{type:'button',className:'cta-sub',onClick:onRefresh},t('refreshStatus')):h(React.Fragment,null,children,h('p',{className:'fine'},state==='provided'?t('providedNote'):update&&item.nativeUpdate?.action!=='update'?t('updateInDsh'):item.nativeInstallation?.installedVersion?t('installedVersion').replace('{version}',()=>item.nativeInstallation.installedVersion):t('nativeInstallNote'))));
}
export function NativeMarketDiscovery({domains=[],domain,items=[],status,onDomain,onDetails,onInspect,onViewAll}){
 const active=marketDomains.find(row=>row.id===domain),accent=domainColor(domain);
 return h('section',{className:'ds1-addon ds1-discovery',style:{'--accent':accent,'--dom':accent}},h('div',{className:'row between'},h('h3',null,'从你要做的事开始'),h('span',{className:'ds1-sub'},'领域是现有分类的导航聚合')),h('div',{className:'ds1-domains','aria-label':'垂直领域'},...marketDomains.map(row=>h('button',{type:'button',key:row.id,style:{'--dom':domainColor(row.id)},'aria-pressed':domain===row.id,disabled:!domains.some(value=>value.id===row.id),onClick:()=>onDomain(row.id)},h('i',{className:'ds1-dom-icon'},h(Icon,{name:row.id})),h('span',{className:'ds1-dom-text'},h('b',null,row.name),h('small',null,row.description))))),h('section',{className:'ds1-addon ds1-collection collection'},h('div',{className:'row between'},h('b',{id:'ds1-domain-title'},(active?.name??'领域')+' · 入门必装'),h('div',{className:'row'},h(FeaturedBadge,{item:items[0]??{}}),h('span',{className:'ds1-sub'},items.length?items.length+' 个':null),h('button',{type:'button',className:'textbtn collection-view-all',disabled:!domains.length||!onViewAll,onClick:()=>onViewAll?.(domain)},'查看全部 →'))),items.length?h('ol',null,...items.map(item=>{const rank=item.featured?.find(row=>row.domainId===domain)?.rank,top=rank<=3;return h('li',{key:item.hanaId,className:top?'ds1-top-pick':'ds1-ranked-pick','data-starter-record':item.hanaId,'data-rank':rank},top?h('div',{className:'ds1-pick-head'},h('span',{className:'plugin-monogram ds1-pick-avatar',style:{'--h':avatarHue(item.displayName)},'aria-hidden':true},item.displayName[0]?.toUpperCase()),h('span',{className:'ds1-featured-copy collection-copy'},h('b',{title:item.displayName},item.displayName),h(FeaturedBadge,{item})),h('span',{className:'ds1-pick-rank'},rank)):h(React.Fragment,null,h('span',{className:'ds1-pick-rank'},rank),h('span',{className:'plugin-monogram ds1-pick-avatar',style:{'--h':avatarHue(item.displayName)},'aria-hidden':true},item.displayName[0]?.toUpperCase()),h('span',{className:'ds1-featured-copy collection-copy'},h('button',{type:'button',className:'ds1-pick-name',onClick:()=>onDetails(item)},item.displayName),h('small',{className:'ds1-featured-reason collection-capability'},overviewText(item)))),top?h('small',{className:'ds1-featured-reason collection-capability'},overviewText(item)):null,top?h('div',{className:'ds1-pick-footer'},h('button',{type:'button',className:'ds1-score',onClick:()=>onInspect('score',item)},h('span',null,t('assessment')),h('b',null,formatDiscoveryScore(item.score),h('small',null,'/ '+(item.score?.displayScale??'—')))),h('button',{type:'button',className:'ds1-pick-action',onClick:()=>onDetails(item)},'查看')):h('button',{type:'button',className:'ds1-score',onClick:()=>onInspect('score',item)},h('span',null,t('assessment')),h('b',null,formatDiscoveryScore(item.score))));})):h('p',{className:'ds1-insufficient',role:'status'},status==='loading'?t('loading'):t('recommendEmpty'))));
}
function avatarHue(name=''){return [...name].reduce((n,c)=>(n*31+c.charCodeAt(0))%360,7);}
export function FactDialog({selection,onClose}){
 const{kind,item}=selection,score=item.score;
 return h(Modal,{open:true,title:kind==='score'?'平台初评 · 评分构成':'可信标识 · 查看依据',onClose,closeLabel:t('close'),footer:h('button',{type:'button',onClick:onClose},t('close'))},h('section',{className:'hm-market hm-m-confirmation'},h('h3',null,item.displayName),kind==='score'?h(React.Fragment,null,h(NativeMarketScore,{item,detail:true}),h('p',null,'AI 提炼事实，平台按公开规则算分；不是用户评分，也不是安全保证。'),score?.status==='scored'?h('dl',{className:'facts'},...Object.entries({quality:'质量',popularity:'热度',maintenance:'维护'}).flatMap(([key,label])=>[h('dt',{key:key+'-k'},label),h('dd',{key},score.displayDimensions?.[key]==null?'缺失':formatDiscoveryScore(score,score.displayDimensions[key])+' / '+score.displayScale,score.dimensionWeights?.[key]!==undefined?h('small',null,' · 名义权重 '+score.dimensionWeights[key]+'%'):null)])):h('p',null,score?.status==='insufficient'?'资料不足，暂不评分；缺失不会记为 0 分。':'尚未评估'),Number.isFinite(score?.coverage)?h('p',{className:'fine'},'资料覆盖率 '+score.coverage+'%'):null,...(score?.checks??[]).map(row=>h('p',{key:'check-'+row.key,className:'fine'},row.key+' · '+(row.state==='missing'?'缺失 · '+(row.reason??'—'):factValue(row.value)||'—'))),...(score?.missing??[]).map(row=>h('p',{key:row.key},row.key+' · '+row.reason)),h('p',{className:'fine'},[score?.rulesVersion,score?.assessedAt].filter(Boolean).join(' · ')),h(Evidence,{sources:score?.evidence}),h('a',{href:'https://hanamesh.com/docs/discover/scoring-rules',target:'_blank',rel:'noopener noreferrer'},'评分规则 ↗')):h(React.Fragment,null,...(item.trustBadges??[]).map(row=>h('section',{key:row.kind},h('h4',null,badgeLabels[row.kind]??row.kind),h(Evidence,{sources:row.sources}))),h('p',{className:'smallnote warn'},'标识只适用于证据覆盖的版本、渠道和环境，不承诺没有风险。'))));
}
export function NativeMarketDetailTrust({item,onInspect}){return item.score?.status==='scored'&&Number.isFinite(item.score.displayTotal)?h('section',{className:'ds1-addon ds1-detail-trust'},h(NativeMarketScore,{item,detail:true,onInspect:onInspect}),h('div',{className:'ds1-detail-evidence'},h('strong',null,'了解评分与可信依据'),...(item.reasons??[]).map((row,index)=>h('p',{key:index,className:'ds1-detail-reason'},localized(row.text))),h(TrustBadges,{item,onInspect:onInspect,detail:true},h('button',{type:'button',onClick:()=>onInspect('score',item)},'评分构成 →')),h('a',{href:'https://hanamesh.com/docs/discover/scoring-rules',target:'_blank',rel:'noopener noreferrer'},'评分规则 ↗'))):null;}
export function NativeMarketOverview({item,onInspect}){
 const[preferred,setPreferred]=React.useState(null),lang=preferred??marketContentLocale(language()),overview=item.overview;
 if(!overview){const insufficient=item.score?.status==='insufficient';return h('section',{className:'panel hm-m-overview'},h('h3',null,t(insufficient?'assessmentInsufficient':'assessmentPending')),h('p',{className:'t2'},insufficient?'现有资料不足，暂不评分；缺失不会记为 0 分或低分。':'平台还没来得及整理这个插件，暂不显示初评分。'),h('p',{className:'fine',style:{margin:'8px 0'}},'作者原文仍可阅读，是否已安装以 DSH 为准。'),h('div',{className:'row'},h('button',{type:'button',className:'sm',onClick:()=>{const readme=document.getElementById('hm-market-readme');if(readme){readme.open=true;readme.scrollIntoView?.({block:'nearest'});}}},'查看作者原文'),h('a',{href:'https://hanamesh.com/docs/discover/scoring-rules',target:'_blank',rel:'noopener noreferrer'},'评分规则 ↗')));}
 const capability=marketLocalizedSelection(overview.does,lang);
 return h('section',{className:'panel hm-m-overview'},h('div',{className:'overviewhead'},h('h3',null,t('overview')),h('select',{className:'lang',value:lang,'aria-label':t('overviewLanguage'),onChange:event=>setPreferred(event.currentTarget.value)},...Object.entries(marketLocaleNames).map(([id,label])=>h('option',{key:id,value:id,lang:id},label)))),overview?h('dl',{className:'facts'},h('dt',null,t('does')),h('dd',{lang:capability.locale??undefined},localized(overview.does,lang)||'—',capability.locale&&capability.locale!==lang?h('small',{className:'fine',lang:capability.locale},' · '+marketLocaleNames[capability.locale]):null),...Object.entries(overview.facts??{}).flatMap(([key,fact])=>[h('dt',{key:key+'-k'},factLabels[key]??key),h('dd',{key},factValue(fact.value,lang)||'—')])):h('p',{className:'smallnote'},item.score?.status==='insufficient'?'现有资料不足，暂不评分；缺失不会记为 0 分或低分。':'平台还没来得及整理这个插件，暂不显示初评分。'),h(FactTags,{item}),h('div',{className:'overviewfoot'},h('button',{type:'button',className:'textbtn grow',onClick:()=>onInspect('score',item)},'查看评分构成和事实依据'),h('button',{type:'button',className:'sm',onClick:()=>onInspect('trust',item)},'可信依据')),overview?.evidence?.length?h('details',null,h('summary',null,'查看出处'),h(Evidence,{sources:overview.evidence})):null);
}
export function NativeMarketDomainFilters({domains=[],subdivisions=[],domain='',subdivision='',onDomain,onSubdivision}){
 return h(React.Fragment,null,h('div',{className:'domain-filter-tier ds1-domain-filter ds1-domain-tags',role:'group','aria-label':'领域筛选'},h('span',{className:'ds1-filter-label'},'领域'),h('button',{type:'button',className:'pill'+(!domain?' on':''),'aria-pressed':!domain,onClick:()=>onDomain?.('')},'全部领域'),...marketDomains.map(row=>h('button',{type:'button',key:row.id,className:'pill'+(domain===row.id?' on':''),'aria-pressed':domain===row.id,disabled:!onDomain||!domains.some(value=>value.id===row.id),onClick:()=>onDomain(row.id)},h('i',{style:{background:domainColor(row.id)}}),localized(domains.find(value=>value.id===row.id)?.name)||row.name))),domain?h('div',{className:'category-filter-tier ds1-subdivisions',role:'group','aria-label':'领域内分类'},h('span',{className:'ds1-filter-label'},'细分'),h('button',{type:'button',className:'pill'+(!subdivision?' on':''),'aria-pressed':!subdivision,onClick:()=>onSubdivision?.('')},'全部分类'),...subdivisions.map(row=>h('button',{type:'button',key:row.id,className:'pill'+(subdivision===row.id?' on':''),'aria-pressed':subdivision===row.id,disabled:!onSubdivision||(row.count===0&&row.capped!==true),onClick:()=>onSubdivision(row.id)},localized(row.name),h('span',null,formatDiscoveryCount(row.count,row.capped))))):null);
}

export function NativeMarketSignals({item,stageConfig}){
 const signals=item.signals??{};
 const fields=[['stars','Hana 星数']];
 if(Object.hasOwn(signals,'repositoryStars'))fields.push(['repositoryStars','仓库星数（不计入排序）']);
 fields.push(['npmDownloads30d','近 30 天 npm 下载'],['storeInstalls30d','近 30 天商店安装'],['checkedAt','最后观测（UTC）']);
 if(stageConfig?.showPlatformData===true)fields.push(['dshInstalls','dshInstalls'],['activeUsers','activeUsers']);
 return h('section',{className:'panel'},h('h3',null,'来源信号'),
  h('dl',{className:'facts'},...fields.flatMap(([key,label])=>[
   h('dt',{key:key+'-k'},label),h('dd',{key,className:'num'},signals[key]??'—'),
  ])),h('p',{className:'fine'},'外部公开信号不等于安全保证。'));
}

/** Counts are independent provider facts; window/countsCapped never modifies these flags. */
export function NativeMarketDiscoveryCounts({page,includeInsufficient=false,onIncludeInsufficient}){
 return h(React.Fragment,null,Number.isSafeInteger(page.hiddenInsufficientCount)?h('div',{className:'quality'},h('span',null,(includeInsufficient?'已显示 ':'已隐藏 ')+formatDiscoveryCount(page.hiddenInsufficientCount,page.hiddenInsufficientCountCapped)+' 个资料不足的插件'),onIncludeInsufficient?h('button',{type:'button',className:'textbtn',onClick:()=>onIncludeInsufficient(!includeInsufficient)},includeInsufficient?'恢复默认':'显示全部'):null):null,Number.isSafeInteger(page.total)?h('p',{className:'fine'},formatDiscoveryCount(page.total,page.capped)+' 个结果'):null);
}

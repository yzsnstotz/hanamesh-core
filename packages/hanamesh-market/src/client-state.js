export function createNativeMarketActions(owner={}){
    const capabilities=Object.freeze(Object.fromEntries(['install','openPackage','update'].map(key=>[key,typeof owner[key]==='function'])));
    let current=null;
    const cancel=()=>{current=null;};
    return{capabilities,cancel,
      review(choice){
        if(!capabilities.install)throw new Error('DSH_INSTALL_UNAVAILABLE');
        const compatibility=choice?.compatibility;
        if(!compatibility||typeof compatibility.compatible!=='boolean')throw new Error('DSH_COMPATIBILITY_UNKNOWN');
        if(!compatibility.compatible&&compatibility.exempted!==true)throw new Error('DSH_INCOMPATIBLE');
        const target=choice.install;
        if(!target||typeof target.spec!=='string'||!target.spec||typeof target.version!=='string'||!target.version||typeof target.title!=='string'||!target.title)throw new Error('NATIVE_TARGET_REQUIRED');
        // Snapshot the reviewed facts: subsequent catalog refreshes cannot change this target.
        const install=Object.freeze({spec:target.spec,title:target.title,version:target.version,...(target.registry!==undefined?{registry:target.registry}:{})});
        const reviewed=Object.freeze({...choice,entry:structuredClone(choice.entry),install,compatibility:Object.freeze({...compatibility}),trustRequired:true});
        current=reviewed;return reviewed;
      },
      confirm(review){
        if(!current||review!==current)throw new Error('CONFIRMATION_STALE');
        const target=current.install;current=null;
        // A synchronous rejection is visible to the caller; no fallback CLI or retry.
        return owner.install(target);
      },
      updateAvailable(choice){
        if(choice?.action==='openPackage')return this.openInstalled(choice.packageName);
        if(choice?.action!=='update'||typeof choice.target?.packageName!=='string'||typeof choice.target?.version!=='string'||typeof choice.target?.spec!=='string')throw new Error('NATIVE_UPDATE_TARGET_REQUIRED');
        if(!capabilities.update)throw new Error('DSH_UPDATE_UNAVAILABLE');
        return owner.update(Object.freeze({packageName:choice.target.packageName,version:choice.target.version,spec:choice.target.spec}));
      },
      openInstalled(packageName){
        if(!capabilities.openPackage)throw new Error('DSH_PACKAGE_PAGE_UNAVAILABLE');
        return owner.openPackage(packageName);
      },
    };
  }
  // A bounded public-catalog page and an independent native listBundles read.
  // Like official Discover, previous data stays mounted while a read runs or fails.
export function createNativeMarketListing({readPage,listBundles}){
    const listeners=new Set();let generation=0,disposed=false,controller=null,attempt=null;
    let state=Object.freeze({status:'idle',items:[],bundles:null,error:null,page:0,hasMore:false,query:null,answered:null});
    const publish=update=>{if(disposed)return;state=Object.freeze({...state,...update});for(const listener of listeners)listener(state);};
    const run=async request=>{
      if(disposed)return;
      const epoch=++generation;controller?.abort();controller=new AbortController();const signal=controller.signal;
      attempt=request;publish({status:'loading',error:null,query:request.query});
      const [pageResult,bundleResult]=await Promise.allSettled([
        Promise.resolve().then(()=>readPage({...request.query,page:request.page,limit:50},{signal})),
        listBundles?Promise.resolve().then(()=>listBundles()):Promise.resolve(undefined),
      ]);
      if(disposed||epoch!==generation)return;
      const bundles=bundleResult.status==='fulfilled'&&Array.isArray(bundleResult.value)?bundleResult.value:!listBundles&&pageResult.status==='fulfilled'&&Array.isArray(pageResult.value?.nativeBundles)?pageResult.value.nativeBundles:null;
      if(pageResult.status==='rejected'){
        publish({status:'error',bundles,error:String(pageResult.reason?.message??pageResult.reason)});return;
      }
      const page=pageResult.value;
      if(!page||!Array.isArray(page.items)||page.items.length>50||page.page!==request.page||!Number.isSafeInteger(page.totalPages)||page.totalPages<0||page.items.some(item=>typeof item?.hanaId!=='string'||!item.hanaId)){
        publish({status:'error',bundles,error:'CATALOG_PAGE_INVALID'});return;
      }
      const unique=new Map((request.more?state.items:[]).map(item=>[item.hanaId,item]));
      for(const item of page.items)unique.set(item.hanaId,item);
      const error=bundles===null?bundleResult.status==='rejected'?String(bundleResult.reason?.message??bundleResult.reason):(!listBundles?'DSH_BUNDLES_UNAVAILABLE':'DSH_BUNDLES_INVALID'):null;
      publish({status:error?'error':'ready',items:[...unique.values()],bundles,error,page:request.page,hasMore:request.page<page.totalPages,answered:request.query,facets:page.facets??state.facets,...Object.fromEntries(['phase','domains','subdivisions','hiddenInsufficientCount'].map(key=>[key,page[key]]))});
    };
    return{
      snapshot:()=>state,
      subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
      load(query){return run({query:{...query},page:1,more:false});},
      more(){if(!state.hasMore||state.status!=='ready')return Promise.resolve();return run({query:state.answered,page:state.page+1,more:true});},
      retry(){return attempt?run(attempt):Promise.resolve();},
      dispose(){disposed=true;generation++;controller?.abort();listeners.clear();},
    };
  }
  /** Ports return 'none' only for absent documents; invalid/missing declared files throw. */
export async function readNativeMarketDetail(target,readers){
    for(const stage of ['meta','package','repository']){
      if(typeof readers?.[stage]!=='function')throw new Error('DSH_DETAIL_READER_UNAVAILABLE');
      const result=await readers[stage](target);
      if(result?.status==='ready'&&typeof result.markdown==='string')return result;
      if(result?.status!=='none')throw new Error('DSH_DETAIL_INVALID');
    }
    return{status:'none'};
  }

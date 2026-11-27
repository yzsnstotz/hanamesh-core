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
export function createNativeMarketListing({readPage,listBundles,pagination='page'}){
    if(!['page','cursor','catalog'].includes(pagination))throw new Error('CATALOG_PAGINATION_INVALID');
    const cursor=pagination!=='page',catalog=pagination==='catalog';
    const listeners=new Set();let generation=0,disposed=false,controller=null,attempt=null;
    let state=Object.freeze({status:'idle',items:[],bundles:null,error:null,page:0,hasMore:false,query:null,answered:null});
    const publish=update=>{if(disposed)return;state=Object.freeze({...state,...update});for(const listener of listeners)listener(state);};
    const run=async request=>{
      if(disposed)return;
      const epoch=++generation;controller?.abort();controller=new AbortController();const signal=controller.signal;
      attempt=request;publish({status:'loading',error:null,query:request.query});
      const [pageResult,bundleResult]=await Promise.allSettled([
        Promise.resolve().then(()=>readPage({...request.query,...(cursor?(request.after===undefined?{}:{after:request.after}):{page:request.page}),limit:50},{signal})),
        listBundles?Promise.resolve().then(()=>listBundles()):Promise.resolve(undefined),
      ]);
      if(disposed||epoch!==generation)return;
      const bundles=bundleResult.status==='fulfilled'&&Array.isArray(bundleResult.value)?bundleResult.value:!listBundles&&pageResult.status==='fulfilled'&&Array.isArray(pageResult.value?.nativeBundles)?pageResult.value.nativeBundles:null;
      if(pageResult.status==='rejected'){
        publish({status:'error',bundles,error:String(pageResult.reason?.message??pageResult.reason)});return;
      }
      const page=pageResult.value;
      const validPagination=catalog
        ?page&&(page.nextCursor===null||typeof page.nextCursor==='string')&&typeof page.paginationReset==='boolean'
          &&page.page===(request.more&&!page.paginationReset?state.page+1:1)
        :cursor
        ?page&&(page.next===null||typeof page.next==='string')&&Number.isSafeInteger(page.total)&&page.total>=0&&typeof page.capped==='boolean'
        :page&&page.page===request.page&&Number.isSafeInteger(page.totalPages)&&page.totalPages>=0;
      if(!validPagination||!Array.isArray(page.items)||page.items.length>50||page.items.some(item=>typeof item?.hanaId!=='string'||!item.hanaId)){
        publish({status:'error',bundles,error:'CATALOG_PAGE_INVALID'});return;
      }
      const unique=new Map((request.more&&!(catalog&&page.paginationReset)?state.items:[]).map(item=>[item.hanaId,item]));
      for(const item of page.items)unique.set(item.hanaId,item);
      const error=bundles===null?bundleResult.status==='rejected'?String(bundleResult.reason?.message??bundleResult.reason):(!listBundles?'DSH_BUNDLES_UNAVAILABLE':'DSH_BUNDLES_INVALID'):null;
      publish({status:error?'error':'ready',items:[...unique.values()],bundles,error,page:catalog?page.page:cursor?undefined:request.page,hasMore:catalog?page.nextCursor!==null:cursor?page.next!==null:request.page<page.totalPages,answered:request.query,acceptedBatch:page.items,acceptedRead:(state.acceptedRead??0)+1,facets:page.facets??state.facets,...Object.fromEntries(['next','total','capped','projection','window','phase','domains','subdivisions','hiddenInsufficientCount','hiddenInsufficientCountCapped','stageConfig','nextCursor','semanticNotice'].map(key=>[key,page[key]]))});
    };
    return{
      snapshot:()=>state,
      subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
      load(query){const first={...query};if(cursor){delete first.after;delete first.page;}return run({query:first,...(cursor?{}:{page:1}),more:false});},
      more(){if(!state.hasMore||state.status!=='ready')return Promise.resolve();return run({query:state.answered,...(cursor?{after:catalog?state.nextCursor:state.next}:{page:state.page+1}),more:true});},
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

/** Format provider display values only. Missing precision is never invented for optional legacy facts. */
export function formatDiscoveryScore(score,value=score?.displayTotal){
  if(!Number.isFinite(value))return '—';
  return Number.isInteger(score?.displayDecimals)?value.toFixed(score.displayDecimals):String(value);
}
export function formatDiscoveryCount(value,capped){return String(value)+(capped===true?'+':'');}

// Discovery is a separately validated, same-ID decoration. Base/native/query facts stay authoritative.
const discoveryListKeys=['projection','domainIds','subdivisions','taxonomyVersion','overview','score','trustBadges','featured','similarGroup'];
export function withoutDiscoveryFields(item){
 const base={...item};for(const key of [...discoveryListKeys,'discovery','reasons','rating'])delete base[key];return base;
}
export function withDiscoveryFields(item,fields,detail=false){
 if(!fields||fields.hanaId!==item.hanaId)return item;
 return {...item,...Object.fromEntries([...discoveryListKeys,...(detail?['reasons','rating']:[])].filter(key=>Object.hasOwn(fields,key)).map(key=>[key,fields[key]]))};
}
/** Independent read resources; this controller has no items/selected/search operation. */
export function createMarketDiscoveryState({read}){
 const blank=()=>({domains:null,featured:null,detail:null,stage:null,fields:{},featuredDomain:null,detailId:null,errors:{},loading:{}});
 let state=blank(),epoch=0,alive=true,tail=Promise.resolve();
 const failedFields=new Set();
 const listeners=new Set(),slots=new Map(),controllers=new Set(),attempts={};
 const publish=next=>{if(alive){state={...state,...next};for(const fn of listeners)fn(state);}};
 const status=(slot,loading,error)=>{const errors={...state.errors};if(error)errors[slot]=String(error.message??error);else delete errors[slot];publish({errors,loading:{...state.loading,[slot]:loading}});};
 async function run(slot,input){
  if(!alive)return;const generation=epoch;slots.get(slot)?.abort();const controller=new AbortController();slots.set(slot,controller);controllers.add(controller);attempts[slot]=input;
  if(slot==='featured')publish({featuredDomain:input.domain,featured:state.featuredDomain===input.domain?state.featured:null});
  if(slot==='detail')publish({detailId:input.hanaId,detail:state.detailId===input.hanaId?state.detail:null});
  status(slot,true);
  try{const value=await read(slot,input,{signal:controller.signal});if(alive&&generation===epoch&&slots.get(slot)===controller)publish({[slot]:value});}
  catch(error){if(alive&&generation===epoch&&slots.get(slot)===controller&&!controller.signal.aborted)status(slot,false,error);}
  finally{controllers.delete(controller);if(alive&&generation===epoch&&slots.get(slot)===controller)publish({loading:{...state.loading,[slot]:false}});}
 }
 function fields(input){
  const hanaIds=[...new Set(input)].filter(id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id));
  const generation=epoch;if(!alive||!hanaIds.length)return Promise.resolve();
  // Only accepted UI batches enter this queue; it never enumerates the catalog.
  return tail=tail.then(async()=>{
   if(!alive||generation!==epoch)return;const controller=new AbortController();controllers.add(controller);attempts.fields={hanaIds};
   publish({loading:{...state.loading,fields:true}});
   let offset=0;
   try{
    for(;offset<hanaIds.length;offset+=200){
     const batch=hanaIds.slice(offset,offset+200),result=await read('fields',{hanaIds:batch},{signal:controller.signal});
     if(!alive||generation!==epoch)return;
     publish({fields:{...state.fields,...Object.fromEntries(result.items.map(item=>[item.hanaId,item]))}});
     for(const id of batch)failedFields.delete(id);
    }
    if(!failedFields.size)status('fields',false);
   }catch(error){if(alive&&generation===epoch&&!controller.signal.aborted){for(const id of hanaIds.slice(offset))failedFields.add(id);status('fields',false,error);}}
   finally{controllers.delete(controller);if(alive&&generation===epoch)publish({loading:{...state.loading,fields:false}});}
  });
 }
 function reset(){epoch++;for(const c of controllers)c.abort();controllers.clear();slots.clear();for(const k of Object.keys(attempts))delete attempts[k];failedFields.clear();tail=Promise.resolve();publish(blank());}
 return {
  snapshot:()=>state,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  domains:()=>run('domains',{}),stage:()=>run('stage',{}),featured:domain=>run('featured',{domain}),detail:hanaId=>run('detail',{hanaId}),fields,
  retry(slot){if(slot==='fields')return fields([...failedFields]);return attempts[slot]?run(slot,attempts[slot]):Promise.resolve();},
  reset,dispose(){reset();alive=false;listeners.clear();},
 };
}

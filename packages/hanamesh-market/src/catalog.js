import Ajv2020 from 'ajv/dist/2020.js';
import {CATALOG_QUERY_HTTP_PATH, CATALOG_QUERY_SCHEMA, encodeCatalogQueryParams, isCatalogQueryTextWithinBounds} from '@hanamesh/api-contracts/catalog/query';

const detailSchema = new Ajv2020({strict:false,coerceTypes:false});
detailSchema.addSchema(CATALOG_QUERY_SCHEMA);
const validateDetailSignals = detailSchema.compile({$ref:CATALOG_QUERY_SCHEMA.$id+'#/$defs/detailSignals'});

/** Bounded reads of the same public catalog and semantic endpoint used by the website. */
export class MarketError extends Error{constructor(code,status=400){super(code);this.code=code;this.status=status;}}
export const ensure=(ok,code,status)=>{if(!ok)throw new MarketError(code,status);};
export function publicOrigin(value){let url;try{url=new URL(value);}catch{throw new MarketError('INVALID_ORIGIN');}ensure((url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/','INVALID_ORIGIN');return url.origin;}
export async function readJson(fetchImpl,url,init,{maxBytes=2097152,timeoutMs=8000}={}){
 const signal=init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs);
 const response=await fetchImpl(url,{...init,signal,credentials:'omit',redirect:'error'});let bytes=0;const chunks=[];
 for await(const chunk of response.body??[]){bytes+=chunk.length;ensure(bytes<=maxBytes,'RESPONSE_TOO_LARGE',502);chunks.push(chunk);}
 let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new MarketError('RESPONSE_INVALID',502);}
 if(!response.ok)throw new MarketError(typeof body?.error?.code==='string'&&/^[A-Z0-9_]+$/.test(body.error.code)?body.error.code:'UPSTREAM_UNAVAILABLE',response.status);
 return body;
}
const scalar=(value,max=200)=>typeof value==='string'&&value.length<=max&&!/[\u0000-\u001f\u007f]/u.test(value);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const cursor=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,4096}$/u.test(value);
const facets=['categories','channels','sources','domains','subdivisions'];
const selectors=['source','channel','domain','subdivision'];

export function createCatalogClient({websiteOrigin,serverOrigin,fetchImpl=fetch,timeoutMs=8000,maxBytes=2097152}) {
 const website=publicOrigin(websiteOrigin),server=publicOrigin(serverOrigin);
 const read=(base,path,options={})=>readJson(fetchImpl,new URL(path,base).href,{...options,method:'GET'},{timeoutMs,maxBytes});

 async function readPage(query,requestedPage,options) {
  const params=encodeCatalogQueryParams(query,{page:requestedPage});
  const result=await read(website,`/hm${CATALOG_QUERY_HTTP_PATH}?${params}`,{
   ...options,headers:{...options?.headers,...(query.searchMode==='hybrid'?{Origin:website}:{})},
  });
  const {page,cards,pageNumber,limit,paginationReset,searchId,semanticNotice}=result??{};
  ensure(result?.kind==='page'&&limit===query.limit&&Number.isSafeInteger(pageNumber)&&pageNumber>0
   &&typeof paginationReset==='boolean'&&(!paginationReset||pageNumber===1)
   &&(searchId===null||typeof searchId==='string')
   &&(semanticNotice===null||['SEMANTIC_FREE_QUOTA_EXHAUSTED','SEMANTIC_UNAVAILABLE'].includes(semanticNotice))
   &&Array.isArray(page?.items)&&Array.isArray(cards)&&cards.length<=limit&&cards.length===page.items.length
   &&Number.isSafeInteger(page.total)&&page.total>=cards.length&&typeof page.capped==='boolean'
   &&(page.nextCursor===null||cursor(page.nextCursor)),'CATALOG_PAGE_INVALID',502);
  ensure(cards.every((card,index)=>{
   const row=page.items[index];
   return typeof card?.hanaId==='string'&&card.hanaId.length>0&&card.hanaId===row?.hanaId
    &&typeof card.displayName==='string'&&Number.isSafeInteger(row.rank)&&row.rank===(pageNumber-1)*limit+index+1
    &&(card.discovery===undefined||object(card.discovery)&&!Object.hasOwn(card.discovery,'hanaId'));
  })&&new Set(cards.map(card=>card.hanaId)).size===cards.length,'CATALOG_PAGE_INVALID',502);
  ensure(facets.every(kind=>Array.isArray(page.facets?.[kind])&&page.facets[kind].every(row=>
   typeof row?.id==='string'&&Number.isSafeInteger(row.count)&&row.count>=0)),'CATALOG_FACETS_INVALID',502);
  const items=cards.map((card,index)=>{
   const {rank,matchKind,stars,npmDownloads30d}=page.items[index];
   const {discovery,...base}=card;
   return {...base,searchRank:rank,signals:{stars,npmDownloads:npmDownloads30d},
    ...(discovery===undefined?{}:{discovery:{...discovery,hanaId:card.hanaId}}),
    ...(matchKind===undefined?{}:{matchKind})};
  });
  return {...page,items,page:pageNumber,limit,totalPages:Math.ceil(page.total/limit),searchId,semanticNotice,paginationReset};
 }

 function request(input,hybrid,options) {
  const textKey=hybrid?'query':'q';
  ensure(object(input)&&Object.keys(input).every(key=>
   [textKey,'category',...selectors,'official','page','after'].includes(key)),'INVALID_QUERY');
  const {page,after,category,official}=input,text=input[textKey];
  ensure((official===undefined||typeof official==='boolean')
   &&(page===undefined||Number.isSafeInteger(page)&&page>=1)
   &&(after===undefined||page===undefined&&cursor(after)),'INVALID_QUERY');
  for(const key of ['category',...selectors])if(input[key]!==undefined)ensure(scalar(input[key]),'INVALID_QUERY');
  if(hybrid||text!==undefined)ensure(scalar(text,hybrid?500:200),'INVALID_QUERY');
  const keyword=hybrid?text:text?.trim();
  if(hybrid||keyword)ensure(isCatalogQueryTextWithinBounds(keyword),'INVALID_QUERY');
  return readPage({
   limit:50,sort:'relevance',searchMode:hybrid?'hybrid':'keyword',
   ...(keyword?{q:keyword}:{}),...(category?{categories:[category]}:{}),
   ...Object.fromEntries(selectors.filter(key=>input[key]).map(key=>[key,input[key]])),
   ...(official?{official:true}:{}),after,
  },page,options);
 }

 return {
  websiteOrigin:website,serverOrigin:server,
  async list(query={},options={}) {return request(query,false,options);},
  async search(input,options={}) {return request(input,true,options);},
  async detail(hanaId,options={}) {
   ensure(scalar(hanaId,160)&&hanaId.length>0,'INVALID_QUERY');
   const item=await read(server,'/v1/indexer/hanas/'+encodeURIComponent(hanaId),options);
   ensure(item?.hanaId===hanaId&&typeof item.displayName==='string','CATALOG_IDENTITY_CHANGED',502);
   const signals=item.signals;
   ensure(validateDetailSignals(signals)
    &&(signals.checkedAt===null||Number.isFinite(Date.parse(signals.checkedAt))),'CATALOG_DETAIL_SIGNALS_INVALID',502);
   return item.canonicalHanaId?{...item,mergedInto:item.canonicalHanaId}:item;
  },
 };
}

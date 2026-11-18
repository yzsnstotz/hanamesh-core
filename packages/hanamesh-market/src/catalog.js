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
const scalar=value=>typeof value==='string'&&value.length<=200&&!/[\u0000-\u001f\u007f]/.test(value);
export function createCatalogClient({websiteOrigin,serverOrigin,fetchImpl=fetch,timeoutMs=8000,maxBytes=2097152}){
 const website=publicOrigin(websiteOrigin),server=publicOrigin(serverOrigin),read=(path,options={})=>readJson(fetchImpl,new URL(path,website).href,{method:'GET',...options},{timeoutMs,maxBytes});
 return{
  websiteOrigin:website,serverOrigin:server,
  async list(query={},options={}){
   ensure(query&&typeof query==='object'&&!Array.isArray(query)&&Object.keys(query).every(key=>['q','category','channel','source','page'].includes(key)),'INVALID_QUERY');
   const params=new URLSearchParams();for(const key of ['q','category','channel','source'])if(query[key]!==undefined){ensure(scalar(query[key]),'INVALID_QUERY');if(query[key])params.set(key,query[key]);}
   const page=query.page??1;ensure(Number.isSafeInteger(page)&&page>=1,'INVALID_QUERY');params.set('page',String(page));params.set('limit','50');
   const value=await read('/api/v2/hanas?'+params,options);
   ensure(value&&Array.isArray(value.items)&&value.items.length<=50&&value.page===page&&Number.isSafeInteger(value.totalPages)&&value.totalPages>=0&&value.items.every(item=>typeof item?.hanaId==='string'&&typeof item.displayName==='string'),'CATALOG_PAGE_INVALID',502);
   for(const kind of ['categories','channels','sources'])if(value.facets?.[kind]!==undefined)ensure(Array.isArray(value.facets[kind])&&value.facets[kind].every(row=>typeof row.id==='string'&&Number.isSafeInteger(row.count)&&row.count>=0),'CATALOG_FACETS_INVALID',502);
   return value;
  },
  async detail(hanaId,options={}){ensure(typeof hanaId==='string'&&hanaId.length>0&&hanaId.length<=160&&!/[\u0000-\u001f]/.test(hanaId),'INVALID_QUERY');const item=await read('/api/v2/hanas/'+encodeURIComponent(hanaId),options);ensure(item?.hanaId===hanaId,'CATALOG_IDENTITY_CHANGED',502);return item;},
  async search(input,options={}){
   ensure(input&&Object.keys(input).every(key=>['query'].includes(key))&&scalar(input.query)&&input.query.trim().length>0,'INVALID_QUERY');
   const value=await readJson(fetchImpl,new URL('/v1/capabilities/search',server).href,{method:'POST',headers:{'content-type':'application/json',Origin:website},body:JSON.stringify({query:input.query,topK:50,telemetry:false}),...options},{timeoutMs,maxBytes});
   ensure(Array.isArray(value?.candidates)&&value.candidates.length<=50&&value.candidates.every(row=>typeof row.hanaId==='string'&&typeof row.objectId==='string')&&value.retrieval,'SEMANTIC_RESPONSE_INVALID',502);return value;
  },
 };
}

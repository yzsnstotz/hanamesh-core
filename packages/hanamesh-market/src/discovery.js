/** Validate only the public discovery extension. HTTP paths and catalog metadata belong to providers. */
import Ajv2020 from 'ajv/dist/2020.js';
import {DISCOVERY_SCHEMA} from '@hanamesh/api-contracts/catalog/discovery';
import {LOCALIZED_SCHEMA} from '@hanamesh/api-contracts/catalog/localized';
import {MarketError,createCatalogClient,publicOrigin,readJson,ensure} from './catalog.js';
const ajv=new Ajv2020({strict:false,coerceTypes:false,useDefaults:false,removeAdditional:false});
ajv.addSchema(LOCALIZED_SCHEMA);
ajv.addSchema(DISCOVERY_SCHEMA);
const validators=Object.fromEntries(['page','item','listFields','detailItem','domainDirectory','stageConfig','query'].map(kind=>[kind,ajv.compile({$ref:DISCOVERY_SCHEMA.$id+'#/$defs/'+kind})]));
/** Preserve provider ordering, identity, projection and nulls; never repair malformed data. */
export function decodeDiscovery(kind,value){
 const validate=validators[kind];
 if(!validate||!validate(value))throw new MarketError('DISCOVERY_RESPONSE_INVALID',502);
 return value;
}

/** Module-owned Indexer0.5.42 paths composed unchanged by Host0.7.20. */
export const DISCOVERY_HTTP_ROUTES=Object.freeze({
 readPage:'/v1/indexer/discovery/items',readDomainDirectory:'/v1/indexer/discovery/domains',
 readFeatured:'/v1/indexer/discovery/featured',readDetail:'/v1/indexer/discovery/hanas/:hanaId',
 readStageConfig:'/v1/indexer/discovery/stage-config',readSelected:'/v1/indexer/discovery/selected',readListFields:'/v1/indexer/discovery/list-fields',
});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const boundedIds=ids=>Array.isArray(ids)&&ids.length<=200&&new Set(ids).size===ids.length&&ids.every(id=>typeof id==='string'&&id.length>0&&id.length<=160&&!/[\u0000-\u001f\u007f]/.test(id));
/** The only new work here is transport/validation. Ranking, filtering and counts remain SQL-owned. */
export function createDiscoveryHttpClient({serverOrigin,websiteOrigin,fetchImpl=fetch,timeoutMs=8000,maxBytes=2097152}){
 const server=publicOrigin(serverOrigin),catalog=createCatalogClient({serverOrigin,websiteOrigin,fetchImpl,timeoutMs,maxBytes});
 const read=(path,options={})=>readJson(fetchImpl,new URL(path,server).href,{signal:options.signal,method:'GET'},{timeoutMs,maxBytes});
 const post=(path,value,options={})=>readJson(fetchImpl,new URL(path,server).href,{signal:options.signal,method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)},{timeoutMs,maxBytes});
 const query=input=>{ensure(object(input),'INVALID_QUERY');const value={limit:50,...input};ensure(validators.query(value),'INVALID_QUERY');return value;};
 const selectedInput=input=>{
  ensure(object(input)&&Object.keys(input).every(k=>['hanaIds','domain','subdivision','channel'].includes(k))&&boundedIds(input.hanaIds),'INVALID_QUERY');
  const {hanaIds,...filters}=input;query(filters);return input;
 };
 const client={
  async list(input={},options={}){const q=query(input),params=new URLSearchParams(Object.entries(q).map(([k,v])=>[k,String(v)]));return decodeDiscovery('page',await read(DISCOVERY_HTTP_ROUTES.readPage+'?'+params,options));},
  async detail(hanaId,options={}){ensure(boundedIds([hanaId]),'INVALID_QUERY');const result=decodeDiscovery('detailItem',await read(DISCOVERY_HTTP_ROUTES.readDetail.replace(':hanaId',encodeURIComponent(hanaId)),options));ensure(result.hanaId===hanaId,'CATALOG_IDENTITY_CHANGED',502);return result;},
  async domains(options={}){return decodeDiscovery('domainDirectory',await read(DISCOVERY_HTTP_ROUTES.readDomainDirectory,options));},
  async featured(domain,options={}){query({domain});ensure(typeof domain==='string'&&domain.length>0,'INVALID_QUERY');return decodeDiscovery('page',await read(DISCOVERY_HTTP_ROUTES.readFeatured+'?'+new URLSearchParams({domain}),options));},
  async stage(options={}){return decodeDiscovery('stageConfig',await read(DISCOVERY_HTTP_ROUTES.readStageConfig,options));},
  async selected(input,options={}){return decodeDiscovery('page',await post(DISCOVERY_HTTP_ROUTES.readSelected,selectedInput(input),options));},
  async listFields(hanaIds,options={}){
   ensure(boundedIds(hanaIds),'INVALID_QUERY');const result=await post(DISCOVERY_HTTP_ROUTES.readListFields,{hanaIds},options);
   ensure(object(result)&&Object.keys(result).length===1&&Array.isArray(result.items)&&result.items.length<=200,'DISCOVERY_RESPONSE_INVALID',502);
   for(const item of result.items){
    const {hanaId,...fields}=item??{};
    ensure(boundedIds([hanaId]),'DISCOVERY_RESPONSE_INVALID',502);
    decodeDiscovery('listFields',fields);
   }
   return result;
  },
  async search(input,options={}){
   ensure(object(input)&&Object.keys(input).every(k=>['query','domain','subdivision','channel'].includes(k)),'INVALID_QUERY');
   const {query:text,...filters}=input;query(filters);
   return catalog.search({query:text,...filters},options);
  },
 };
 return client;
}

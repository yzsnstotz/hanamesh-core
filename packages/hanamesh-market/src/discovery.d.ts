import type {CatalogHttpCard,CatalogHttpPage,CatalogQueryPage} from '@hanamesh/api-contracts/catalog/query';
import type {DiscoveryPage,DiscoveryListFields,DiscoveryDetailFields,DiscoveryDomainDirectory,DiscoveryStageConfig} from '@hanamesh/api-contracts/catalog/discovery';
export function decodeDiscovery(kind:'page',value:unknown):DiscoveryPage;
export function decodeDiscovery(kind:'item',value:unknown):{readonly hanaId:string}&DiscoveryListFields;
export function decodeDiscovery(kind:'listFields',value:unknown):DiscoveryListFields;
export function decodeDiscovery(kind:'detailItem',value:unknown):{readonly hanaId:string}&DiscoveryDetailFields;
export function decodeDiscovery(kind:'domainDirectory',value:unknown):DiscoveryDomainDirectory;
export function decodeDiscovery(kind:'stageConfig',value:unknown):DiscoveryStageConfig;
import type {DiscoveryQuery} from '@hanamesh/api-contracts/catalog/discovery';
export interface DiscoveryHttpOptions {serverOrigin:string;websiteOrigin:string;fetchImpl?:typeof fetch;timeoutMs?:number;maxBytes?:number}
export interface DiscoveryReadOptions {signal?:AbortSignal}
export type DiscoverySelectedQuery={hanaIds:readonly string[]}&Pick<DiscoveryQuery,'domain'|'subdivision'|'channel'|'includeInsufficient'>;
export interface DiscoveryHttpClient {
 list(input?:Partial<DiscoveryQuery>,options?:DiscoveryReadOptions):Promise<DiscoveryPage>;
 detail(hanaId:string,options?:DiscoveryReadOptions):Promise<{hanaId:string}&DiscoveryDetailFields>;
 domains(options?:DiscoveryReadOptions):Promise<DiscoveryDomainDirectory>;
 featured(domain:string,options?:DiscoveryReadOptions):Promise<DiscoveryPage>;
 stage(options?:DiscoveryReadOptions):Promise<DiscoveryStageConfig>;
 selected(input:DiscoverySelectedQuery,options?:DiscoveryReadOptions):Promise<DiscoveryPage>;
 listFields(hanaIds:readonly string[],options?:DiscoveryReadOptions):Promise<{items:readonly ({hanaId:string}&DiscoveryListFields)[]}>;
 search(input:{query:string}&Omit<DiscoverySelectedQuery,'hanaIds'>,options?:DiscoveryReadOptions):Promise<Omit<CatalogQueryPage,'items'>&{items:readonly CatalogHttpCard[];page:number;limit:number;totalPages:number;searchId:CatalogHttpPage['searchId'];semanticNotice:CatalogHttpPage['semanticNotice'];paginationReset:boolean}>;
}
export const DISCOVERY_HTTP_ROUTES:Readonly<Record<'readPage'|'readDomainDirectory'|'readFeatured'|'readDetail'|'readStageConfig'|'readSelected'|'readListFields',string>>;
export function createDiscoveryHttpClient(options:DiscoveryHttpOptions):DiscoveryHttpClient;

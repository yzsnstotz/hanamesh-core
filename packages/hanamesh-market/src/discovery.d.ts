import type {DiscoveryPage,DiscoveryListFields,DiscoveryDetailFields,DiscoveryDomainDirectory,DiscoveryStageConfig} from '@hanamesh/api-contracts/catalog/discovery';
export function decodeDiscovery(kind:'page',value:unknown):DiscoveryPage;
export function decodeDiscovery(kind:'item',value:unknown):{readonly hanaId:string}&DiscoveryListFields;
export function decodeDiscovery(kind:'detailItem',value:unknown):{readonly hanaId:string}&DiscoveryDetailFields;
export function decodeDiscovery(kind:'domainDirectory',value:unknown):DiscoveryDomainDirectory;
export function decodeDiscovery(kind:'stageConfig',value:unknown):DiscoveryStageConfig;

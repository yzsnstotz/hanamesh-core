import {DISCOVERY_SCHEMA,type DiscoveryPage,type DiscoveryDetailFields,type DiscoveryDomainDirectory,type DiscoveryStageConfig} from '@hanamesh/api-contracts/catalog/discovery';
import {decodeDiscovery} from '../src/discovery.js';
declare const input:unknown;
const page:DiscoveryPage=decodeDiscovery('page',input);
const detail:{readonly hanaId:string}&DiscoveryDetailFields=decodeDiscovery('detailItem',input);
const directory:DiscoveryDomainDirectory=decodeDiscovery('domainDirectory',input);
const stage:DiscoveryStageConfig=decodeDiscovery('stageConfig',input);
const next:string|null=page.next;
const projection:string|null=directory.projection.assessedAt;
const precision:1=detail.score.displayDecimals;
const display:number|null=detail.score.displayDimensions.quality;
const enabled:boolean=stage.showPlatformData;
void[DISCOVERY_SCHEMA,page,detail,directory,stage,next,projection,precision,display,enabled];

import {createDiscoveryHttpClient} from '../src/discovery.js';
const http=createDiscoveryHttpClient({serverOrigin:'https://host.example',websiteOrigin:'https://web.example'});
const selected:Promise<DiscoveryPage>=http.selected({hanaIds:['00000000-0000-4000-8000-000000000001'],domain:'office',includeInsufficient:true});
void[selected,http.list({after:'opaque',limit:50}),http.stage(),http.domains(),http.featured('office'),http.listFields([]),http.search({query:'task',domain:'office'})];

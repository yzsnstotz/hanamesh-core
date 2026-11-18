export const name:'hanamesh-market';
export const inject:readonly ['webServer','connection','storageDomain'];
export const Config:unknown;
export const marketDomain:unknown;
export interface MarketConfig {websiteOrigin?:string;serverOrigin?:string;registry?:string;profileName?:string;readTimeoutMs?:number;maxResponseBytes?:number;versionLookupMaxBytes?:number;handoff?:{enabled?:boolean;ports?:number[];allowedOrigins?:string[];ttlMs?:number;pollMs?:number};}
export function apply(ctx:unknown,config?:MarketConfig):Promise<void>;

import z from '@deepseek-ai/schemastery';
import {z as schema} from 'zod';
import {defineDomain} from '@deepseek-ai/dsh-storage-domain';
import {createMarketService,initialState} from './service.js';
import {createMarketHandler,ROUTES} from './routes.js';
export const name='hanamesh-market';
export const inject=['webServer','connection','storageDomain'];
export const Config=z.object({websiteOrigin:z.string().default('https://market.hanamesh.com'),serverOrigin:z.string().default('https://api.hanamesh.com'),registry:z.string(),profileName:z.string(),readTimeoutMs:z.number().default(8000),maxResponseBytes:z.number().default(2097152),versionLookupMaxBytes:z.number().default(16777216)});
export const marketDomain=defineDomain({name:'hanamesh_market',version:1,layout:'single',tables:{},global:{schema:schema.object({schema:schema.literal(1),revision:schema.number().int().nonnegative(),settings:schema.unknown()}),initial:initialState()}});
export async function apply(ctx,config={}){
 const releases=[];const own=dispose=>{let done=false;const once=async()=>{if(done)return;done=true;await dispose();};releases.push(once);return once;};
 const dispose=async()=>{let first;for(const release of [...releases].reverse())try{await release();}catch(error){first??=error;}if(first)throw first;};ctx.effect(()=>dispose,'hanamesh-market:cleanup');
 let manager,core,suiteSource;
 const optional=(key,set)=>{const fiber=ctx.inject([key],child=>{set(child.get(key));return()=>set(undefined);});own(()=>fiber.dispose());};
 try{
  optional('pluginManager',value=>manager=value);optional('hanameshCore',value=>core=value);optional('hanameshSuiteSource',value=>suiteSource=value);
  const domain=await ctx.storageDomain.open(marketDomain);own(()=>domain.close());
  const service=createMarketService({config,domain,manager:()=>manager,core:()=>core,suiteSource:()=>suiteSource,anchor:import.meta.url,logger:ctx.logger});own(()=>service.close());await service.init();
  const handler=createMarketHandler({service,connection:ctx.connection});
  for(const path of ROUTES)own(ctx.webServer.register({kind:'exact',path,handler}));
  own(ctx.provide('hanameshMarket',service));
 }catch(error){await dispose().catch(cleanup=>ctx.logger?.warn?.('hanamesh-market cleanup failed: %s',cleanup.code??'CLEANUP_FAILED'));throw error;}
}

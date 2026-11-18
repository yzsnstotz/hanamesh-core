import z from '@deepseek-ai/schemastery';
import {z as schema} from 'zod';
import {defineDomain} from '@deepseek-ai/dsh-storage-domain';
import {createMarketService,initialState} from './service.js';
import {createMarketHandler,ROUTES} from './routes.js';
import {createHandoffQueue,createHandoffHandler,createHandoffListener} from './library/handoff.js';
export const name='hanamesh-market';
export const inject=['webServer','connection','storageDomain'];
export const Config=z.object({websiteOrigin:z.string().default('https://market.hanamesh.com'),serverOrigin:z.string().default('https://api.hanamesh.com'),registry:z.string(),profileName:z.string(),readTimeoutMs:z.number().default(8000),maxResponseBytes:z.number().default(2097152),versionLookupMaxBytes:z.number().default(16777216),handoff:z.object({enabled:z.boolean().default(true),ports:z.array(z.number()).default([39317,39318,39319]),allowedOrigins:z.array(z.string()).default(['https://market.hanamesh.com']),ttlMs:z.number().default(600000),pollMs:z.number().default(1500)})});
export const marketDomain=defineDomain({name:'hanamesh_market',version:1,layout:'single',tables:{},global:{schema:schema.object({schema:schema.literal(1),revision:schema.number().int().nonnegative(),settings:schema.unknown()}),initial:initialState()}});
export async function apply(ctx,config={}){
 const releases=[];const own=dispose=>{let done=false;const once=async()=>{if(done)return;done=true;await dispose();};releases.push(once);return once;};
 const dispose=async()=>{let first;for(const release of [...releases].reverse())try{await release();}catch(error){first??=error;}if(first)throw first;};ctx.effect(()=>dispose,'hanamesh-market:cleanup');
 let manager,core,suiteSource,runtime;
 const optional=(key,set)=>{const fiber=ctx.inject([key],child=>{set(child.get(key));return()=>set(undefined);});own(()=>fiber.dispose());};
 try{
  optional('pluginManager',value=>manager=value);optional('hanameshCore',value=>core=value);optional('hanameshSuiteSource',value=>suiteSource=value);optional('hanameshAppRuntime',value=>runtime=value);
  const domain=await ctx.storageDomain.open(marketDomain);own(()=>domain.close());
  const service=createMarketService({config,domain,manager:()=>manager,core:()=>core,suiteSource:()=>suiteSource,runtime:()=>runtime,anchor:import.meta.url,logger:ctx.logger});own(()=>service.close());await service.init();
  const queue=createHandoffQueue({ttlMs:()=>service.handoffSettings().ttlMs,onError:(message,error)=>ctx.logger?.warn?.('%s: %s',message,error?.code??'HANDOFF_OBSERVER_FAILED')});
  const listener=createHandoffListener({settings:()=>service.handoffSettings(),logger:ctx.logger,handlerFor:port=>createHandoffHandler({library:service,queue,settings:()=>service.handoffSettings(),port})});own(()=>listener.stop());
  const handler=createMarketHandler({service,connection:ctx.connection,queue,listener});
  for(const path of ROUTES)own(ctx.webServer.register({kind:'exact',path,handler}));
  for(const path of ['/hanamesh/library/install-target','/hanamesh/library/handoff','/hanamesh/library/installation-status'])own(ctx.webServer.register({kind:'exact',path,handler:(req,res)=>createHandoffHandler({library:service,queue,settings:()=>service.handoffSettings(),port:()=>req.socket.localPort})(req,res)}));
  own(ctx.on('plugin-manager/operation',event=>service.nativeOperation(event,queue)));
  own(ctx.provide('hanameshMarket',service));await listener.start();
 }catch(error){await dispose().catch(cleanup=>ctx.logger?.warn?.('hanamesh-market cleanup failed: %s',cleanup.code??'CLEANUP_FAILED'));throw error;}
}

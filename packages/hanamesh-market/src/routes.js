/** Authenticated same-origin read adapter. Remote data destinations are configured by the plugin, never the browser. */
import {randomUUID} from 'node:crypto';
import {MarketError,ensure} from './catalog.js';
const DISCOVERY_READS={'/hanamesh/market/discovery/domains':['domains','GET'],'/hanamesh/market/discovery/featured':['featured','GET'],'/hanamesh/market/discovery/detail':['detail','GET'],'/hanamesh/market/discovery/stage-config':['stage','GET'],'/hanamesh/market/discovery/list-fields':['fields','POST']};
export const ROUTES=[...Object.keys(DISCOVERY_READS),'/hanamesh/market/catalog','/hanamesh/market/item','/hanamesh/market/search','/hanamesh/market/prepare','/hanamesh/market/confirm','/hanamesh/market/cancel','/hanamesh/market/versions','/hanamesh/market/document','/hanamesh/market/image','/hanamesh/market/settings','/hanamesh/market/suite','/hanamesh/market/suite-plan','/hanamesh/market/handoffs','/hanamesh/market/handoff-state'];
export function send(res,status,value){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));}
async function body(req,maxBytes){ensure(req.headers['content-type']?.split(';')[0]==='application/json','CONTENT_TYPE_REQUIRED',415);let total=0;const chunks=[];for await(const chunk of req){total+=chunk.length;ensure(total<=maxBytes,'BODY_TOO_LARGE',413);chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new MarketError('INVALID_JSON');}}
export function createMarketHandler({service,connection,queue,listener,maxBodyBytes=65536}){
 return async(req,res)=>{const traceId=randomUUID(),controller=new AbortController(),abort=()=>{if(!res.writableEnded)controller.abort();};req.once('aborted',abort);res.once('close',abort);
 try{
  ensure(req.url?.startsWith('/')&&!req.url.startsWith('//')&&!req.url.includes('\\'),'BAD_TARGET');
  ensure(typeof connection?.requestRejection==='function'&&connection.requestRejection(req)===undefined,'UNAUTHENTICATED',403);
  ensure(req.headers['sec-fetch-dest']!=='iframe','FRAME_CONTROL_DENIED',403);
  const url=new URL(req.url,'http://127.0.0.1'),path=url.pathname;ensure(ROUTES.includes(path),'NOT_FOUND',404);
  ensure(req.method==='GET'||req.method==='POST','METHOD_NOT_ALLOWED',405);const read=req.method==='GET';
  if(!read)ensure(req.headers['x-hanamesh-client']==='market-v1'&&!url.search,'CSRF_DENIED',403);
  ensure(new Set(url.searchParams.keys()).size===[...url.searchParams.keys()].length,'DUPLICATE_QUERY');
  const input=read?Object.fromEntries(url.searchParams):await body(req,maxBodyBytes);let result;
  if(path.endsWith('/image')){ensure(read&&Object.keys(input).every(key=>['document','path'].includes(key)),'INVALID_INPUT');const image=await service.image(input.document,input.path,controller.signal);res.writeHead(200,{'content-type':image.mediaType,'cache-control':'private, max-age=3600','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox"});res.end(image.bytes);return;}
  if(Object.hasOwn(DISCOVERY_READS,path)){const [kind,method]=DISCOVERY_READS[path];ensure(req.method===method,'METHOD_NOT_ALLOWED',405);result=await service.discovery(kind,input,{signal:controller.signal});}
  else if(read&&path.endsWith('/catalog')){const query={...input,...(input.page!==undefined?{page:Number(input.page)}:{})};result=await service.list(query,{signal:controller.signal});}
  else if(read&&path.endsWith('/item')){ensure(Object.keys(input).length===1&&typeof input.itemId==='string','INVALID_INPUT');result=await service.detail(input.itemId,{signal:controller.signal});}
  else if(!read&&path.endsWith('/search'))result=await service.search(input,{signal:controller.signal});
  else if(!read&&path.endsWith('/prepare'))result=await service.prepare(input);
  else if(!read&&path.endsWith('/confirm')){ensure(Object.keys(input).every(key=>['reviewId','handoffId'].includes(key)),'INVALID_INPUT');result=await service.confirm({reviewId:input.reviewId});if(input.handoffId)service.trackHandoff(input.handoffId,result,queue);}
  else if(!read&&path.endsWith('/cancel')){ensure(Object.keys(input).length===1&&typeof input.reviewId==='string','INVALID_INPUT');result=service.cancel(input);}
  else if(read&&path.endsWith('/versions')){ensure(Object.keys(input).length===1&&typeof input.itemId==='string','INVALID_INPUT');result=await service.versions(input);}
  else if(read&&path.endsWith('/document')){ensure(Object.keys(input).every(key=>['itemId','version','language'].includes(key)),'INVALID_INPUT');result=await service.document(input,controller.signal);}
  else if(path.endsWith('/settings')){if(read){ensure(!url.search,'INVALID_INPUT');result={settings:service.settings(),listener:listener?.state()};}else{result={settings:await service.saveSettings(input)};if(listener)result.listener=await listener.start();}}
  else if(read&&path.endsWith('/suite')){ensure(!url.search,'INVALID_INPUT');result=await service.suiteStatus();}
  else if(read&&path.endsWith('/suite-plan')){ensure(Object.keys(input).every(key=>key==='version'),'INVALID_INPUT');result=await service.suitePlan(input);}
  else if(read&&path.endsWith('/handoffs')){ensure(queue&&!url.search,'INVALID_INPUT');queue.clientPolled();result={handoffs:queue.open(),pollMs:service.handoffSettings().pollMs};}
  else if(!read&&path.endsWith('/handoff-state')){ensure(queue,'HANDOFF_UNAVAILABLE',503);result=queue.report(input);}
  else throw new MarketError('METHOD_NOT_ALLOWED',405);
  if(!controller.signal.aborted)send(res,200,{...result,traceId});
 }catch(error){if(!controller.signal.aborted){const trusted=error instanceof MarketError||typeof error.code==='string'&&Number.isInteger(error.status);send(res,trusted?error.status:500,{error:{code:trusted?error.code:'MARKET_READ_FAILED'},traceId});}}
 finally{req.off('aborted',abort);res.off('close',abort);}
 };
}

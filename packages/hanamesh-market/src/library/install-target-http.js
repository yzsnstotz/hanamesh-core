/** Public discovery only: an unapproved website may read one constant refusal, never client facts. */
import {AppHostError,requireCondition} from '../errors.js';
const PATH='/hanamesh/library/install-target';
const VARY='Origin, Access-Control-Request-Method, Access-Control-Request-Headers, Access-Control-Request-Private-Network';
function browserOrigin(origin){
 if(typeof origin!=='string')return false;
 try{const url=new URL(origin);return ['https:','http:'].includes(url.protocol)&&url.origin===origin}catch{return false}
}
export function serveInstallTargetProbe(req,res,{allowedOrigins,read,traceId,send}){
 let cors={};
 try{
  requireCondition(req.url?.startsWith('/')&&!req.url.startsWith('//')&&!req.url.includes('\\')&&req.url.split('?')[0]===PATH,'BAD_TARGET','Invalid discovery target.');
  requireCondition(req.headers['sec-fetch-dest']!=='iframe','FRAME_CONTROL_DENIED','An application frame cannot inspect the host.',{},403);
  const url=new URL(req.url,'http://127.0.0.1'),origin=req.headers.origin,approved=origin===undefined||allowedOrigins.includes(origin);
  if(!approved){
   requireCondition(browserOrigin(origin),'ORIGIN_DENIED','Not available.',{},403);
   requireCondition(req.method==='GET'||req.method==='OPTIONS','METHOD_NOT_ALLOWED','Discovery requires GET.',{},405);
   requireCondition(!url.search,'UNKNOWN_FIELDS','Discovery takes no parameters.');
   requireCondition(req.headers.cookie===undefined&&req.headers.authorization===undefined,'CREDENTIALS_NOT_ACCEPTED','Discovery requires credentials: omit.',{},403);
  }
  if(req.method==='OPTIONS'){
   const method=req.headers['access-control-request-method'],headers=req.headers['access-control-request-headers'],privateNetwork=req.headers['access-control-request-private-network'];
   requireCondition(method==='GET'||(approved&&method===undefined),'METHOD_NOT_ALLOWED','Discovery preflight permits GET only.',{},405);
   requireCondition(headers===undefined||headers.trim()==='','PREFLIGHT_HEADERS_DENIED','Discovery preflight accepts no additional request headers.',{},403);
   requireCondition(privateNetwork===undefined||privateNetwork==='true','INVALID_PREFLIGHT','Invalid private-network preflight.');
   cors=origin===undefined?{}:{'access-control-allow-origin':origin};
   // A non-2xx preflight hides the subsequent refusal from fetch. This grants only the fixed GET response.
   send(res,204,undefined,{...cors,vary:VARY,'access-control-allow-methods':'GET',...(origin!==undefined&&privateNetwork==='true'?{'access-control-allow-private-network':'true'}:{})});return;
  }
  cors=origin===undefined?{}:{'access-control-allow-origin':origin,vary:'Origin'};
  if(!approved){send(res,403,{error:{code:'ORIGIN_DENIED',message:'This website is not allowed to read discovery.'}},cors);return;}
  requireCondition(req.method==='GET','METHOD_NOT_ALLOWED','Discovery requires GET.',{},405);
  requireCondition(!url.search,'UNKNOWN_FIELDS','Discovery takes no parameters.');
  send(res,200,{...read(),traceId},cors);
 }catch(error){
  const trusted=error instanceof AppHostError;
  send(res,trusted?error.status:500,{error:{code:trusted?error.code:'INTERNAL_ERROR',message:trusted?error.message:'The operation could not be completed.'},traceId},cors);
 }
}

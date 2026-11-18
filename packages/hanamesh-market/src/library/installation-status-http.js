import {AppHostError,requireCondition} from '../errors.js';
export function installationStatusCors(req,allowedOrigins){
 const origin=req.headers.origin;
 requireCondition(typeof origin==='string'&&allowedOrigins.includes(origin),'ORIGIN_DENIED','This origin is not allowed to read installation status.',{},403);
 return{'access-control-allow-origin':origin,vary:'Origin','access-control-allow-private-network':'true'};
}
/** Called only after the owning listener's exact loopback Host and Origin checks. */
export async function serveInstallationStatus(req,res,{read,maxBodyBytes,traceId,cors,send}){
 requireCondition(req.url?.startsWith('/')&&!req.url.startsWith('//')&&!req.url.includes('\\'),'BAD_TARGET','Invalid request target.');
 requireCondition(req.headers['sec-fetch-dest']!=='iframe','FRAME_CONTROL_DENIED','An application frame cannot inspect the host.',{},403);
 requireCondition(req.headers.cookie===undefined&&req.headers.authorization===undefined,'CREDENTIALS_NOT_ACCEPTED','Installation reads require credentials: omit.',{},403);
 requireCondition(!new URL(req.url,'http://127.0.0.1').search,'UNKNOWN_FIELDS','Installation status takes no query.');
 if(req.method==='OPTIONS'){send(res,204,undefined,{...cors,'access-control-allow-methods':'POST','access-control-allow-headers':'content-type'});return;}
 requireCondition(req.method==='POST','METHOD_NOT_ALLOWED','Installation status requires POST.',{},405);
 requireCondition(req.headers['content-type']?.split(';')[0].trim()==='application/json','CONTENT_TYPE_REQUIRED','Expected application/json.',{},415);
 let total=0;const chunks=[];
 for await(const chunk of req){total+=chunk.length;requireCondition(total<=maxBodyBytes,'BODY_TOO_LARGE','Installation status body is too large.',{},413);chunks.push(chunk)}
 let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new AppHostError('INVALID_JSON','Malformed JSON.',{},400)}
 requireCondition(body&&typeof body==='object'&&!Array.isArray(body)&&Object.keys(body).every(key=>['contractVersion','consent'].includes(key)),'UNKNOWN_FIELDS','Only contractVersion and consent are accepted.');
 requireCondition(body.contractVersion===undefined||body.contractVersion==='1','INSTALLATION_STATUS_CONTRACT_UNSUPPORTED','Installation status contractVersion 1 is required.');
 requireCondition(Object.keys(body).length===2&&body.contractVersion==='1'&&body.consent==='read-installations','INSTALLATION_STATUS_CONSENT_REQUIRED','Explicit one-request read-installations consent is required.',{},403);
 requireCondition(typeof read==='function','INSTALLATION_STATUS_UNAVAILABLE','The read-only installation bridge is not supplied.',{},503);
 const controller=new AbortController();const abort=()=>{if(!res.writableEnded)controller.abort()};req.once('aborted',abort);res.once('close',abort);
 try{if(req.aborted||res.destroyed)controller.abort();const value=await read({signal:controller.signal});if(!controller.signal.aborted)send(res,200,{...value,traceId},cors)}
 finally{req.off('aborted',abort);res.off('close',abort)}
}

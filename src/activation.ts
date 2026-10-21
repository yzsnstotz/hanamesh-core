/** One ordinary plugin activation owns these route registrations. No retry or timer. */
export function createActivationGate(admission: {requestRejection(request:Request):401|403|undefined}) {
 let handler:((request:Request)=>Promise<Response>)|undefined;
 let phase:'starting'|'ready'|'failed'|'disposed'='starting';
 let settle!:()=>void;const activation=new Promise<void>(resolve=>{settle=resolve});
 const failure=(code:string,status:number)=>Response.json({error:{code}},{status,headers:{'cache-control':'no-store'}});
 return {
  async fetch(request:Request):Promise<Response>{
   const rejected=admission.requestRejection(request);
   if(rejected!==undefined)return failure(rejected===401?'CORE_NOT_READY':'CORE_INPUT_INVALID',rejected);
   if(phase==='starting'&&!request.signal.aborted){
    let onAbort!:()=>void;
    const aborted=new Promise<void>(resolve=>{onAbort=resolve;request.signal.addEventListener('abort',onAbort,{once:true})});
    try{await Promise.race([activation,aborted])}finally{request.signal.removeEventListener('abort',onAbort)}
   }
   if(request.signal.aborted)return failure('CORE_REQUEST_ABORTED',499);
   if(phase!=='ready'||!handler)return failure(phase==='disposed'?'CORE_DISPOSED':'CORE_ACTIVATION_FAILED',503);
   return handler(request);
  },
  ready(value:(request:Request)=>Promise<Response>){if(phase!=='starting')throw Error('CORE_ACTIVATION_ALREADY_SETTLED');handler=value;phase='ready';settle()},
  fail(){if(phase==='starting'){phase='failed';settle()}},
  dispose(){if(phase!=='failed')phase='disposed';handler=undefined;settle()},
 };
}

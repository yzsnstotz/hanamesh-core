import {readFileSync,rmSync} from 'node:fs';
import {AgentOriginLedger,checkedAgentEvent} from './agent-origins.js';
import {createBindLink} from './bind-link.js';
/** C-CORE portable process boundary. No Cordis/DSH or other plugin imports. */
import {createHash, randomUUID} from 'node:crypto';
import {link, mkdir, open, readFile, rename, rm} from 'node:fs/promises';
import {isAbsolute, join} from 'node:path';
import {createDevice, requestNonce, signWithDevice} from './device.js';
import {fileSharedDeviceStore} from './shared-device.js';
import {serverOriginOf} from './validation.js';
import {ServerTransport} from './transport.js';
import {upstreamError, upstreamJson} from './errors.js';
import {registerDevice} from './registration.js';

export interface AgentCoreConfig {sharedHome:string; serverOrigin:string|null; websiteOrigin:string|null; timeoutMs?:number}
type Consent = {state:'granted'|'withheld'; changedAt:string|null;consentId:string|null; authorization?:'website'|'legacy-terminal'|null;agreedAt?:string|null};
type Prepared = {deviceId:string;consentId:string;serverOrigin:string;websiteOrigin:string};
const NOTICE='hm-agent-usage-v1';
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const iso=(v:unknown):v is string=>typeof v==='string'&&ISO.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
async function optionalJson(path:string):Promise<unknown>{try{return JSON.parse(await readFile(path,'utf8')) as unknown;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw error;}}
async function publish(path:string,value:unknown,claim=false):Promise<void>{
 const temp=`${path}.${randomUUID()}.tmp`;const fd=await open(temp,'wx',0o600);
 try{try{await fd.writeFile(JSON.stringify(value));await fd.sync();}finally{await fd.close();}
  try{if(claim)await link(temp,path);else await rename(temp,path);}catch(error){if(!claim||(error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
 }finally{await rm(temp,{force:true});}
}
function pair(origin:string|null,website:string|null):void{
 if(!origin||!website)fail('BIND_ORIGIN_UNAVAILABLE');
 const loopback=(v:string)=>['127.0.0.1','localhost','[::1]'].includes(new URL(v).hostname);
 if(loopback(origin!)!==loopback(website!))fail('CORE_WEBSITE_CONFIGURATION_REQUIRED');
}
function snapshot(value:unknown,prepared:Prepared):Record<string,unknown>{
 const bad=()=>fail('CORE_AGENT_ONBOARDING_UNCONFIRMED');
 if(!value||typeof value!=='object'||Array.isArray(value))return bad();
 const v=value as Record<string,unknown>;
 if(Object.keys(v).sort().join('|')!=='agreedAt|authorization|barrier|binding|consentId|deviceId|includeBackfill|noticeVersion|state'||v.deviceId!==prepared.deviceId||v.consentId!==prepared.consentId||v.barrier!=='committed'||!['pending','active','withdrawn'].includes(String(v.state)))return bad();
 if(v.binding!==null){const b=v.binding as Record<string,unknown>;if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).sort().join('|')!=='accountPrincipalId|linkedAt'||typeof b.accountPrincipalId!=='string'||!(/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/).test(b.accountPrincipalId)||!iso(b.linkedAt))return bad();}
 if(v.noticeVersion!==NOTICE||v.includeBackfill!==true)return bad();
 if(v.state==='active'){if(v.authorization!=='website'||!iso(v.agreedAt)||v.binding===null)return bad();}
 else if(v.state==='pending'){if(v.authorization!==null||v.agreedAt!==null)return bad();}
 else if(![null,'website'].includes(v.authorization as string|null)||(v.agreedAt!==null&&!iso(v.agreedAt)))return bad();
 return v;
}
const CONSENT_ID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const fail = (code:string):never => {throw new Error(code);};
/** Identity binding signs raw nonce bytes. Agent event canonical bytes are always a JSON object. */
function agentBindLink(website:string,device:Parameters<typeof createBindLink>[1],challenge:unknown):ReturnType<typeof createBindLink>{
  const nonce=(challenge as {nonce?:unknown}|null)?.nonce;
  if(typeof nonce==='string'&&nonce.trimStart().startsWith('{'))fail('CORE_UPSTREAM_RESPONSE_INVALID');
  return createBindLink(website,device,challenge);
}
function headersFor(device:Parameters<typeof signWithDevice>[0],method:string,path:string,body:string|null) {
  const timestamp=Date.now().toString(),nonce=requestNonce();
  const bytes=Buffer.from(`${method.toUpperCase()}|${path.replace(/[?#].*$/u,'')}|${timestamp}|${nonce}|${createHash('sha256').update(body ?? '').digest('hex')}`);
  return {'x-hm-device-id':device.deviceId,'x-hm-timestamp':timestamp,'x-hm-nonce':nonce,'x-hm-signature':Buffer.from(signWithDevice(device,bytes)).toString('base64url')};
}
export async function agentCall(config:AgentCoreConfig, input:Record<string,unknown>):Promise<Record<string,unknown>> {
  if (!isAbsolute(config.sharedHome)) fail('CORE_INPUT_INVALID');
  if(config.timeoutMs!==undefined&&(!Number.isSafeInteger(config.timeoutMs)||config.timeoutMs<10||config.timeoutMs>60000))fail('CORE_INPUT_INVALID');
  const origin = config.serverOrigin === null ? null : serverOriginOf(config.serverOrigin);
  const website = config.websiteOrigin === null ? null : serverOriginOf(config.websiteOrigin);
  if(input.operation==='sign')fail('CORE_INPUT_INVALID');
  const store=fileSharedDeviceStore(config.sharedHome);const existing=await store.read();
  const dir = join(config.sharedHome,'agent');
  const consentFile = join(dir,'consent.json');
  const preparedFile=join(dir,'onboarding.json'), grantFile=join(dir,'onboarding-grant.json');
  const readConsent=async(checkOrigins=true):Promise<Consent>=>{
    if(!existing){
      const stopped=await optionalJson(consentFile) as {state?:unknown;deviceId?:unknown;changedAt?:unknown;consentId?:unknown}|undefined;
      if(stopped?.state==='withheld'&&stopped.deviceId===null){
        if(!iso(stopped.changedAt)||typeof stopped.consentId!=='string'||!CONSENT_ID.test(stopped.consentId))fail('CORE_CONSENT_CORRUPT');
        return {state:'withheld',changedAt:stopped.changedAt as string,consentId:stopped.consentId as string,authorization:null,agreedAt:null};
      }
      return {state:'withheld',changedAt:null,consentId:null,authorization:null,agreedAt:null};
    }
    const value=await optionalJson(consentFile) as Partial<Consent>|undefined;
    let result:Consent={state:'withheld',changedAt:null,consentId:null,authorization:null,agreedAt:null};
    if(value!==undefined){
      if(!value||!['granted','withheld'].includes(String(value.state))||typeof value.changedAt!=='string'||!Number.isFinite(Date.parse(value.changedAt))||(value.consentId!==undefined&&value.consentId!==null&&(typeof value.consentId!=='string'||!CONSENT_ID.test(value.consentId))))fail('CORE_CONSENT_CORRUPT');
      result={state:value.state!,changedAt:value.changedAt!,consentId:value.consentId??null,authorization:value.state==='granted'?'legacy-terminal':null,agreedAt:null};
      // Explicit local close wins over any concurrent or late website response. A website grant never overwrites this file.
      if(value.state==='withheld')return result;
    }
    const prepared=await readPrepared(checkOrigins);
    const grant=await optionalJson(grantFile);
    if(grant!==undefined){
      if(!prepared)fail('CORE_AGENT_ONBOARDING_UNCONFIRMED');
      const facts=snapshot(grant,prepared!);
      if(facts.state!=='active')fail('CORE_AGENT_ONBOARDING_UNCONFIRMED');
      result={state:'granted',changedAt:facts.agreedAt as string,consentId:prepared!.consentId,authorization:'website',agreedAt:facts.agreedAt as string};
    }else if(prepared&&result.state!=='granted')result.consentId=prepared.consentId;
    return result;
  };
  const readPrepared=async(checkOrigins=true):Promise<Prepared|null>=>{
    const value=await optionalJson(preparedFile);if(value===undefined)return null;
    const p=value as Prepared;
    if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).sort().join('|')!=='consentId|deviceId|serverOrigin|websiteOrigin'||typeof p.deviceId!=='string'||!(/^[A-Za-z0-9_-]{43}$/).test(p.deviceId)||typeof p.consentId!=='string'||!CONSENT_ID.test(p.consentId)||typeof p.serverOrigin!=='string'||typeof p.websiteOrigin!=='string'||(checkOrigins&&(p.serverOrigin!==origin||p.websiteOrigin!==website)))fail('CORE_AGENT_ONBOARDING_UNCONFIRMED');
    return p;
  };
  let consent=await readConsent(!(input.operation==='withdraw'||(input.operation==='consent'&&input.state==='withheld')));
  const close=async():Promise<Consent>=>{
    const current=await readConsent(false);
    const stopped:Consent={state:'withheld',changedAt:new Date().toISOString(),consentId:current.consentId??randomUUID()};
    await mkdir(dir,{recursive:true,mode:0o700});await publish(consentFile,{...stopped,deviceId:existing?.deviceId??null});return await readConsent(false);
  };
  if(input.operation==='consent'){
    if(Object.keys(input).sort().join('|')!=='operation|state'||!['granted','withheld'].includes(String(input.state)))fail('CORE_INPUT_INVALID');
    if(input.state==='withheld')return {consent:await close()};
    if(consent.state!=='granted')fail('CORE_AGENT_WEB_CONSENT_REQUIRED');
    if(!consent.consentId){consent={...consent,consentId:randomUUID()};await publish(consentFile,consent);}
    return {consent};
  }
  if (input.operation === 'state') {if(existing)AgentOriginLedger.validateExisting(config.sharedHome,existing.deviceId);return {agentProtocolVersion:2,agentOriginProtocolVersion:1,deviceId:existing?.deviceId ?? null,publicKey:existing?.publicKey ?? null,consent,serverOrigin:origin,websiteOrigin:website};}
  if(input.operation==='originObserve'){
    if(Object.keys(input).sort().join('|')!=='admitted|factId|operation'||typeof input.factId!=='string'||!/^[a-f0-9]{64}$/.test(input.factId)||typeof input.admitted!=='boolean')fail('CORE_INPUT_INVALID');
    if(!existing)fail('CORE_DEVICE_REQUIRED');const ledger=new AgentOriginLedger(config.sharedHome,existing!.deviceId);try{return ledger.observe(input.factId as string,input.admitted as boolean);}finally{ledger.close();}
  }
  if(input.operation==='prepareOnboarding'||input.operation==='syncOnboarding'){
    if(Object.keys(input).join('|')!=='operation')fail('CORE_INPUT_INVALID');
    pair(origin,website);
    if(consent.state==='withheld'&&consent.changedAt!==null)fail('CONSENT_WITHHELD');
    const transport=new ServerTransport(origin,config.timeoutMs??10000);
    try{
      let prepared=existing?await readPrepared():null;
      if(input.operation==='prepareOnboarding'){
        const device=existing??await store.claim(createDevice());
        if(!existing){
          const ledger=new AgentOriginLedger(config.sharedHome,device.deviceId);
          try{ledger.withIdentityTransaction(()=>{
            const read=(path:string):Record<string,unknown>|null=>{try{return JSON.parse(readFileSync(path,'utf8')) as Record<string,unknown>;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}};
            const prior=read(preparedFile);
            if(!prior||prior.deviceId!==device.deviceId){
              // Re-read while holding the identity lock: another fresh prepare may already have published this device.
              const stopped=read(consentFile);
              if(!stopped||stopped.state!=='withheld'||(stopped.deviceId!==null&&stopped.deviceId!==device.deviceId))rmSync(consentFile,{force:true});
              rmSync(grantFile,{force:true});if(prior)rmSync(preparedFile,{force:true});
            }
          });}finally{ledger.close();}
          prepared=await readPrepared();
        }
        await mkdir(dir,{recursive:true,mode:0o700});
        if(!prepared){await publish(preparedFile,{deviceId:device.deviceId,consentId:randomUUID(),serverOrigin:origin,websiteOrigin:website},true);prepared=await readPrepared();}
        if(!prepared||prepared.deviceId!==device.deviceId)fail('CORE_AGENT_ONBOARDING_UNCONFIRMED');
        await registerDevice(transport,device,null);
        const path=`/v2/usage/me/devices/${device.deviceId}/consents/${prepared!.consentId}/onboarding`,body=JSON.stringify({noticeVersion:NOTICE,includeBackfill:true});
        const facts=snapshot(await upstreamJson(await transport.request(path,{method:'POST',headers:{...headersFor(device,'POST',path,body),'content-type':'application/json'},body})),prepared!);
        if(facts.state==='withdrawn'){await close();fail('CONSENT_WITHHELD');}
        const challenge=await upstreamJson(await transport.request('/v1/identity/devices/challenge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({purpose:'bind'})}));
        const result=agentBindLink(website!,device,challenge),url=new URL(result.url);
        url.searchParams.set('flow','agent');url.searchParams.set('consentId',prepared!.consentId);url.searchParams.set('noticeVersion',NOTICE);
        const current=await readConsent();if(current.changedAt!==null&&current.state==='withheld')fail('CONSENT_WITHHELD');
        return {url:url.href,expiresAt:result.expiresAt,consentId:prepared!.consentId,deviceId:device.deviceId};
      }
      if(!prepared||!existing||prepared.deviceId!==existing.deviceId)fail('CORE_AGENT_ONBOARDING_UNCONFIRMED');
      const path=`/v2/usage/me/devices/${existing!.deviceId}/consents/${prepared!.consentId}`;
      const facts=snapshot(await upstreamJson(await transport.request(path,{method:'GET',headers:headersFor(existing!,'GET',path,null)})),prepared!);
      if(facts.state==='withdrawn')await close();
      if(facts.state==='active')await publish(grantFile,facts);
      consent=await readConsent();
      if(consent.state==='withheld'&&consent.changedAt!==null)fail('CONSENT_WITHHELD');
      return {onboarding:facts,consent};
    }finally{transport.dispose();}
  }
  // After opt-out only this fixed DELETE is signable. No arbitrary signing or new identity is allowed.
  if(input.operation==='withdraw') {
    consent=await close();
    await readPrepared(); // Refuse sending the old generation to a changed backend, after local close.
    if(!existing)return {deletedEvents:0,barrier:'no-device',consentId:consent.consentId};
    if(!consent.consentId)return fail('CORE_CONSENT_GENERATION_REQUIRED');
    if(!origin)return fail('SERVER_ORIGIN_UNAVAILABLE');
    const transport=new ServerTransport(origin,config.timeoutMs ?? 10000);
    try{const path=`/v2/usage/me/devices/${existing.deviceId}/consents/${consent.consentId}`;
      const response=await transport.request(path,{method:'DELETE',headers:headersFor(existing,'DELETE',path,null)});
      if(!response.ok)throw await upstreamError(response);
      const value=await upstreamJson(response) as {deletedEvents?:unknown;consentId?:unknown;state?:unknown;barrier?:unknown};
      if(Object.keys(value).sort().join('|')!=='barrier|consentId|deletedEvents|state'||value.consentId!==consent.consentId||value.state!=='withdrawn'||value.barrier!=='committed'||!Number.isSafeInteger(value.deletedEvents)||Number(value.deletedEvents)<0)return fail('CORE_WITHDRAWAL_UNCONFIRMED');
      return {deletedEvents:value.deletedEvents,consentId:value.consentId,state:value.state,barrier:value.barrier};
    }finally{transport.dispose();}
  }
  if (consent.state !== 'granted') fail('CONSENT_WITHHELD');
  if(!existing)fail('CORE_DEVICE_REQUIRED');
  const device=existing!;
  if(input.operation==='signAgentEvent'){
    if(Object.keys(input).sort().join('|')!=='event|factId|operation'||typeof input.factId!=='string'||!consent.consentId)fail('CORE_INPUT_INVALID');
    const event=checkedAgentEvent(input.event,input.factId as string,device.deviceId,consent.consentId!);
    const ledger=new AgentOriginLedger(config.sharedHome,device.deviceId);
    try{return ledger.sign(input.factId as string,event.hanaRef,event.action,event.bytes,()=>Buffer.from(signWithDevice(device,event.bytes)).toString('base64url'));}finally{ledger.close();}
  }
  const transport = new ServerTransport(origin,config.timeoutMs ?? 10000);
  try {
    if (input.operation === 'register') {if(!origin)fail('SERVER_ORIGIN_UNAVAILABLE');return {...await registerDevice(transport,device,null)};}
    if (input.operation === 'bindLink') {
      if(!website || !origin) fail('BIND_ORIGIN_UNAVAILABLE');
      const loopback=(value:string)=>['127.0.0.1','localhost','[::1]'].includes(new URL(value).hostname);
      if(loopback(origin!)&&!loopback(website!)) fail('CORE_WEBSITE_CONFIGURATION_REQUIRED');
      const response=await transport.request('/v1/identity/devices/challenge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({purpose:'bind'})});
      if(!response.ok)throw await upstreamError(response);
      const challenge=await upstreamJson(response) as {nonce?:unknown;expiresAt?:unknown};
      return agentBindLink(website as string, device, challenge);
    }
    if (input.operation === 'signRequest') {
      if (typeof input.method !== 'string' || typeof input.path !== 'string' || !input.path.startsWith('/') || input.path.includes('|') || (input.body !== null && typeof input.body !== 'string')) fail('CORE_INPUT_INVALID');
      return headersFor(device,input.method as string,input.path as string,input.body as string|null);
    }
    return fail('CORE_INPUT_INVALID');
  } finally {transport.dispose();}
}

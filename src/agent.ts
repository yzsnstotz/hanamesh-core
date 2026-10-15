/** C-CORE portable process boundary. No Cordis/DSH or other plugin imports. */
import {createHash, randomUUID} from 'node:crypto';
import {mkdir, open, readFile, rename, rm} from 'node:fs/promises';
import {isAbsolute, join} from 'node:path';
import {createDevice, requestNonce, signWithDevice} from './device.js';
import {fileSharedDeviceStore} from './shared-device.js';
import {serverOriginOf} from './validation.js';
import {ServerTransport} from './transport.js';
import {registerDevice} from './registration.js';

export interface AgentCoreConfig {sharedHome:string; serverOrigin:string|null; websiteOrigin:string|null; timeoutMs?:number}
type Consent = {state:'granted'|'withheld'; changedAt:string|null};
const fail = (code:string):never => {throw new Error(code);};
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
  const dir = join(config.sharedHome,'agent');
  const consentFile = join(dir,'consent.json');
  let consent:Consent = {state:'withheld',changedAt:null};
  try {
    const value:unknown = JSON.parse(await readFile(consentFile,'utf8'));
    const row = value as Partial<Consent>|null;
    if (!row || !['granted','withheld'].includes(String(row.state)) || typeof row.changedAt !== 'string' || !Number.isFinite(Date.parse(row.changedAt))) fail('CORE_CONSENT_CORRUPT');
    consent = row as Consent;
  } catch(error) {if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;}
  if (input.operation === 'consent') {
    if (!['granted','withheld'].includes(String(input.state))) fail('CORE_INPUT_INVALID');
    consent = {state:input.state as Consent['state'],changedAt:new Date().toISOString()};
    await mkdir(dir,{recursive:true,mode:0o700});
    const temp = `${consentFile}.${randomUUID()}.tmp`;
    try {const fd = await open(temp,'wx',0o600);try{await fd.writeFile(JSON.stringify(consent));await fd.sync();}finally{await fd.close();}await rename(temp,consentFile);}finally{await rm(temp,{force:true});}
    return {consent};
  }
  const store = fileSharedDeviceStore(config.sharedHome);
  const existing = await store.read();
  if (input.operation === 'state') return {deviceId:existing?.deviceId ?? null,publicKey:existing?.publicKey ?? null,consent,serverOrigin:origin,websiteOrigin:website};
  // After opt-out only this fixed DELETE is signable. No arbitrary signing or new identity is allowed.
  if(input.operation==='withdraw') {
    if(!existing)return {deletedEvents:0};
    if(!origin)return fail('SERVER_ORIGIN_UNAVAILABLE');
    const transport=new ServerTransport(origin,config.timeoutMs ?? 10000);
    try{const path=`/v1/usage/me/devices/${existing.deviceId}/events`;
      const response=await transport.request(path,{method:'DELETE',headers:headersFor(existing,'DELETE',path,null)});
      if(!response.ok)return fail('CORE_WITHDRAWAL_UNCONFIRMED');
      const value=await response.json() as {deletedEvents?:unknown};
      if(!Number.isSafeInteger(value.deletedEvents)||Number(value.deletedEvents)<0)return fail('CORE_WITHDRAWAL_UNCONFIRMED');
      return {deletedEvents:value.deletedEvents};
    }finally{transport.dispose();}
  }
  if (consent.state !== 'granted') fail('CONSENT_WITHHELD');
  const device = existing ?? await store.claim(createDevice());
  if (input.operation === 'sign') {
    if (typeof input.bytes !== 'string' || Buffer.from(input.bytes,'base64').toString('base64') !== input.bytes) fail('CORE_INPUT_INVALID');
    return {signature:Buffer.from(signWithDevice(device,Buffer.from(input.bytes as string,'base64'))).toString('base64url')};
  }
  const transport = new ServerTransport(origin,config.timeoutMs ?? 10000);
  try {
    if (input.operation === 'register') {if(!origin)fail('SERVER_ORIGIN_UNAVAILABLE');return {...await registerDevice(transport,device,null)};}
    if (input.operation === 'bindLink') {
      if(!website || !origin) fail('BIND_ORIGIN_UNAVAILABLE');
      const response=await transport.request('/v1/identity/devices/challenge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({purpose:'bind'})});
      if(!response.ok)fail('CORE_UPSTREAM_UNAVAILABLE');
      const challenge=await response.json() as {nonce?:unknown;expiresAt?:unknown};
      if(typeof challenge.nonce!=='string' || typeof challenge.expiresAt!=='string')fail('CORE_UPSTREAM_UNAVAILABLE');
      const url=new URL('/me/bind',website as string);
      url.searchParams.set('deviceId',device.deviceId);url.searchParams.set('nonce',challenge.nonce as string);
      url.searchParams.set('signature',Buffer.from(signWithDevice(device,Buffer.from(challenge.nonce as string))).toString('base64url'));
      return {url:url.href,expiresAt:challenge.expiresAt};
    }
    if (input.operation === 'signRequest') {
      if (typeof input.method !== 'string' || typeof input.path !== 'string' || !input.path.startsWith('/') || input.path.includes('|') || (input.body !== null && typeof input.body !== 'string')) fail('CORE_INPUT_INVALID');
      return headersFor(device,input.method as string,input.path as string,input.body as string|null);
    }
    return fail('CORE_INPUT_INVALID');
  } finally {transport.dispose();}
}

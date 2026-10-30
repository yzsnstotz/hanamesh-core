import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileSharedDeviceStore} from '../../lib/shared-device.js';
import {createDevice} from '../../lib/device.js';
/** The committed website authorization fixture used by portable signing tests. */
export async function seedWebsiteGrant(root,config){
 const device=await fileSharedDeviceStore(root).claim(createDevice()),consentId=randomUUID();
 await mkdir(join(root,'agent'),{recursive:true,mode:0o700});
 const prepared={deviceId:device.deviceId,consentId,serverOrigin:config.serverOrigin,websiteOrigin:config.websiteOrigin};
 const grant={deviceId:device.deviceId,consentId,state:'active',authorization:'website',noticeVersion:'hm-agent-usage-v1',includeBackfill:true,agreedAt:'2026-10-28T10:00:00.000Z',binding:{accountPrincipalId:'73ed4ae5-4b2e-4b93-9f59-cd734d681318',linkedAt:'2026-10-28T09:00:00.000Z'},barrier:'committed'};
 for(const [name,value] of [['onboarding.json',prepared],['onboarding-grant.json',grant]])await writeFile(join(root,'agent',name),JSON.stringify(value),{mode:0o600});
 return grant;
}

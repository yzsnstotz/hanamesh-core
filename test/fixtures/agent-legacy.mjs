import {fileSharedDeviceStore} from '../../lib/shared-device.js';
import {createDevice} from '../../lib/device.js';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
/** A real old on-disk terminal grant, not a v2 model-authorized opt-in. */
export async function seedLegacyGrant(root){
 await fileSharedDeviceStore(root).claim(createDevice());
 await mkdir(join(root,'agent'),{recursive:true,mode:0o700});
 const consent={state:'granted',changedAt:'2026-10-01T00:00:00.000Z',consentId:randomUUID()};
 await writeFile(join(root,'agent/consent.json'),JSON.stringify(consent),{mode:0o600});return consent;
}

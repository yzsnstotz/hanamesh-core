import type {HanaMeshCoreContract} from '../lib/contract.js';
declare const core: HanaMeshCoreContract;
const deviceId: string = core.getDeviceId();
const consent: 'granted' | 'withheld' = core.getConsent();
const signature: Uint8Array = core.sign(new Uint8Array());
void [deviceId, consent, signature];

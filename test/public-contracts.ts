import type {HanaMeshCoreContract} from '../lib/contract.js';
declare const core: HanaMeshCoreContract;
const deviceId: string = core.getDeviceId();
const consent: 'granted' | 'withheld' = core.getConsent();
const signature: Uint8Array = core.sign(new Uint8Array());
void [deviceId, consent, signature];
import {checkCoreService, type CoreHandshake} from '../lib/contract.js';
const handshake: CoreHandshake = checkCoreService(core);
void handshake;

// Identity types come from the installed published source, never a local declaration copy.
import type {DeviceLabelDTO, DeviceChallengeDTO} from '@hanamesh/server-identity/contracts';
import {deviceLabel} from '../lib/registration.js';
const label: DeviceLabelDTO | null = deviceLabel();
declare const challenge: DeviceChallengeDTO;
const nonce: string = challenge.nonce;
void [label, nonce];

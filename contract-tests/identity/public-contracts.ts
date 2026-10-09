// Identity types come from the installed published source, never a local declaration copy.
import type {DeviceLabelDTO, DeviceChallengeDTO} from '@hanamesh/server-identity/contracts';
import {deviceLabel} from '../../lib/registration.js';
const label: DeviceLabelDTO | null = deviceLabel();
declare const challenge: DeviceChallengeDTO;
const nonce: string = challenge.nonce;
void [label, nonce];

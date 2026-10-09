// Public Identity names are consumed from the normal installed source, with no DTO declarations copied here.
import type {DeviceLabelDTO, DeviceChallengeDTO, DeviceChallengeInput, DeviceRegisterInput, DeviceRegisterResponse, DeviceBindInput} from '@hanamesh/server-identity/contracts';
import type {DeviceBindInput as ContractDeviceBindInput} from '@hanamesh/server-identity/contract';
import type {DeviceAuthHeaders} from '../../lib/contract.js';
import {deviceLabel, registerDevice} from '../../lib/registration.js';
const label: DeviceLabelDTO | null = deviceLabel();
declare const challenge: DeviceChallengeDTO;
const nonce: string = challenge.nonce;
const challenges: readonly DeviceChallengeInput[] = [{purpose: 'register'}, {purpose: 'bind'}];
declare const device: Parameters<typeof registerDevice>[1];
declare const headers: DeviceAuthHeaders;
const registrationInput: DeviceRegisterInput = {
  publicKey: device.publicKey, nonce, signature: headers['x-hm-signature'], ...(label ? {label} : {}),
};
declare const actualCoreRegistration: Awaited<ReturnType<typeof registerDevice>>;
const publishedRegistration: DeviceRegisterResponse = actualCoreRegistration;
declare const providerRegistration: DeviceRegisterResponse;
const acceptedCoreRegistration: Awaited<ReturnType<typeof registerDevice>> = providerRegistration;
declare const bindInput: DeviceBindInput;
const contractBindInput: ContractDeviceBindInput = bindInput;
const deviceId: string = contractBindInput.deviceId;
const signature: string = contractBindInput.signature;
void [label, nonce, challenges, registrationInput, publishedRegistration, acceptedCoreRegistration, deviceId, signature];

import type {HanaMeshCoreContract} from '../lib/contract.js';
declare const core: HanaMeshCoreContract;
const deviceId: string = core.getDeviceId();
const consent: 'granted' | 'withheld' = core.getConsent();
const signature: Uint8Array = core.sign(new Uint8Array());
void [deviceId, consent, signature];
import {checkCoreService, type CoreHandshake} from '../lib/contract.js';
const handshake: CoreHandshake = checkCoreService(core);
void handshake;
import {CORE_CONTRACT_DEFINITION, createCoreContractExamples, type CoreContractExamples, type SessionSnapshot, type DeviceAuthHeaders, type RequestSignatureInput} from '../lib/contract-fixtures.js';
const definitionId: 'C-CORE' = CORE_CONTRACT_DEFINITION.id;
const notReady: 'CORE_NOT_READY' = CORE_CONTRACT_DEFINITION.methods.getDeviceId.errors[0];
const examplesPromise: Promise<CoreContractExamples> = createCoreContractExamples();
declare const examples: CoreContractExamples;
const request: RequestSignatureInput = examples.request;
const headers: DeviceAuthHeaders = examples.headers;
const session: SessionSnapshot = examples.session;
void [definitionId, notReady, examplesPromise, request, headers, session];

import {SUITE_MANIFEST, type SuiteDeclaration} from "hanamesh-core/suite";
const declaration: Promise<SuiteDeclaration> | undefined = core.getSuiteDeclaration?.({registry:"https://registry.npmjs.org/"});
void [SUITE_MANIFEST, declaration];

import type {ConsentPrompt} from '../lib/contract.js';
const prompt: ConsentPrompt = {show: true, shownAt: null};
void prompt;

import {runCoreProviderSuite,runCoreConsumerSuite} from './contract-rc55/lib/contract-suite.js';
import {createCoreConsumerFixture,createCoreProviderFixture} from './contract-rc55/lib/contract-fixtures.js';
import {SessionController} from './consumer/package/lib/controller.js';
import {INITIAL_CORE_SNAPSHOT} from './consumer/package/lib/contracts.js';
let snapshot=structuredClone(INITIAL_CORE_SNAPSHOT);
const ctrl=await SessionController.create({serverOrigin:null,websiteOrigin:null},{read:()=>snapshot,publish:async value=>{snapshot=value},close:async()=>{}});
try {const results=[await runCoreProviderSuite({label:'rc56 real SessionController.service (memory store; source suite rc55)',service:ctrl.service,setConsent:s=>ctrl.setConsent(s)}),await runCoreProviderSuite(createCoreProviderFixture()),await runCoreConsumerSuite(createCoreConsumerFixture())];console.log(JSON.stringify({source:'hanamesh-core v0.2.0-rc.55',suite:'hanamesh-core/contract/suite',results},null,2));process.exitCode=results.every(r=>r.ok)?0:1;} finally {await ctrl.dispose();}

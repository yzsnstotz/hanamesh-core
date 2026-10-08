// Consumer-side probe: everything comes from the installed hanamesh-core package exports.
import {checkCoreService, CORE_PROTOCOL_VERSION} from 'hanamesh-core/contract';
import {createCoreProviderFixture, coreHandshakeCases} from 'hanamesh-core/contract/fixtures';
import schema from 'hanamesh-core/contract/schema.json' with {type: 'json'};
const {service} = createCoreProviderFixture();
const {signRequest: _drop, ...missing} = service;
const out = {
  schemaProtocol: schema['x-hanamesh'].protocolVersion, CORE_PROTOCOL_VERSION,
  match: checkCoreService(service),
  missingMethod: checkCoreService(missing),
  unsupportedVersion: checkCoreService({...service, protocolVersion: '2'}),
  consumerDeclaresOnly2: checkCoreService(service, ['2']),
  absent: checkCoreService(undefined),
  matrix: coreHandshakeCases().map(c => ({id: c.id, ok: JSON.stringify(checkCoreService(c.value)) === JSON.stringify(c.expected)})),
};
console.log(JSON.stringify(out, null, 1));
if (!out.matrix.every(r => r.ok)) process.exitCode = 1;

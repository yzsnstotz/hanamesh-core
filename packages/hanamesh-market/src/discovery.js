/** Validate only the public discovery extension. HTTP paths and catalog metadata belong to providers. */
import Ajv2020 from 'ajv/dist/2020.js';
import {DISCOVERY_SCHEMA} from '@hanamesh/api-contracts/catalog/discovery';
import {MarketError} from './catalog.js';
const ajv=new Ajv2020({strict:false,coerceTypes:false,useDefaults:false,removeAdditional:false});
ajv.addSchema(DISCOVERY_SCHEMA);
const validators=Object.fromEntries(['page','item','detailItem','domainDirectory','stageConfig'].map(kind=>[kind,ajv.compile({$ref:DISCOVERY_SCHEMA.$id+'#/$defs/'+kind})]));
/** Preserve provider ordering, identity, projection and nulls; never repair malformed data. */
export function decodeDiscovery(kind,value){
 const validate=validators[kind];
 if(!validate||!validate(value))throw new MarketError('DISCOVERY_RESPONSE_INVALID',502);
 return value;
}

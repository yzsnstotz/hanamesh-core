import {readFile} from 'node:fs/promises';
import {IDENTITY_PROTOCOL_VERSION} from '@hanamesh/server-identity/contract';
export {IDENTITY_PROTOCOL_VERSION};
export const identityPackage = JSON.parse(await readFile(new URL('../package.json', import.meta.resolve('@hanamesh/server-identity/contract')), 'utf8'));

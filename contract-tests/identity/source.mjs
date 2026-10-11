import {readFile} from 'node:fs/promises';
import {IDENTITY_PROTOCOL_VERSION} from '@hanamesh/api-contracts/identity';
export {IDENTITY_PROTOCOL_VERSION};
export const identityPackage = JSON.parse(await readFile(new URL(import.meta.resolve('@hanamesh/api-contracts/package.json')), 'utf8'));

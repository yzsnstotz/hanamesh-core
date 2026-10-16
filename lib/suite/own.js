import { readFileSync } from 'node:fs';
/** Owned package inputs, cached with the running module. Physical inventory is read afresh separately. */
export const OWN_PROFILE = JSON.parse(readFileSync(new URL('../../profile/suite.profile.json', import.meta.url), 'utf8'));
export const OWN_PACKAGE = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

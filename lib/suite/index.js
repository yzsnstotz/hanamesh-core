import { readFileSync } from 'node:fs';
import { frozen } from './facts.js';
/** Public data, generated from this release's package metadata and profile during build. */
export const SUITE_MANIFEST = frozen(JSON.parse(readFileSync(new URL('../../profile/suite.manifest.json', import.meta.url), 'utf8')));

import {readFileSync} from 'node:fs';
import {frozen} from './facts.js';
import type {SuiteManifest} from './types.js';
/** Public data, generated from this release's package metadata and profile during build. */
export const SUITE_MANIFEST: SuiteManifest = frozen(JSON.parse(readFileSync(new URL('../../profile/suite.manifest.json', import.meta.url), 'utf8')) as SuiteManifest);
export type {SuiteManifest, SuiteDeclaration, SuiteDeclarationRequest, SuiteInstalled, SuiteUpgrade, SuiteTarget, SuiteBlocked} from './types.js';

import {readFileSync} from 'node:fs';
import type {SuiteProfile} from '../health/types.js';
import {frozen} from './facts.js';
import type {PackageMetadata, SuiteManifest} from './types.js';
/** Owned package inputs, cached with the running module. Physical inventory is read afresh separately. */
export const OWN_PROFILE = JSON.parse(readFileSync(new URL('../../profile/suite.profile.json', import.meta.url), 'utf8')) as SuiteProfile;
/** Public data generated from the package metadata and the owned profile. */
export const SUITE_MANIFEST = frozen(JSON.parse(readFileSync(new URL('../../profile/suite.manifest.json', import.meta.url), 'utf8')) as SuiteManifest);
export const OWN_PACKAGE = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as PackageMetadata;

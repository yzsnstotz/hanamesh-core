export {SUITE_MANIFEST} from './own.js';
export type {SuiteManifest, SuiteDeclaration, SuiteDeclarationRequest, SuiteInstalled, SuiteUpgrade, SuiteTarget, SuiteBlocked, SuiteInstallRelease} from './types.js';

export type {SuiteInstallOptions} from './install-command.js';
export {formatSuiteInstallCommand, suiteInstallArgs, createSuiteInstallRelease} from './install-command.js';

export {assessLegacyInstallation} from './legacy.js';
export type {LegacyInstallationFacts, LegacyInstallationAssessment} from './types.js';

import semver from 'semver';
import {CoreError} from '../errors.js';
import {registryUrl} from './facts.js';
import type {SuiteInstallRelease} from './types.js';

export interface SuiteInstallOptions {readonly profile?: string; readonly registry?: string}
/** The sole executable suite installation definition. Consumers execute this argv verbatim. */
export function suiteInstallArgs(version: string, options: SuiteInstallOptions = {}): string[] {
  if (typeof version !== 'string' || semver.valid(version) !== version) throw new CoreError('CORE_SUITE_CANDIDATE_INVALID', 400);
  const profile = options.profile === undefined ? 'desktop' : options.profile;
  if (typeof profile !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(profile)) throw new CoreError('CORE_SUITE_REQUEST_INVALID', 400);
  return ['plugin', '--profile', profile, 'add', '--save-exact', ...(options.registry === undefined ? [] : [`--registry=${registryUrl(options.registry, [options.registry])}`]), `@hanamesh/hanamesh@${version}`];
}
const quote = (arg: string): string => /^[A-Za-z0-9_./:@=+%-]+$/.test(arg) ? arg : "'" + arg.replaceAll("'", "'\\''") + "'";
export function formatSuiteInstallCommand(version: string, options: SuiteInstallOptions = {}): string {
  return ['dsh', ...suiteInstallArgs(version, options)].map(quote).join(' ');
}
export function createSuiteInstallRelease(version: string, options: SuiteInstallOptions = {}): SuiteInstallRelease {
  const args = suiteInstallArgs(version, options);
  return {name: '@hanamesh/hanamesh', version, command: ['dsh', ...args].map(quote).join(' '), args};
}

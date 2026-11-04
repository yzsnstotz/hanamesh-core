import semver from 'semver';
import {CoreError} from '../errors.js';

/** Format only an exact published package version; no latest/range command is emitted. */
export function formatSuiteInstallCommand(version: string): string {
  if (semver.valid(version) !== version) throw new CoreError('CORE_SUITE_CANDIDATE_INVALID', 400);
  return `dsh plugin --profile desktop add --save-exact @hanamesh/hanamesh@${version}`;
}

import semver from 'semver';
import {isPackageName} from './facts.js';
import type {PackageMetadata, SuiteBlocked} from './types.js';
/** Existing C-MARKET public bundle format, shared by current, legacy and candidate checks. */
export function bundleFailure(record: PackageMetadata): string | null {
  const dsh = record.dsh;
  if (dsh === undefined) return 'CORE_SUITE_BUNDLE_MISSING';
  if (!dsh || typeof dsh !== 'object' || Array.isArray(dsh)) return 'CORE_SUITE_BUNDLE_INVALID';
  const bundle = dsh.bundle;
  if (bundle === undefined) return 'CORE_SUITE_BUNDLE_MISSING';
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle) || Object.keys(bundle).some(key => key !== 'patch')) return 'CORE_SUITE_BUNDLE_INVALID';
  if (bundle.patch === undefined) return 'CORE_SUITE_BUNDLE_MISSING';
  if (typeof bundle.patch !== 'string' || !/^\.\/[A-Za-z0-9._/-]+$/.test(bundle.patch) || bundle.patch.slice(2).split('/').some(part => !part || part === '.' || part === '..')) return 'CORE_SUITE_BUNDLE_INVALID';
  return null;
}
export async function compatibilityIssues(tuple: readonly PackageMetadata[], nodeVersion: string | null, peer: (name: string, record: PackageMetadata) => Promise<string | null | 'unknown' | undefined>): Promise<SuiteBlocked[]> {
  const issues: SuiteBlocked[] = [];
  for (const record of tuple) {
    const fail = (code: string): void => {issues.push({code, moduleName: record.name});};
    const bundle = bundleFailure(record);
    if (bundle) {fail(bundle); continue;}
    if (record.engines !== undefined && (!record.engines || typeof record.engines !== 'object' || Array.isArray(record.engines))) {fail('CORE_SUITE_METADATA_INVALID'); continue;}
    const range = record.engines?.node;
    if (range !== undefined && (typeof range !== 'string' || !range.trim() || !semver.validRange(range))) {fail('CORE_SUITE_METADATA_INVALID'); continue;}
    if (range !== undefined && nodeVersion !== null && !semver.satisfies(nodeVersion, range)) fail('CORE_SUITE_NODE_INCOMPATIBLE');
    if (record.peerDependencies !== undefined && (!record.peerDependencies || typeof record.peerDependencies !== 'object' || Array.isArray(record.peerDependencies))) {fail('CORE_SUITE_METADATA_INVALID'); continue;}
    for (const [name, range] of Object.entries(record.peerDependencies ?? {})) {
      const dshPeer = name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-');
      if (!isPackageName(name) || typeof range !== 'string' || !dshPeer && (!range.trim() || !semver.validRange(range))) {fail('CORE_SUITE_METADATA_INVALID'); continue;}
      const member = tuple.find(row => row.name === name);
      const actual = member?.version ?? await peer(name, record);
      // A disk-profile inventory does not observe host-injected runtime peers. It still validates declarations above.
      if (actual === undefined) continue;
      if (actual === 'unknown') {fail('CORE_SUITE_PEER_UNKNOWN'); continue;}
      if (actual === null && record.peerDependenciesMeta?.[name]?.optional === true) continue;
      if (actual === null) {fail('CORE_SUITE_PEER_UNKNOWN'); continue;}
      if (dshPeer) {
        const {evaluatePluginCompatibility} = await import('@deepseek-ai/dsh-app-boot');
        try {if (evaluatePluginCompatibility(record, {}, actual)) fail('CORE_SUITE_PEER_INCOMPATIBLE');}
        catch {fail('CORE_SUITE_METADATA_INVALID');}
      } else if (!semver.satisfies(actual, range)) fail('CORE_SUITE_PEER_INCOMPATIBLE');
    }
  }
  return issues;
}

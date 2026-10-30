import {SUITE_INSTALL_COMMAND} from './install-command.js';
import semver from 'semver';
import {evaluate} from '../health/evaluate.js';
import type {ComponentObservation} from '../health/types.js';
import {CoreError} from '../errors.js';
import {digest, frozen, repositoryIdentity, isPackageName, registryUrl} from './facts.js';
import type {PackageMetadata, SuiteBlocked, SuiteDeclaration, SuiteDeclarationRequest, SuiteManifest, SuiteServiceOptions, SuiteUpgrade} from './types.js';

/** Existing C-MARKET admission fact: a package must declare the supported public DSH patch bundle.
 * This checks metadata only, never an uninstalled package's internal patch file. */
function bundleFailure(record: PackageMetadata): string | null {
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
export class SuiteDeclarationService {
  constructor(readonly options: SuiteServiceOptions) {}
  async read(request?: SuiteDeclarationRequest): Promise<SuiteDeclaration> {
    const {profile, core, manifest, inventory, nodeVersion} = this.options;
    const clientAtStart = this.options.clientPeerFacts?.();
    const blocked: SuiteBlocked[] = [], upgrades: SuiteUpgrade[] = [];
    const peerFacts: Record<string, string | null> = {}, metadataDigests: Record<string, string> = {};
    let observations: readonly ComponentObservation[];
    try {observations = await inventory.observe(profile.components);} catch {observations = [];}
    const health = evaluate(profile, observations, 0);
    let physicalCore: ComponentObservation;
    try {physicalCore = await this.options.coreInventory();} catch {physicalCore = {kind: 'unreadable'};}
    const coreMatches = physicalCore.kind === 'present' && physicalCore.phase === 'active' && physicalCore.version === manifest.core.version && core.version === manifest.core.version;
    const installed = [{id: 'core', moduleName: core.name, requiredRange: manifest.core.version, repository: manifest.core.repository, actualVersion: physicalCore.version ?? null, actualRepository: repositoryIdentity(physicalCore.repository), runningVersion: manifest.core.version, status: coreMatches ? 'satisfied' : 'running-physical-mismatch'}, ...health.components.map((row, i) => ({id: row.id, moduleName: row.moduleName, requiredRange: row.requiredRange, repository: manifest.components[i]!.repository, actualVersion: row.version, actualRepository: repositoryIdentity(observations[i]?.repository), status: row.status}))];
    let completeness: SuiteDeclaration['completeness'] = health.components.some(row => !['satisfied', 'unreadable'].includes(row.status)) ? 'incomplete' : health.components.some(row => row.status === 'unreadable') ? 'unknown' : 'complete';
    if (!coreMatches) {completeness = physicalCore.kind === 'unreadable' || physicalCore.kind === 'ambiguous' ? 'unknown' : 'incomplete'; blocked.push({code: 'CORE_SUITE_RUNNING_PHYSICAL_MISMATCH', moduleName: core.name});}
    for (const row of installed) if (!row.actualRepository || row.actualRepository !== repositoryIdentity(row.repository)) {
      blocked.push({code: row.actualRepository ? 'CORE_SUITE_SOURCE_MISMATCH' : 'CORE_SUITE_INSTALLED_SOURCE_UNKNOWN', moduleName: row.moduleName});
      if (completeness === 'complete') completeness = 'unknown';
    }
    // External peer facts are read from the current Core/Loader resolution context once per declaration.
    const peer = async (name: string): Promise<string | null> => {
      if (!Object.hasOwn(peerFacts, name)) {
        try {const version = name === 'react' && clientAtStart ? clientAtStart.reactVersion ?? {status: 'unknown'} : await this.options.peerVersion(name); peerFacts[name] = version === null ? null : typeof version === 'string' && semver.valid(version) ? version : 'unknown';} catch {peerFacts[name] = 'unknown';}
      }
      return peerFacts[name] ?? null;
    };
    const compatible = async (tuple: readonly PackageMetadata[]): Promise<string | null> => {
      const bundle = tuple.map(bundleFailure).find(Boolean);
      if (bundle) return bundle;
      for (const record of tuple) {
        if (record.engines !== undefined && (!record.engines || typeof record.engines !== 'object' || Array.isArray(record.engines))) return 'CORE_SUITE_METADATA_INVALID';
        const range = record.engines?.node;
        if (range !== undefined && (typeof range !== 'string' || !range.trim() || !semver.validRange(range))) return 'CORE_SUITE_METADATA_INVALID';
        if (range !== undefined && !semver.satisfies(nodeVersion, range)) return 'CORE_SUITE_NODE_INCOMPATIBLE';
        if (record.peerDependencies !== undefined && (!record.peerDependencies || typeof record.peerDependencies !== 'object' || Array.isArray(record.peerDependencies))) return 'CORE_SUITE_METADATA_INVALID';
        for (const [name, range] of Object.entries(record.peerDependencies ?? {})) {
          if (!isPackageName(name)) return 'CORE_SUITE_METADATA_INVALID';
          if (typeof range !== 'string' || !range.trim() || !semver.validRange(range)) return 'CORE_SUITE_METADATA_INVALID';
          const member = tuple.find(row => row.name === name);
          const actual = member?.version ?? await peer(name);
          if (actual === 'unknown') return 'CORE_SUITE_PEER_UNKNOWN';
          if (actual === null && record.peerDependenciesMeta?.[name]?.optional === true) continue;
          if (actual === null) return 'CORE_SUITE_PEER_UNKNOWN';
          if (!semver.satisfies(actual, range)) return 'CORE_SUITE_PEER_INCOMPATIBLE';
        }
      }
      return null;
    };
    const currentRecords = [physicalCore.metadata, ...observations.map(row => row.metadata)];
    for (const record of currentRecords) if (record) metadataDigests[`installed:${record.name}`] = digest(record);
    if (currentRecords.some(row => !row)) {
      if (completeness === 'complete') completeness = 'unknown';
      blocked.push({code: 'CORE_SUITE_INSTALLED_METADATA_UNKNOWN'});
    } else if (currentRecords.some((row, i) => !this.validRecord(row!, installed[i]!.moduleName, installed[i]!.actualVersion ?? '', installed[i]!.repository))) {
      blocked.push({code: 'CORE_SUITE_INSTALLED_METADATA_MISMATCH'}); if (completeness === 'complete') completeness = 'unknown';
    } else {
      const reason = await compatible(currentRecords as PackageMetadata[]);
      if (reason) {blocked.push({code: reason}); if (completeness === 'complete') completeness = reason === 'CORE_SUITE_PEER_UNKNOWN' ? 'unknown' : 'incomplete';}
    }
    let registry: string | null = null;
    if (request === undefined) blocked.push({code: 'CORE_SUITE_SOURCE_MISSING'});
    else {
      try {
        if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).some(key => !['registry', 'coreVersion'].includes(key))) throw new CoreError('CORE_SUITE_REQUEST_INVALID', 400);
        if (typeof request.registry !== 'string') throw new CoreError('CORE_SUITE_SOURCE_UNSUPPORTED', 400);
        registry = this.options.registry.normalize ? this.options.registry.normalize(request.registry) : registryUrl(request.registry);
        if (request.coreVersion !== undefined && !semver.valid(request.coreVersion)) throw new CoreError('CORE_SUITE_CANDIDATE_INVALID', 400);
        const names = [core.name, ...manifest.components.map(row => row.moduleName)];
        const catalogs = new Map<string, Readonly<Record<string, PackageMetadata>>>();
        for (const name of names) {
          const data = await this.options.registry.read(registry, name);
          if (data.registry !== registry || data.name !== name) throw new CoreError('CORE_SUITE_SOURCE_MISMATCH', 502);
          catalogs.set(name, data.versions); metadataDigests[`registry:${name}`] = digest(data.versions);
        }
        const coreVersions = Object.keys(catalogs.get(core.name)!).filter(version => semver.valid(version) && semver.gte(version, core.version) && (!request.coreVersion || version === request.coreVersion)).sort(semver.rcompare);
        if (!coreVersions.length) blocked.push({code: 'CORE_SUITE_CANDIDATE_UNAVAILABLE', ...(request.coreVersion ? {coreVersion: request.coreVersion} : {})});
        for (const coreVersion of coreVersions) {
          const record = catalogs.get(core.name)![coreVersion]!;
          const candidate = record.hanameshSuite;
          const reject = (code: string): void => {blocked.push({code, coreVersion});};
          if (!candidate) {reject('CORE_SUITE_MANIFEST_MISSING'); continue;}
          if (!this.validManifest(candidate, record, coreVersion)) {reject('CORE_SUITE_MANIFEST_MISMATCH'); continue;}
          if (!this.validRecord(record, core.name, coreVersion, manifest.core.repository)) {reject('CORE_SUITE_SOURCE_MISMATCH'); continue;}
          const lists = candidate.components.map((requirement, i) => Object.entries(catalogs.get(requirement.moduleName)!).filter(([version, item]) => semver.valid(version) && installed[i + 1]?.actualVersion && semver.gte(version, installed[i + 1]!.actualVersion!) && semver.satisfies(version, requirement.versionRange) && this.validRecord(item, requirement.moduleName, version, requirement.repository)).map(([, item]) => item).sort((a, b) => a.version === installed[i + 1]?.actualVersion ? -1 : b.version === installed[i + 1]?.actualVersion ? 1 : semver.rcompare(a.version, b.version)));
          let chosen: readonly PackageMetadata[] | null = null, reason = 'CORE_SUITE_NO_COMPATIBLE_TUPLE';
          // Three members only. Exhaust the finite metadata set; no hidden truncation or search budget.
          for (const first of lists[0] ?? []) {
            for (const second of lists[1] ?? []) {
              const tuple = [record, first, second];
              if (!tuple.some((item, i) => semver.gt(item.version, installed[i]!.actualVersion!))) continue;
              const failure = await compatible(tuple);
              if (failure) {reason = failure; continue;}
              chosen = tuple; break;
            }
            if (chosen) break;
          }
          if (!chosen) {reject(reason); continue;}
          if (completeness !== 'complete') {reject('CORE_SUITE_CURRENT_INCOMPLETE'); continue;}
          upgrades.push({coreVersion, registry, manifestDigest: digest(candidate), targets: chosen.map((row, i) => ({id: installed[i]!.id, moduleName: row.name, version: row.version, repository: i === 0 ? candidate.core.repository : candidate.components[i - 1]!.repository, metadataDigest: digest(row)}))});
        }
      } catch (error) {blocked.push({code: error instanceof CoreError ? error.code : 'CORE_SUITE_METADATA_INVALID'});}
    }
    const clientPeerFacts = this.options.clientPeerFacts?.();
    if (clientPeerFacts && (clientPeerFacts.status !== 'known' || clientPeerFacts.contextId !== clientAtStart?.contextId)) {
      completeness = 'unknown'; upgrades.length = 0;
      peerFacts['react'] = 'unknown';
      blocked.push({code: clientPeerFacts.contextId !== clientAtStart?.contextId ? 'CORE_SUITE_CLIENT_PEER_CHANGED' : clientPeerFacts.reason!});
    }
    const facts = {schemaVersion: 1 as const, installCommand: SUITE_INSTALL_COMMAND, manifest, nodeVersion, registry, completeness, installed, upgrades, blocked, peerFacts, metadataDigests, ...(clientPeerFacts ? {clientPeerFacts} : {})};
    return frozen({...facts, checkedAt: new Date().toISOString(), declarationId: digest(facts)});
  }
  private validRecord(record: PackageMetadata, name: string, version: string, repository: string): boolean {
    return !!record && record.name === name && record.version === version && repositoryIdentity(record.repository) === repositoryIdentity(repository);
  }
  private validManifest(value: SuiteManifest, record: PackageMetadata, version: string): boolean {
    const expected = this.options.manifest;
    return value.schemaVersion === 1 && value.id === expected.id && value.core?.name === expected.core.name && value.core.version === version && record.version === version && typeof value.core.repository === 'string' && repositoryIdentity(value.core.repository) === repositoryIdentity(expected.core.repository) && Array.isArray(value.components) && value.components.length === 2 && value.components.every((row, i) => !!row && typeof row === 'object' && row.id === expected.components[i]!.id && isPackageName(row.moduleName) && row.moduleName === expected.components[i]!.moduleName && typeof row.versionRange === 'string' && !!row.versionRange.trim() && !!semver.validRange(row.versionRange) && typeof row.repository === 'string' && repositoryIdentity(row.repository) === repositoryIdentity(expected.components[i]!.repository));
  }
}

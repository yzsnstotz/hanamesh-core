import {bundleFailure, compatibilityIssues} from './compatibility.js';
import {assessLegacyInstallationWithManifest} from './legacy.js';
import {formatSuiteInstallCommand, createSuiteInstallRelease, suiteInstallArgs} from './install-command.js';
import semver from 'semver';
import {evaluate} from '../health/evaluate.js';
import type {ComponentObservation} from '../health/types.js';
import {CoreError} from '../errors.js';
import {digest, frozen, repositoryIdentity, isPackageName, registryUrl} from './facts.js';
import type {PackageMetadata, SuiteBlocked, SuiteDeclaration, SuiteDeclarationRequest, SuiteManifest, SuiteServiceOptions, SuiteUpgrade} from './types.js';

/** A fixed distribution asset is not an authoritative business member or archive-source member.
 * Retain the three-member identity checks and reject all other dependency additions. */
function distributionDependencies(dependencies: Readonly<Record<string, string>> | undefined, members: readonly string[]): boolean {
  if (!dependencies) return false;
  const theme = Object.hasOwn(dependencies, '@hanamesh/theme');
  if (theme && (typeof dependencies['@hanamesh/theme'] !== 'string' || !semver.validRange(dependencies['@hanamesh/theme']))) return false;
  return Object.keys(dependencies).length === members.length + (theme ? 1 : 0) && members.every(name => Object.hasOwn(dependencies, name));
}
export const DEFAULT_SUITE_REGISTRY = 'https://registry.npmjs.org/';
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
    let physicalBundle: PackageMetadata | null = null;
    let bundleReadFailed = false;
    try {physicalBundle = await this.options.bundleInventory();} catch { bundleReadFailed = true; /* unreadable is not authoritative absence */ }
    const bundleVersion = physicalBundle && semver.valid(physicalBundle.version) ? physicalBundle.version : null;
    if (!physicalBundle || !bundleVersion || !this.validRecord(physicalBundle, manifest.bundle.name, bundleVersion, manifest.bundle.repository) || !distributionDependencies(physicalBundle.dependencies, installed.map(row => row.moduleName)) || installed.some(row => !row.actualVersion || !semver.satisfies(row.actualVersion, physicalBundle.dependencies?.[row.moduleName] ?? ''))) {
      if (completeness === 'complete') completeness = 'unknown';
      blocked.push({code: 'CORE_SUITE_INSTALLED_METADATA_MISMATCH', moduleName: manifest.bundle.name});
    }
    if (physicalBundle) metadataDigests[`installed:${physicalBundle.name}`] = digest(physicalBundle);
    // External peer facts are read from the current Core/Loader resolution context once per declaration.
    const peer = async (name: string): Promise<string | null> => {
      if (!Object.hasOwn(peerFacts, name)) {
        try {const version = name === 'react' && clientAtStart ? clientAtStart.reactVersion ?? {status: 'unknown'} : await this.options.peerVersion(name); peerFacts[name] = version === null ? null : typeof version === 'string' && semver.valid(version) ? version : 'unknown';} catch {peerFacts[name] = 'unknown';}
      }
      return peerFacts[name] ?? null;
    };
    const compatible = async (tuple: readonly PackageMetadata[]): Promise<string | null> =>
      (await compatibilityIssues(tuple, nodeVersion, peer))[0]?.code ?? null;
    const currentRecords = [physicalCore.metadata, ...observations.map(row => row.metadata)];
    for (const record of currentRecords) if (record) metadataDigests[`installed:${record.name}`] = digest(record);
    if (currentRecords.some(row => !row)) {
      if (completeness === 'complete') completeness = 'unknown';
      blocked.push({code: 'CORE_SUITE_INSTALLED_METADATA_UNKNOWN'});
    } else if (currentRecords.some((row, i) => !this.validRecord(row!, installed[i]!.moduleName, installed[i]!.actualVersion ?? '', installed[i]!.repository))) {
      blocked.push({code: 'CORE_SUITE_INSTALLED_METADATA_MISMATCH'}); if (completeness === 'complete') completeness = 'unknown';
    } else {
      const reason = await compatible([...(physicalBundle ? [physicalBundle] : []), ...currentRecords as PackageMetadata[]]);
      if (reason) {blocked.push({code: reason}); if (completeness === 'complete') completeness = reason === 'CORE_SUITE_PEER_UNKNOWN' ? 'unknown' : 'incomplete';}
    }
    let registry: string | null = null;
    let installCommand: string | null = null;
    if (request === undefined) blocked.push({code: 'CORE_SUITE_SOURCE_MISSING'});
    else {
      try {
        if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).some(key => !['registry', 'bundleVersion', 'profile'].includes(key))) throw new CoreError('CORE_SUITE_REQUEST_INVALID', 400);
        const installOptions = request.profile === undefined ? {} : {profile: request.profile};
        suiteInstallArgs('0.0.0', installOptions);
        if (request.registry !== undefined && typeof request.registry !== 'string') throw new CoreError('CORE_SUITE_SOURCE_UNSUPPORTED', 400);
        registry = this.options.registry.normalize ? this.options.registry.normalize(request.registry ?? DEFAULT_SUITE_REGISTRY) : registryUrl(request.registry ?? DEFAULT_SUITE_REGISTRY);
        if (request.bundleVersion !== undefined && !semver.valid(request.bundleVersion)) throw new CoreError('CORE_SUITE_CANDIDATE_INVALID', 400);
        const names = [manifest.bundle.name, core.name, ...manifest.components.map(row => row.moduleName)];
        const catalogs = new Map<string, Readonly<Record<string, PackageMetadata>>>();
        for (const name of names) {
          const data = await this.options.registry.read(registry, name);
          if (data.registry !== registry || data.name !== name) throw new CoreError('CORE_SUITE_SOURCE_MISMATCH', 502);
          if (name === manifest.bundle.name) {
            const release=core.hanameshSuiteInstall;
            if (release && release.name===name && typeof release.version==='string' && semver.valid(release.version)===release.version && release.command===formatSuiteInstallCommand(release.version)) {
              const pinned=data.versions[release.version];
              if (pinned) {
                if (!this.validRecord(pinned,name,release.version,manifest.bundle.repository)) throw new CoreError('CORE_SUITE_SOURCE_MISMATCH',502);
                installCommand=release.command;
              }
            }
            if (!installCommand) blocked.push({code:'CORE_SUITE_CANDIDATE_UNAVAILABLE',moduleName:name});
          }
          catalogs.set(name, data.versions); metadataDigests[`registry:${name}`] = digest(data.versions);
        }
        const versions = Object.keys(catalogs.get(manifest.bundle.name)!).filter(version => semver.valid(version) && bundleVersion && (request.bundleVersion ? version === request.bundleVersion && version !== bundleVersion : semver.gt(version, bundleVersion))).sort(semver.rcompare);
        if (!versions.length) blocked.push({code: 'CORE_SUITE_CANDIDATE_UNAVAILABLE', ...(request.bundleVersion ? {bundleVersion: request.bundleVersion} : {})});
        for (const version of versions) {
          const bundle = catalogs.get(manifest.bundle.name)![version]!;
          const reject = (code: string): void => {blocked.push({code, bundleVersion: version});};
          if (!this.validRecord(bundle, manifest.bundle.name, version, manifest.bundle.repository)) {reject('CORE_SUITE_SOURCE_MISMATCH'); continue;}
          const bundleReason = bundleFailure(bundle);
          if (bundleReason) {reject(bundleReason); continue;}
          const dependencies = bundle.dependencies;
          const memberNames = names.slice(1);
          if (!dependencies || !distributionDependencies(dependencies, memberNames) || memberNames.some(name => typeof dependencies[name] !== 'string' || !semver.validRange(dependencies[name]))) {reject('CORE_SUITE_MANIFEST_MISMATCH'); continue;}
          const chosenVersions = memberNames.map(name => semver.maxSatisfying(Object.keys(catalogs.get(name)!), dependencies[name]!));
          const chosen = memberNames.map((name, i) => chosenVersions[i] ? catalogs.get(name)![chosenVersions[i]!] : undefined);
          const record = chosen[0], candidate = record?.hanameshSuite;
          if (!candidate) {reject('CORE_SUITE_MANIFEST_MISSING'); continue;}
          if (!record || !this.validManifest(candidate, record, record.version)) {reject('CORE_SUITE_MANIFEST_MISMATCH'); continue;}
          if (chosen.some((row, i) => !row || !this.validRecord(row, installed[i]!.moduleName, chosenVersions[i]!, installed[i]!.repository))) {reject('CORE_SUITE_SOURCE_MISMATCH'); continue;}
          const tuple = chosen as PackageMetadata[];
          if (tuple.some((row, i) => !installed[i]!.actualVersion || !request.bundleVersion && semver.lt(row.version, installed[i]!.actualVersion!) || i > 0 && !semver.satisfies(row.version, candidate.components[i - 1]!.versionRange))) {reject('CORE_SUITE_NO_COMPATIBLE_TUPLE'); continue;}
          const reason = await compatible([bundle, ...tuple]);
          if (reason) {reject(reason); continue;}
          if (completeness !== 'complete') {reject('CORE_SUITE_CURRENT_INCOMPLETE'); continue;}
          upgrades.push({registry, installation: createSuiteInstallRelease(version, {...installOptions, registry}), bundle: {id: 'bundle', moduleName: bundle.name, version, repository: manifest.bundle.repository, metadataDigest: digest(bundle)}, targets: tuple.map((row, i) => ({id: installed[i]!.id, moduleName: row.name, version: row.version, repository: installed[i]!.repository, metadataDigest: digest(row)}))});
        }
      } catch (error) {blocked.push({code: error instanceof CoreError ? error.code : 'CORE_SUITE_METADATA_INVALID'});}
    }
    let legacy = physicalBundle === null && !bundleReadFailed ? await assessLegacyInstallationWithManifest({nodeVersion,
      components: await Promise.all([physicalCore, ...profile.components.map((_, i) => observations[i] ?? {kind: 'unreadable' as const})].map(async (observation, i) => {
        const peers: Record<string, string | null | 'unknown'> = {};
        for (const name of Object.keys(observation.metadata?.peerDependencies ?? {})) if (isPackageName(name)) peers[name] = await peer(name);
        return {moduleName: installed[i]!.moduleName, observation, peers, ...(i === 0 ? {runningVersion: manifest.core.version} : {})};
      }))}, manifest, core.hanameshSuiteInstall?.command ?? null) : undefined;
    const clientPeerFacts = this.options.clientPeerFacts?.();
    if (clientPeerFacts && (clientPeerFacts.status !== 'known' || clientPeerFacts.contextId !== clientAtStart?.contextId)) {
      completeness = 'unknown'; upgrades.length = 0;
      peerFacts['react'] = 'unknown';
      blocked.push({code: clientPeerFacts.contextId !== clientAtStart?.contextId ? 'CORE_SUITE_CLIENT_PEER_CHANGED' : clientPeerFacts.reason!});
    }
    if (legacy && clientPeerFacts && (clientPeerFacts.status !== 'known' || clientPeerFacts.contextId !== clientAtStart?.contextId)) {
      legacy = {...legacy, status: 'unknown', reason: {code:'CORE_LEGACY_COMPONENTS_UNKNOWN', message:'当前客户端的依赖观察尚未确认或已变化，请重新检测。', action:legacy.reason?.action ?? '重新检测。'}};
    }
    const facts = {...(legacy ? {legacy} : {}), schemaVersion: 1 as const, bundleVersion, installCommand, manifest, nodeVersion, registry, completeness, installed, upgrades, blocked, peerFacts, metadataDigests, ...(clientPeerFacts ? {clientPeerFacts} : {})};
    return frozen({...facts, checkedAt: new Date().toISOString(), declarationId: digest(facts)});
  }
  private validRecord(record: PackageMetadata, name: string, version: string, repository: string): boolean {
    return !!record && record.name === name && record.version === version && repositoryIdentity(record.repository) === repositoryIdentity(repository);
  }
  private validManifest(value: SuiteManifest, record: PackageMetadata, version: string): boolean {
    const expected = this.options.manifest;
    return value.schemaVersion === 1 && value.id === expected.id && value.bundle?.name === expected.bundle.name && typeof value.bundle.repository === 'string' && repositoryIdentity(value.bundle.repository) === repositoryIdentity(expected.bundle.repository) && value.core?.name === expected.core.name && value.core.version === version && record.version === version && typeof value.core.repository === 'string' && repositoryIdentity(value.core.repository) === repositoryIdentity(expected.core.repository) && Array.isArray(value.components) && value.components.length === 2 && value.components.every((row, i) => !!row && typeof row === 'object' && row.id === expected.components[i]!.id && isPackageName(row.moduleName) && row.moduleName === expected.components[i]!.moduleName && typeof row.versionRange === 'string' && !!row.versionRange.trim() && !!semver.validRange(row.versionRange) && typeof row.repository === 'string' && repositoryIdentity(row.repository) === repositoryIdentity(expected.components[i]!.repository));
  }
}

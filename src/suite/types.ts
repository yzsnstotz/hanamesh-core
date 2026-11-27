import type {ComponentObservation, SuiteProfile} from '../health/types.js';

export interface SuiteManifest {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly bundle: {readonly name: string; readonly repository: string};
  readonly core: {readonly name: string; readonly version: string; readonly repository: string};
  readonly components: readonly {readonly id: string; readonly moduleName: string; readonly versionRange: string; readonly repository: string}[];
}
export interface SuiteInstallRelease {readonly name:string;readonly version:string;readonly command:string;readonly args:readonly string[]}
export interface PackageMetadata {
  readonly name: string;
  readonly version: string;
  readonly repository?: string | {readonly url?: string};
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly engines?: {readonly node?: string; readonly dsh?: string};
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly peerDependenciesMeta?: Readonly<Record<string, {readonly optional?: boolean}>>;
  readonly dsh?: {readonly bundle?: {readonly patch?: string}};
  readonly hanameshSuite?: SuiteManifest;
}
export interface RegistryMetadata {
  readonly registry: string;
  readonly name: string;
  readonly versions: Readonly<Record<string, PackageMetadata>>;
}
export interface SuiteDeclarationRequest {readonly registry?: string; readonly bundleVersion?: string; readonly profile?: string}
export interface SuiteBlocked {readonly code: string; readonly bundleVersion?: string; readonly moduleName?: string}
export interface SuiteTarget {readonly id: string; readonly moduleName: string; readonly version: string; readonly repository: string; readonly metadataDigest: string}
export interface SuiteUpgrade {
  readonly installation: SuiteInstallRelease;
  readonly bundle: SuiteTarget;
  readonly registry: string;
  readonly targets: readonly SuiteTarget[];
}
export interface SuiteInstalled {
  readonly id: string;
  readonly moduleName: string;
  readonly requiredRange: string;
  readonly repository: string;
  readonly actualVersion: string | null;
  readonly actualRepository: string | null;
  readonly status: string;
  readonly runningVersion?: string;
}
export interface SuiteDeclaration {
  readonly legacy?: LegacyInstallationAssessment;
  readonly bundleVersion: string | null;
  readonly installCommand: string | null;
  readonly schemaVersion: 1;
  readonly checkedAt: string;
  /** SHA256 of all returned facts except checkedAt; this is a comparison token, not execution authorization. */
  readonly declarationId: string;
  readonly manifest: SuiteManifest;
  readonly nodeVersion: string;
  readonly registry: string | null;
  readonly completeness: 'complete' | 'incomplete' | 'unknown';
  readonly installed: readonly SuiteInstalled[];
  readonly upgrades: readonly SuiteUpgrade[];
  readonly blocked: readonly SuiteBlocked[];
  /** Summary of observed external peers. Different installed versions of the same peer yield "unknown". */
  readonly peerFacts: Readonly<Record<string, string | null | 'unknown'>>;
  readonly metadataDigests: Readonly<Record<string, string>>;
  readonly clientPeerFacts?: import('./client-peers.js').ClientPeerFacts;
}
export interface SuiteObservation extends ComponentObservation {
  /** Internal resolver parent for the configured Loader entry. */
  readonly entryURL?: string;
}
export interface SuiteServiceOptions {
  readonly profile: SuiteProfile;
  readonly core: PackageMetadata;
  readonly manifest: SuiteManifest;
  readonly inventory: {observe(requirements: SuiteProfile['components']): Promise<readonly SuiteObservation[]>};
  readonly bundleInventory: () => Promise<PackageMetadata | null>;
  readonly coreInventory: () => Promise<SuiteObservation>;
  readonly registry: {normalize?(registry: string): string; read(registry: string, name: string): Promise<RegistryMetadata>};
  readonly nodeVersion: string;
  /** An absent parent is the candidate/bundle context; null is an unresolved installed entry. */
  readonly peerVersion: (name: string, parentURL?: string | null) => Promise<string | null | {readonly status: 'unknown'}>;
  readonly clientPeerFacts?: () => import('./client-peers.js').ClientPeerFacts;
}

/** Caller-collected public package facts. No paths, credentials, installation or loading occurs. */
export interface LegacyInstallationFacts {
  readonly scope?: 'profile';
  readonly nodeVersion: string;
  readonly components: readonly {readonly moduleName: string; readonly runningVersion?: string; readonly observation: import('../health/types.js').ComponentObservation; readonly peers: Readonly<Record<string, string | null | 'unknown'>>}[];
}
export interface LegacyInstallationAssessment {
  readonly status: 'installed' | 'incomplete' | 'not-installed' | 'unknown';
  readonly components: readonly {readonly name: string; readonly version: string | null; readonly active?: boolean; readonly status: string}[];
  readonly issues: readonly {readonly code: string; readonly moduleName: string; readonly message: string}[];
  readonly reason: {readonly code: string; readonly message: string; readonly action: string} | null;
}

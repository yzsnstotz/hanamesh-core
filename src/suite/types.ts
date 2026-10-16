import type {ObservationSource, SuiteProfile} from '../health/types.js';

export interface SuiteManifest {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly core: {readonly name: string; readonly version: string; readonly repository: string};
  readonly components: readonly {readonly id: string; readonly moduleName: string; readonly versionRange: string; readonly repository: string}[];
}
export interface PackageMetadata {
  readonly name: string;
  readonly version: string;
  readonly repository?: string | {readonly url?: string};
  readonly engines?: {readonly node?: string};
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
export interface SuiteDeclarationRequest {readonly registry: string; readonly coreVersion?: string}
export interface SuiteBlocked {readonly code: string; readonly coreVersion?: string; readonly moduleName?: string}
export interface SuiteTarget {readonly id: string; readonly moduleName: string; readonly version: string; readonly repository: string; readonly metadataDigest: string}
export interface SuiteUpgrade {
  readonly coreVersion: string;
  readonly registry: string;
  readonly manifestDigest: string;
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
  /** External peers visible to the current Core/Loader resolution context, not a future installation tree. */
  readonly peerFacts: Readonly<Record<string, string | null | 'unknown'>>;
  readonly metadataDigests: Readonly<Record<string, string>>;
}
export interface SuiteServiceOptions {
  readonly profile: SuiteProfile;
  readonly core: PackageMetadata;
  readonly manifest: SuiteManifest;
  readonly inventory: ObservationSource;
  readonly coreInventory: () => Promise<import('../health/types.js').ComponentObservation>;
  readonly registry: {normalize?(registry: string): string; read(registry: string, name: string): Promise<RegistryMetadata>};
  readonly nodeVersion: string;
  readonly peerVersion: (name: string) => Promise<string | null | {readonly status: 'unknown'}>;
}

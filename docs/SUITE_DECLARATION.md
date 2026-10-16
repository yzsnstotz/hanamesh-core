# Core suite declaration — C-CORE delivery draft

Core 0.3.12 implements I-SUITE-COMPAT-BOUNDARY as an optional protocol `'1'` extension. This describes the actual public port; AppHost's internal `coreSuitePlan` is not this DTO. No AppHost adapter is delivered here.

## Public port and facts

`hanamesh-core/suite` exports read-only `SUITE_MANIFEST` and DTO types. Each Core version's full npm metadata carries the same `hanameshSuite` field. Build generates both from that release's own profile and package metadata; `verify:inputs` rejects drift. Component identities/repositories/ranges come from the owned profile; Core's name/version/repository/Node/peers come from its package metadata. There is no second maintained range list.

Consumers check the optional Cordis method on `hanameshCore`. They do not import Core runtime implementations or read its profile:

```ts
getSuiteDeclaration?(request?: {
  registry: string;
  coreVersion?: string;
}): Promise<SuiteDeclaration>
```

No request returns current facts plus `CORE_SUITE_SOURCE_MISSING` for candidate lookup, with zero network. The getter does not install, create identity, change configuration, recheck/persist health, or write storage domains. There is no new HTTP route. Disposed providers reject `CORE_DISPOSED` (503); expected input/availability failures otherwise become named `blocked` rows.

The declaration contains `schemaVersion`, `checkedAt`, stable `declarationId`, `manifest`, actual `nodeVersion`, canonical `registry | null`, `completeness`, `installed`, `upgrades`, `blocked`, `peerFacts`, and `metadataDigests`. Full fields are in the public TypeScript and JSON Schema exports. Installed rows identify public role `id`/`moduleName`, required range/repository, physical version/repository and status. Core also reports cached `runningVersion`: a physical/running mismatch, ambiguity or unreadability prevents complete status. Notice components missing from otherwise normal health are still incomplete. Unknown source/metadata facts never become complete.

Each upgrade row has `coreVersion`, `registry`, that Core's `manifestDigest`, and an exact three-package `targets` array of `{id,moduleName,version,repository,metadataDigest}`. Every target is non-downgrade and at least one semantic version strictly increases; build metadata alone is not an upgrade. These are compatible candidates, not installation authorization.

## Candidate source and compatibility

Each candidate Core must carry its own `hanameshSuite` manifest bound to that record's exact name/version and the canonical Core repository. The two component identities/roles/sources must match the published suite identities; that candidate's ranges may differ. Unknown additional required components, missing manifests and version/source mismatches block the candidate. Current ranges are never applied to a future Core without its manifest; `latest` is not consulted.

Core searches the finite metadata set for one complete jointly compatible tuple per Core version, preferring retained installed dependencies, then descending SemVer in manifest order. It continues past all-unchanged tuples to find dependency upgrades even when Core itself is unchanged. Incomplete current installations still return their facts and candidate blocked reasons, but no upgrade-ready tuples. Repair is outside this port.

All three current/target package records must declare the supported public DSH metadata shape `dsh.bundle = {patch: './relative/package/path.yml'}`. Missing declarations produce `CORE_SUITE_BUNDLE_MISSING`; malformed or unknown bundle shapes produce `CORE_SUITE_BUNDLE_INVALID`. Patch paths must be relative within the package; this port does not fetch or read an uninstalled patch file and does not prove native loading. This preserves the existing C-MARKET bundle admission rule in Core.

Node/peer judgment uses existing `semver` and real `process.versions.node`. Three-package peer constraints use the proposed tuple, including reverse peers. Other peer versions come from public installed package metadata visible from current Loader entries or Core resolution, never devDependencies presented as installed facts. Optional absent peers may be absent; installed incompatible or unreadable/unknown peers block. Peer names must be npm package names before local resolution; filesystem paths and arbitrary subpaths are rejected. This does not pre-validate a future pnpm tree.

## Read-only registry adapter

Core GETs full metadata with `Accept: application/json`; abbreviated metadata may omit the custom manifest. The source registry, response URL/name and selected version/repository are bound. Redirects are rejected. Production registries use HTTPS, no userinfo/query/fragment, and a trailing slash (optional registry path prefix). Unsafe URLs are rejected before assigning the public registry field, so credential-bearing requests are not echoed.

The adapter uses existing public `timeoutMs`/`maxResponseBytes` and defaults in `CORE_DEFAULTS`. Timeout/overflow are explicit failures; there is no hidden candidate cap or silent truncation. `PluginConfig.suiteLocalTestRegistries` is an explicit exact allowlist of loopback HTTP base URLs for isolated test profiles, default `[]`; e.g. `['http://127.0.0.1:25123/registry/']`. Remote HTTP, userinfo/query/fragment remain rejected. The caller must pass that exact registry and cannot enable local access through the request itself. No actual user profile is changed by this feature or tests.

Metadata digests hash canonical public metadata, including published integrity/tarball facts when present. They are not tarball signatures or independent byte attestations.

## Errors and I adaptation

Blocked codes: `CORE_SUITE_BUNDLE_MISSING`, `CORE_SUITE_BUNDLE_INVALID`, `CORE_SUITE_SOURCE_MISSING`, `CORE_SUITE_SOURCE_UNSUPPORTED`, `CORE_SUITE_SOURCE_MISMATCH`, `CORE_SUITE_METADATA_UNAVAILABLE`, `CORE_SUITE_METADATA_TIMEOUT`, `CORE_SUITE_METADATA_LIMIT`, `CORE_SUITE_METADATA_INVALID`, `CORE_SUITE_REQUEST_INVALID`, `CORE_SUITE_CANDIDATE_INVALID`, `CORE_SUITE_CANDIDATE_UNAVAILABLE`, `CORE_SUITE_MANIFEST_MISSING`, `CORE_SUITE_MANIFEST_MISMATCH`, `CORE_SUITE_INSTALLED_SOURCE_UNKNOWN`, `CORE_SUITE_INSTALLED_METADATA_UNKNOWN`, `CORE_SUITE_INSTALLED_METADATA_MISMATCH`, `CORE_SUITE_RUNNING_PHYSICAL_MISMATCH`, `CORE_SUITE_NODE_INCOMPATIBLE`, `CORE_SUITE_PEER_UNKNOWN`, `CORE_SUITE_PEER_INCOMPATIBLE`, `CORE_SUITE_NO_COMPATIBLE_TUPLE`, `CORE_SUITE_CURRENT_INCOMPLETE`. Candidate-specific rows include `coreVersion`; source/installed rows may identify `moduleName`.

I supplies its actual execution registry, displays Core's exact tuple/reasons, and rereads before confirmation. Compare `declarationId`, registry and selected tuple. The digest covers manifest, Node, physical versions/sources, visible peers, registry metadata and targets; timestamps/counters are excluded, so equal facts give equal digests. Execute exact selected versions using the same registry, perform strict installation and read physical packages back afterwards. AppHost must not recreate ranges/Node/peer rules or choose `npm latest`.

Source, fixture, full-metadata loopback and packed-consumer checks are not native DSH runtime or owner acceptance. Local registry fixtures do not assert that current Core versions exist on public npm. Native I adaptation/physical execution and owner gates remain separate.

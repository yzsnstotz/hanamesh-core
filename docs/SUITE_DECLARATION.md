# Core suite declaration — C-CORE delivery draft

Core 0.3.16 implements I-SUITE-COMPAT-BOUNDARY as an optional protocol `'1'` extension. This describes the actual public port; AppHost's internal `coreSuitePlan` is not this DTO. No AppHost adapter is delivered here.

## Public port and facts

`hanamesh-core/suite` exports read-only `SUITE_MANIFEST` and DTO types. Each Core version's full npm metadata carries the same `hanameshSuite` field. Build generates both from that release's own profile and package metadata; `verify:inputs` rejects drift. Component identities/repositories/ranges come from the owned profile; Core's name/version/repository/Node/peers come from its package metadata. There is no second maintained range list.

Consumers check the optional Cordis method on `hanameshCore`. They do not import Core runtime implementations or read its profile:

```ts
getSuiteDeclaration?(request?: {
  registry: string;
  coreVersion?: string;
}): Promise<SuiteDeclaration>
```

No request returns current facts plus `CORE_SUITE_SOURCE_MISSING` for candidate lookup, with zero network. The getter does not install, create identity, change configuration, recheck/persist health, or write storage domains. The client-only lease POST route below is separate from this read-only getter. Disposed providers reject `CORE_DISPOSED` (503); expected input/availability failures otherwise become named `blocked` rows.

The declaration contains `schemaVersion`, `checkedAt`, stable `declarationId`, `manifest`, actual `nodeVersion`, canonical `registry | null`, `completeness`, `installed`, `upgrades`, `blocked`, `peerFacts`, and `metadataDigests`. Full fields are in the public TypeScript and JSON Schema exports. Installed rows identify public role `id`/`moduleName`, required range/repository, physical version/repository and status. Core also reports cached `runningVersion`: a physical/running mismatch, ambiguity or unreadability prevents complete status. Notice components missing from otherwise normal health are still incomplete. Unknown source/metadata facts never become complete.

Each upgrade row has `coreVersion`, `registry`, that Core's `manifestDigest`, and an exact three-package `targets` array of `{id,moduleName,version,repository,metadataDigest}`. Every target is non-downgrade and at least one semantic version strictly increases; build metadata alone is not an upgrade. These are compatible candidates, not installation authorization.

## Candidate source and compatibility

Each candidate Core must carry its own `hanameshSuite` manifest bound to that record's exact name/version and the canonical Core repository. The two component identities/roles/sources must match the published suite identities; that candidate's ranges may differ. Unknown additional required components, missing manifests and version/source mismatches block the candidate. Current ranges are never applied to a future Core without its manifest; `latest` is not consulted.

Core searches the finite metadata set for one complete jointly compatible tuple per Core version, preferring retained installed dependencies, then descending SemVer in manifest order. It continues past all-unchanged tuples to find dependency upgrades even when Core itself is unchanged. Incomplete current installations still return their facts and candidate blocked reasons, but no upgrade-ready tuples. Repair is outside this port.

All three current/target package records must declare the supported public DSH metadata shape `dsh.bundle = {patch: './relative/package/path.yml'}`. Missing declarations produce `CORE_SUITE_BUNDLE_MISSING`; malformed or unknown bundle shapes produce `CORE_SUITE_BUNDLE_INVALID`. Patch paths must be relative within the package; this port does not fetch or read an uninstalled patch file and does not prove native loading. This preserves the existing C-MARKET bundle admission rule in Core.

Node/peer judgment uses existing `semver` and real `process.versions.node`. Three-package peer constraints use the proposed tuple, including reverse peers. Renderer React comes only from the currently active Core browser client lease, using its actual host-external React.version. Other peer versions come from public installed package metadata visible from current Loader entries or Core resolution, never devDependencies presented as installed facts. Optional absent peers may be absent; installed incompatible or unreadable/unknown peers block. Peer names must be npm package names before local resolution; filesystem paths and arbitrary subpaths are rejected. This does not pre-validate a future pnpm tree.

## Read-only registry adapter

Core GETs full metadata with `Accept: application/json`; abbreviated metadata may omit the custom manifest. The source registry, response URL/name and selected version/repository are bound. Redirects are rejected. Production registries use HTTPS, no userinfo/query/fragment, and a trailing slash (optional registry path prefix). Unsafe URLs are rejected before assigning the public registry field, so credential-bearing requests are not echoed.

The adapter uses existing public `timeoutMs`/`maxResponseBytes` and defaults in `CORE_DEFAULTS`. Timeout/overflow are explicit failures; there is no hidden candidate cap or silent truncation. `PluginConfig.suiteLocalTestRegistries` is an explicit exact allowlist of loopback HTTP base URLs for isolated test profiles, default `[]`; e.g. `['http://127.0.0.1:25123/registry/']`. Remote HTTP, userinfo/query/fragment remain rejected. The caller must pass that exact registry and cannot enable local access through the request itself. No actual user profile is changed by this feature or tests.

Normal compositions can instead explicitly allow `PluginConfig.suitePackageRegistries` (default `[]`): exact owned `http://127.0.0.1:<port>/` source URLs. This is separate from test registries; a getter request cannot grant it. The official installer uses the very same source URL.

### Live renderer provenance

Optional `clientPeerFacts` is `{source:'core-client-lease',status:'known'|'unknown',reason:string|null,reactVersion:string|null,contextId:string}`. `contextId` is an opaque process-local lease-set token, not a Host epoch or execution authorization. Each actual Core client uses public Connection generation getSnapshot/subscribe and holds one authenticated same-origin POST Fetch at `/api/hanamesh/core/client-peer-lease` with an AbortSignal. It uses existing Core write admission, same-carrier Origin, JSON/content-type and 4096-byte limits. Payload is exactly `{protocol:1,pageId,activationId,generation,reactVersion}`; page/activation IDs are opaque 16–64-character strings, generation is a positive page-local integer, version is valid SemVer. Host registers only that exact buffered Fetch route; it never takes the Gateway-owned `/api` RPC interceptor. It admits no already-aborted/invalid call. No identity, Host home, credentials, persistence or telemetry is carried. This promises observed request cancellation, not instantaneous discovery of arbitrary silent network partitions.

A generation loss/replacement, pagehide or Core effect disposal aborts the invocation. pageshow after pagehide creates a fresh activation even when BFCache retains the same generation. Repeated generation notifications and failed/completed invocations do not cause retries; only a real new activation does. Backend request.signal abortion and every Core disposal path withdraw their own lease. Equal live React observations can agree; conflicting versions return `CORE_SUITE_CLIENT_PEER_CONFLICT`. No live page gives `CORE_SUITE_CLIENT_PEER_NOT_CONNECTED`, including an older client without the optional generation ports (it sends no lease). `CORE_SUITE_CLIENT_PEER_CAPABILITY_UNAVAILABLE` is reserved for an unavailable Host lease capability; normal Host composition already requires fetch.register. Existing older-peer identity/consent/health continue functioning.

This is an authenticated current Core client observation, not cryptographic renderer attestation or a Node React dependency. Core never substitutes backend React. Reads capture the lease context before all asynchronous work and compare it before returning: any change gives unknown React, `CORE_SUITE_CLIENT_PEER_CHANGED`, unknown completeness and no upgrades. Within one unchanged lease set the declaration digest remains stable; a replacement changes it even if the version is equal. An authenticated operator can report observations; this is not an independent hostile-operator security proof.

### Normal archive source before npm publication

`hanamesh-core/suite/source` exports `createSuitePackageSource(options): Promise<{registry:string,close():Promise<void>}>` and its TypeScript options. The caller supplies `archives:[{path,integrity}]` with exact SHA512 SRI, `port` (0 allocates an owned random port), HTTPS `peerRegistry`, and required positive integer `maxArchiveBytes`, `maxExpandedBytes`, `maxEntries`, `maxManifestBytes`, `maxResponseBytes`, `timeoutMs`. There are no hidden budgets or production-address defaults. `timeoutMs` must fit a JavaScript timer. This is a Node composition facility, not a new required Cordis method.

Before listening, the source snapshots verified compressed bytes, enforces bounded decompression/entry count/manifest size, and parses tar with `tar@7.5.22` (BlueOak-1.0.0), without extracting or executing any package. It requires exactly one regular `package/package.json`; links, duplicate/malformed manifests, truncated archives, SRI mismatches, wrong canonical identities/repositories, duplicate name/version or missing suite members are named errors. The source accepts full normal package metadata and never invents bundle declarations or suite manifests. Its only three own package identities come from `SUITE_MANIFEST`; all candidate selection stays in `getSuiteDeclaration`.

Own full npm packuments expose an empty `dist-tags` object (no invented `latest`) and preserve package custom fields and carry `dist.integrity` plus tarball URLs bound to that immutable snapshot. Later disk changes cannot alter served bytes. Other valid npm names delegate once to the explicitly selected HTTPS peer registry; redirects, response-name mismatch, HTTP failures, timeout and byte overflow propagate by name/status. No upstream fallback for an absent own member, credentials, publish/write endpoints, arbitrary filesystem serving or arbitrary URL proxy. Listener binds only 127.0.0.1, checks exact Host, refuses Cookie/Authorization, and `close()` cancels pending peer reads and destroys owned sockets.

Composition: await source creation over the delivered normal tarballs; put returned `registry` into both Core `suitePackageRegistries:[registry]` and AppHost `library.registry`; retain the source for the whole preview/confirmation/CLI execution and close it with the composition. I continues its existing optional getter, declaration comparison, preview/confirmation and one exact-version strict CLI command. This does not publish any npm version or change public market services. An old Core without these ports must be replaced with this normal Core first; unknown legacy facts are not upgraded by bypassing their guard.

Metadata digests hash canonical public metadata, including published integrity/tarball facts when present. They are not tarball signatures or independent byte attestations.

## Errors and I adaptation

Blocked codes: `CORE_SUITE_BUNDLE_MISSING`, `CORE_SUITE_BUNDLE_INVALID`, `CORE_SUITE_SOURCE_MISSING`, `CORE_SUITE_SOURCE_UNSUPPORTED`, `CORE_SUITE_SOURCE_MISMATCH`, `CORE_SUITE_METADATA_UNAVAILABLE`, `CORE_SUITE_METADATA_TIMEOUT`, `CORE_SUITE_METADATA_LIMIT`, `CORE_SUITE_METADATA_INVALID`, `CORE_SUITE_REQUEST_INVALID`, `CORE_SUITE_CANDIDATE_INVALID`, `CORE_SUITE_CANDIDATE_UNAVAILABLE`, `CORE_SUITE_MANIFEST_MISSING`, `CORE_SUITE_MANIFEST_MISMATCH`, `CORE_SUITE_INSTALLED_SOURCE_UNKNOWN`, `CORE_SUITE_INSTALLED_METADATA_UNKNOWN`, `CORE_SUITE_INSTALLED_METADATA_MISMATCH`, `CORE_SUITE_RUNNING_PHYSICAL_MISMATCH`, `CORE_SUITE_NODE_INCOMPATIBLE`, `CORE_SUITE_PEER_UNKNOWN`, `CORE_SUITE_PEER_INCOMPATIBLE`, `CORE_SUITE_NO_COMPATIBLE_TUPLE`, `CORE_SUITE_CURRENT_INCOMPLETE`. Candidate-specific rows include `coreVersion`; source/installed rows may identify `moduleName`.

I supplies its actual execution registry, displays Core's exact tuple/reasons, and rereads before confirmation. Compare `declarationId`, registry and selected tuple. The digest covers manifest, Node, physical versions/sources, visible peers, registry metadata and targets; wall-clock timestamps are excluded; the live client observation context is included, so unchanged live facts give equal digests and any lease replacement invalidates confirmation. Execute exact selected versions using the same registry, perform strict installation and read physical packages back afterwards. AppHost must not recreate ranges/Node/peer rules or choose `npm latest`.

Source, fixture, full-metadata loopback and packed-consumer checks are not native DSH runtime or owner acceptance. Local registry fixtures do not assert that current Core versions exist on public npm. Native I adaptation/physical execution and owner gates remain separate.

0.3.14 declares Usage compatibility as >=0.2.0-rc.26 <0.3.0 || >=0.3.0-rc.1 <0.4.0, explicitly accepting the new0.3.0 prerelease tuple without globally including unrelated prereleases. Core does not consume UsageSettings; old clients remain compatible with their old backend. Usage0.3rc1 must accompany server-usage1.0.0 for four-field settings; source health metadata is not native install/upgrade acceptance.

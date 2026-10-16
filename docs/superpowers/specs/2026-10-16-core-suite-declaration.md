# Core suite declaration — approved bounded design

Authority: I-SUITE-COMPAT-BOUNDARY, C-CORE, I's CORE-SUITE-CONSUMER-HANDOFF, parent approved 2026-10-16. Core0.3.12, protocol1 optional Cordis getSuiteDeclaration; no new HTTP route.

Core's existing suite.profile.json is the only component range source; package.json is the only own version/Node/peer source. Build generates public ./suite data and hanameshSuite npm metadata field from both and verifies equality. Candidate Core metadata must carry its own manifest whose self name/version match the actual version record. Never apply current ranges to future Core without its manifest.

The getter observes existing Loader inventory without health persistence, returns current required/installed rows plus complete/incomplete/unknown separately from health.mode, actual Node, manifest digest and stable fact digest. No request returns current declaration plus SOURCE_MISSING. With explicit execution registry, Core itself makes bounded public package metadata GETs, rejects source/response/name/version mismatches, and evaluates finite known candidate records. HTTPS in production; exact loopback registry only in explicitly supplied test options. No credentials/install/automatic upgrade/health/device/config write.

For each non-downgrade Core candidate, filter Usage/AppHost versions by that Core manifest, actual Node engines, installed DSH peers and joint three-package peers using existing semver7.7.2 semantics. Search complete combinations; prefer retaining installed components, then descending semantic versions in manifest order. Every target is exact, non-downgrade, and at least one version increases. Missing/unknown metadata or incomplete current suite never yields upgrade ready. Future missing manifest is named blocked. No npm latest, future invented version list, signatures or permits.

I uses only optional Cordis structure, copies no ranges/Node/peer rules, binds its actual CLI registry to returned registry, rereads before confirmation and checks fact digest/physical versions, executes exact tuple then reads back. No adapter to I is implemented here; C-CORE draft documents real DTO/error semantics for I.

Verification: RED absent public export/metadata and absent optional service; focused boundary, metadata HTTP adapter, source drift, non-greedy peer combination, unknown/Node/non-downgrade/current-incomplete tests. Then strict build/types, main/contract/mutation/preflight/normal pack/strict actual tar consumer. Fixtures/loopback do not establish DSH or owner acceptance.

Existing C-MARKET DSH bundle admission is also owned here: current and target three-package metadata must declare the supported public relative patch bundle. Missing/malformed declarations are blocked without reading uninstalled package internals. Explicit suiteLocalTestRegistries defaults empty and supports only exact loopback HTTP test registries.

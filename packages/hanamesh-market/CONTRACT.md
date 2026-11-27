# Market boundary and public integration

## Data ownership

Market uses the configured website's `GET /hm/v1/host/catalog/query` for browsing, keyword search and explicit semantic search. This is the website's proxy to the Host query in API Contracts 0.31.0. Selectors include `q`, `categories`, `channel`, `source`, `official`, `domain` and `subdivision`, with a fixed `limit=50`. The official choice sends `official=true`. Literal source-ID reads keep `source` semantics. The local GET decodes only the explicit strings `true` and `false`, and the provider receives `official` only when true.

Host applies the existing Semantic admission to a Hybrid query and provides the ranked cards, discovery fields, facets and opaque continuation. Market uses the provider item order and match kind. It keeps browsing and search unlogged, as in the previous `telemetry:false` request. Numbered reads remain available for direct callers. The visible list continues with `nextCursor`; a provider reset replaces the accumulated list with the new first page.

The configured Host's `GET /v1/indexer/hanas/:hanaId` supplies the exact-ID detail and installation target. The returned alias can carry a canonical ID while preserving the requested record identity. A selected list card can carry the same-ID metrics from its query snapshot into the open detail.

Configured origins must be HTTPS, or loopback HTTP for isolated verification. Reads are bounded by bytes and time, omit credentials, refuse redirects and do not retry automatically. A source revision change invalidates in-flight results and confirmations. Client failures retain the accepted list and expose explicit retry; six skeleton cards precede the first response. Favorites are local preferences and never authoritative installed facts.

## Native DSH integration

`plugins.tab` receives the HanaMesh entry. The supplied `install` callback owns ordinary DSH bundle installations. The `openPackage` callback opens management for installed packages. Host preparation resolves an exact public installation target, validates the DSH bundle manifest and invokes the actual host compatibility evaluator and live exemption list. Confirmations are one-use, re-read the current target and source, and cannot authorize changed facts. When the exact bundle declares `hanamesh.app`, confirmation delegates once to `hanameshApps.installApplication` and waits for its result. AppHost owns profile writes, exact version and definition readback, runtime provisioning and compensation. Market displays the settled result and any required restart. When the AppHost installation service is absent at preparation and confirmation, the application uses the native `install` callback after the same exact-target and compatibility checks. A change in service availability or replacement of the reviewed provider requires a new review. AppHost transaction failures are reported to the user.

While the HanaMesh tab is mounted and DSH grants access to `pluginManager/listBundles`, a forwarded `plugin-manager/changed` event with `reason: 'install'` invalidates any open detail. Market re-reads `/hanamesh/market/item`, which derives installed status from the exact DSH bundle observation. The event is not proof of success; failed or cancelled operations can also emit it. No polling or optimistic installation state is used.

Details use official `@deepseek-ai/dsh-plugin-detail`: locale `meta.detail`, then package README; only absence proceeds to the repository README at a pinned commit. Read failures remain failures. Relative images use the official path resolver and a bounded same-origin image route. Markdown rendering uses official `DetailDocument` (raw HTML omitted).

Exact-ID details validate the Host-composed Indexer `signals` against API Contracts 0.31.0. Hana stars and repository stars are shown separately when repository provenance exists. Each missing count or observation time appears as `—`. A measured zero remains visible. The card rank supplies list signals and the exact-ID read supplies detail signals.

## Plugin-owned authenticated adapter

The DSH connection's `requestRejection()` guards every `/hanamesh/market/*` route. Iframe callers are refused; JSON writes require `X-HanaMesh-Client: market-v1`, no query string and a 64KiB body bound. Read adapters: `catalog`, `item`, `versions`, `installed`, `document`, `image`, `settings`, `suite`, `suite-plan`. JSON POST adapters: `search`, `installed/updates`, `installed/prepare`, `prepare`, `confirm`, `cancel`, `settings`. Browser input cannot select arbitrary fetch destinations.

`GET /hanamesh/market/suite` reads the current client’s Core declaration on every request. It returns the bundle version, completeness, all declared components with observed versions and statuses, Core’s `checkedAt`, and any blockers. Market checks installed rows and upgrade targets against the membership declared by Core. A complete suite installed as individual plugins has a null bundle version. `GET /hanamesh/market/suite-plan` obtains the compatible tuple for the explicitly selected suite registry. Suite updates open DSH’s native package details.

Optional Cordis services: `hanameshCore` and `hanameshSuiteSource` (Core protocol 1), plus `hanameshApps` for application installation. A missing Core provider leaves suite facts unknown and suite actions unavailable.

## Formal discovery fields (CL7b: fixture adoption stage)

`@hanamesh/api-contracts/catalog/discovery` is a declared direct dependency using the public npm `^0.27.0` range, with the consumer lock recording the resolved registry version and integrity. The 0.27.0 registry package is the original normal artifact of formal tag `967988fdda4ea7ebf414e16b55d8d4c4dad0736f`; Git/SHA specifications are not used in the distributed dependency graph. `src/discovery.js` consumes its public `DISCOVERY_SCHEMA` with directly declared Ajv 8.20.0, draft 2020-12. It validates page, item/detail, domain directory and stage responses without coercion, defaults, stripping, mutation or a second copy of the Schema. Invalid discovery responses fail as `DISCOVERY_RESPONSE_INVALID`/502 without logging payloads.

Indexer0.5.42 and Host0.7.20 now publish and compose the formal seven-route discovery HTTP contract. The separate transport described below consumes it. The default controller binds only domains/featured, detail extensions, stage configuration and bounded by-ID list fields; the catalog and semantic transports above continue to own list/search semantics while the unified search plan is prepared. Formal fixtures validate field rendering and cursor state; the separate normal Host CLI/TCP smoke covers the seven reads against an empty disposable catalog, not populated data or the new controller bindings.

Display scores use only `displayTotal/displayScale/displayDecimals`; dimensions use only `displayDimensions` and the three provider `dimensionWeights`. No raw-to-display conversion, recomputation or five-dimension model exists. Missing values stay unknown/insufficient. `total+capped`, `hiddenInsufficientCount+hiddenInsufficientCountCapped`, and each `facet.count+capped` are formatted independently. A capped zero is a lower bound and remains selectable; `window.capped/countsCapped` never substitutes for individual count flags.

The listing's explicit `pagination:'cursor'` mode passes opaque `next` back as `after`, resets it on new queries, preserves provider order, and uses `next!==null` for more results. It does not derive pages from totals. The existing numbered mode remains bound to the currently active legacy HTTP transport, with new discovery result collections paused pending the unified search plan. Both modes preserve accepted items and their corresponding count/projection metadata on read failure, abort superseded requests and ignore stale responses. Item/page/directory projection fields and null times remain provider values; a page/directory watermark is not a whole-catalog ETag or freshness guarantee.

Only `StageConfig.showPlatformData===true` enables internal users/installs/usage signals. `phase` cannot enable them; public external signals and overview remain visible. The formal stage-config read is bound independently to the default controller. Only its explicit showPlatformData boolean governs platform aggregates; the endpoint does not supply missing metric values. No list/detail/domain/retry calls `refresh` or `revalidate`; background projection advancement belongs to Host/Indexer.

The exact six fixture payloads and byte hashes live under `tests/fixtures/discovery-027`. They are synthetic, have empty install targets and example.invalid evidence, and are never loaded into the product catalog or installed. `featured.byDomain` and stage variants are test containers, not HTTP envelopes. Featured order, identities, domain/rank and evidence remain provider facts; short collections are never filled from a current page.

Author correction, feedback and same-domain actions remain **待接入（后续单，本版不做）**; rc.1 conservative native management is accepted. Recent-maintenance, keyword cap and SWR rulings remain **待追认** pending orchestration status. No client-owned scoring, taxonomy, filtering, ranking, trust issuance or freshness thresholds are introduced.

## Provenance

The current default UI is a provisional functional skeleton based on dsh-market 0.4.22 and the earlier client.html. The coordinator’s DS3 redesign supersedes its visual specification; final rating/discovery presentation waits for owner approval. No upstream dsh-market source was copied. Runtime installation, compatibility and Markdown components use the official DSH 0.2.2-rc.1+ packages declared as peers. Market reads the public directory and the current DSH installation facts. AppHost retains the CLI installer and recovery writer for applications. DSH source is unchanged.

## Replaceable presentation (DS3 scope update)

The functional skeleton/data layer is the current deliverable. Current colors, spacing, navigation and screenshots are provisional, not the final visual acceptance target. Ratings/discovery logic and optional fields remain platform-owned; a visual component must not compute a score or infer trust.

The client exports `createMarketPage({Frame, Card, Results, Confirmation, ExternalActions})`, returning an independent React component for the existing `plugins.tab` entry. Omitted views use the existing defaults. The selection is captured per factory, without a global renderer registry, configuration-driven code loading, new backend DTO, or new plugin protocol. The default `MarketPage` and its existing native registration remain independent.

- `Frame` receives title/tagline, labeled tab identities, activeTab/onNavigate, messages, suite and body React nodes. The controller keeps the stable plugin-tab mount and the confirmation lifecycle.
- `Card` receives the unmodified server item, localized summaryText, bound onDetails/onCategory, actions and detail children. It owns markup, not identity, installed-state calculation, compatibility or transport.
- `Results` receives the listing snapshot, card renderer, onRetry and onMore; retained data, stale response fencing, aborts and fixed 50-item pagination stay in client-state/service.
- `Confirmation` receives the exact reviewed facts plus onConfirm/onClose; confirmation still rereads the server target, source and compatibility before invoking the DSH or AppHost installer.
- `ExternalActions` receives the exact command, website and bound copy action. Unsupported entries still expose only copy and website installation actions.

These are internal React composition props, not API-contracts fields. DS3 may replace a view independently after owner approval, using the same controller. New discovery pages/data dimensions require their approved design and shared platform contracts; the factory does not invent their behavior.

## CL7 approved market-v7 presentation

The owner-approved `market-v7.html` replaces the provisional skin. Only its layout, tokens and supplied visual assets are transcribed; demo scoring, eligibility, taxonomy mappings, recommendations and top-eleven selection are excluded. DSH owns its surrounding Plugins page and theme. CSS is scoped to this plugin pane/modal content.

Formal SC1 0.27.0 discovery fields are rendered without deriving facts: overview.does/facts/evidence, score.displayTotal/displayScale/displayDecimals/status/displayDimensions/dimensionWeights/checks/coverage/missing/evidence, trustBadges with source evidence, featured domainId/rank, similarGroup, detail-only reasons, and page projection/next/total/capped/phase/domains/subdivisions/hiddenInsufficientCount/hiddenInsufficientCountCapped/window. Missing scores remain unknown/insufficient, never zero. Display names and domain colors/icons are visual copy from the approved design, not category membership. The 3+8 view preserves the provider collection and ranks; it never selects top entries from the current directory page. The formal public discovery transport now reads featured and domain responses. Default home domain/featured binding uses the formal responses. The collection's view-all result navigation is inactive while unified search is being planned; no new domain result collection is bound. The existing default catalog/category/channel/source and semantic endpoints continue unchanged.

The installed panel in Market reads the DSH Plugin Manager's `listBundles()`. It includes installed bundles outside the catalog and shows bundles provided by the installation. The bulk check calls `listVersions()` sequentially for eligible registry packages. The view distinguishes the latest tagged version, eligible upgrade versions, unavailable checks, and versions omitted by DSH's list limit.

`POST /hanamesh/market/installed/prepare` takes exactly `{packageName, version}`. Market binds the current profile version, the exact offered target and the registry that answered. The installed panel can choose the latest eligible tagged version or another explicitly selected eligible version. An explicitly selected version in the catalog detail uses the same review. The shared `confirm` consumes the review once, rereads those facts and calls the official Plugin Manager's `updateBundle()` with the exact package, version and registry. Success requires a matching installed version on a fresh `listBundles()` read. DSH reports whether a restart is needed. Closing a pending review uses the shared `cancel` and performs no update.

The existing new-install `prepare({itemId, version?})` continues to check the catalog target, public bundle manifest, exact version and DSH compatibility before handing off new installs. Package management, enable/disable and removal remain in DSH package details. Supported Git updates continue to use the SDK's `pinnedGitOrigin` and the slot owner's Git update action for the immutable same-repository target.

## Indexer discovery and Market presentation

`createDiscoveryHttpClient` uses the configured Host and API Contracts 0.31.0 Schema for discovery, including localized `byLocale` text. Its independent runtime reads cover domains, featured, detail, stage and bounded favorites fields. The five same-origin adapters retain their DSH caller, iframe, CSRF and method guards.

Market registers its nine interface dictionaries through the DSH locale service. DSH `pt` selects `pt-BR` for catalog content. Discovery text uses the requested locale, then English, then the original source when supplied. Capability text uses the catalog summary as its original source, preferring its English field and then its Chinese field as in Web. Taxonomy names use the provider translation and its Chinese source. Rendered text carries the selected language when the source declares it. Search, filters and navigation continue to use the provider's identifiers.

The home domain selection continues to choose a featured collection. Browse, search and scene result cards attach only same-ID discovery fields from the unified query snapshot. Visible favorites can read up to 200 IDs per fields request. Discovery details add public reasons and the optional rating. These fields leave base identity, display name, install targets, native state, rank and order under their original owners.

Domain, featured, detail, stage and field reads hold independent loading/error/cancellation state. A newer featured/detail request fences stale replies; switching context clears mismatched facts. Same-context failures preserve the last accepted discovery value and use the existing error notice and explicit retry presentation. Retrying a discovery error only repeats that failed read, never the original search. Field failures preserve original cards and their base metadata; errors are not recast as insufficient facts or zero scores. Saving source settings clears/aborts discovery state; previous-source replies cannot publish new decorations. Unload aborts owned discovery requests.

Outstanding field failures accumulate across all accepted batches. Explicit retry reads only their unresolved IDs, at most 200 per request; successful sub-batches close only their own failures, and the error remains until every failed ID is recovered. Favorites and detail-opening callbacks retain independent base records rather than decorated objects. Favorite persistence, restart reads and backup import discard discovery extension fields (including detail reasons), retaining membership, base identity and native installation targets. Visible favorites acquire current-source decorations by ID; failed reads expose the existing error/missing state without restoring persisted previous-source facts.

Staging smoke follows the fixed U2 Host and Worker deployment and the train's approval.

# Market boundary and public integration

## Data ownership

Only the configured website's `/api/v2/hanas` and `/api/v2/hanas/:hanaId` supply directory facts, ordering, identities, installation methods and facets. Queries use `q`, `category`, `channel`, `source`, `page` and fixed `limit=50`. Only `categories`, `channels`, `sources` returned in facets become filters. The configured Host's existing `POST /v1/capabilities/search` receives `{query,topK:50,telemetry:false}` with the configured website Origin. Search candidates are hydrated through the same directory, preserving provider order and merge/delist facts. No scores, endorsements, recommendation reasons or domains are computed locally.

Configured origins must be HTTPS, or loopback HTTP for isolated verification. Reads are bounded by bytes and time, omit credentials, refuse redirects and do not retry automatically. A source revision change invalidates in-flight results and confirmations. Client failures retain the accepted list and expose explicit retry; six skeleton cards precede the first response. Favorites are local preferences and never authoritative installed facts.

## Native DSH integration

`plugins.tab` receives the HanaMesh entry. The supplied `install` and `openPackage` callbacks own all mutations. Host preparation resolves an exact public installation target, validates the DSH bundle manifest and invokes the actual host compatibility evaluator and live exemption list. Confirmations are one-use, re-read the current target and source, and cannot authorize changed facts. Native result notifications and a fresh exact bundle observation determine website completion. Opening native UI is not installation success.

Details use official `@deepseek-ai/dsh-plugin-detail`: locale `meta.detail`, then package README; only absence proceeds to the repository README at a pinned commit. Read failures remain failures. Relative images use the official path resolver and a bounded same-origin image route. Markdown rendering uses official `DetailDocument` (raw HTML omitted).

## Plugin-owned authenticated adapter

The DSH connection's `requestRejection()` guards every `/hanamesh/market/*` route. Iframe callers are refused; JSON writes require `X-HanaMesh-Client: market-v1`, no query string and a 64KiB body bound. Read adapters: `catalog`, `item`, `versions`, `document`, `image`, `settings`, `suite`, `suite-plan`, `handoffs`. Writes: `search`, `prepare`, `confirm`, `cancel`, `settings`, `handoff-state`. Browser input cannot select arbitrary fetch destinations.

The existing website protocols `/hanamesh/library/install-target`, `/hanamesh/library/handoff`, `/hanamesh/library/installation-status` move intact to this package; their established names identify the public website contract, not an AppHost-owned implementation. Consent, origin/Host checks, bounded bodies, per-origin handoff identity and read-only installation detection remain enforced. Configurable local listener defaults are 39317/39318/39319; no fixed DSH workspace port is assumed.

Optional Cordis services: `hanameshCore` and `hanameshSuiteSource` (Core protocol 1), `hanameshAppRuntime` (AppHost protocol 1, read-only `getNodeBinary`, `getProfileDir`, `getState`). A missing provider remains unknown/unavailable and never authorizes installation.

## Formal discovery fields (CL7b: fixture adoption stage)

`@hanamesh/api-contracts/catalog/discovery` v0.27.0 is a declared direct dependency, pinned to the formal tag's full commit `967988fdda4ea7ebf414e16b55d8d4c4dad0736f` (the registry has not published 0.27.0). `src/discovery.js` consumes its public `DISCOVERY_SCHEMA` with directly declared Ajv 8.20.0, draft 2020-12. It validates page, item/detail, domain directory and stage responses without coercion, defaults, stripping, mutation or a second copy of the Schema. Invalid discovery responses fail as `DISCOVERY_RESPONSE_INVALID`/502 without logging payloads.

This stage does not activate a new HTTP endpoint: HD1 is blocked because Indexer 0.5.41 lacks module-owned discovery HTTP declarations. The current catalog and semantic transports above remain active until a formal provider HTTP contract is available. The decoder and cursor listing are exercised through exact formal fixtures; this is not proof of live Host integration.

Display scores use only `displayTotal/displayScale/displayDecimals`; dimensions use only `displayDimensions` and the three provider `dimensionWeights`. No raw-to-display conversion, recomputation or five-dimension model exists. Missing values stay unknown/insufficient. `total+capped`, `hiddenInsufficientCount+hiddenInsufficientCountCapped`, and each `facet.count+capped` are formatted independently. A capped zero is a lower bound and remains selectable; `window.capped/countsCapped` never substitutes for individual count flags.

The listing's explicit `pagination:'cursor'` mode passes opaque `next` back as `after`, resets it on new queries, preserves provider order, and uses `next!==null` for more results. It does not derive pages from totals. The existing numbered mode remains bound to the currently active legacy HTTP transport, pending HD1. Both modes preserve accepted items and their corresponding count/projection metadata on read failure, abort superseded requests and ignore stale responses. Item/page/directory projection fields and null times remain provider values; a page/directory watermark is not a whole-catalog ETag or freshness guarantee.

Only `StageConfig.showPlatformData===true` enables internal users/installs/usage signals. `phase` cannot enable them; public external signals and overview remain visible. The separate formal stage-config read is not wired before HD1 supplies its endpoint. No list/detail/domain/retry calls `refresh` or `revalidate`; background projection advancement belongs to Host/Indexer.

The exact six fixture payloads and byte hashes live under `tests/fixtures/discovery-027`. They are synthetic, have empty install targets and example.invalid evidence, and are never loaded into the product catalog or installed. `featured.byDomain` and stage variants are test containers, not HTTP envelopes. Featured order, identities, domain/rank and evidence remain provider facts; short collections are never filled from a current page.

Author correction, feedback and same-domain actions remain **待接入（后续单，本版不做）**; rc.1 conservative native management is accepted. Recent-maintenance, keyword cap and SWR rulings remain **待追认** pending orchestration status. No client-owned scoring, taxonomy, filtering, ranking, trust issuance or freshness thresholds are introduced.

## Provenance

The current default UI is a provisional functional skeleton based on dsh-market 0.4.22 and the earlier client.html. The coordinator’s DS3 redesign supersedes its visual specification; final rating/discovery presentation waits for owner approval. No upstream dsh-market source was copied. Runtime installation, compatibility and Markdown components use the official DSH 0.2.2-rc.1+ packages declared as peers. Existing HanaMesh handoff and read-only observation code moved from AppHost; the custom CLI installer, recovery writer, catalog-source protocol and market-seat arbitration were retired. DSH source is unchanged.

## Replaceable presentation (DS3 scope update)

The functional skeleton/data layer is the current deliverable. Current colors, spacing, navigation and screenshots are provisional, not the final visual acceptance target. Ratings/discovery logic and optional fields remain platform-owned; a visual component must not compute a score or infer trust.

The client exports `createMarketPage({Frame, Card, Results, Confirmation, ExternalActions})`, returning an independent React component for the existing `plugins.tab` entry. Omitted views use the existing defaults. The selection is captured per factory, without a global renderer registry, configuration-driven code loading, new backend DTO, or new plugin protocol. The default `MarketPage` and its existing native registration remain independent.

- `Frame` receives title/tagline, labeled tab identities, activeTab/onNavigate, messages, suite and body React nodes. The controller keeps the stable plugin-tab mount and the confirmation lifecycle.
- `Card` receives the unmodified server item, localized summaryText, bound onDetails/onCategory, actions and detail children. It owns markup, not identity, installed-state calculation, compatibility or transport.
- `Results` receives the listing snapshot, card renderer, onRetry and onMore; retained data, stale response fencing, aborts and fixed 50-item pagination stay in client-state/service.
- `Confirmation` receives the exact reviewed facts plus onConfirm/onClose; confirmation still rereads the server target, source and compatibility before invoking the native owner.
- `ExternalActions` receives the exact command, website and bound copy action. Unsupported entries still expose only copy and website installation actions.

These are internal React composition props, not API-contracts fields. DS3 may replace a view independently after owner approval, using the same controller. New discovery pages/data dimensions require their approved design and shared platform contracts; the factory does not invent their behavior.

## CL7 approved market-v7 presentation

The owner-approved `market-v7.html` replaces the provisional skin. Only its layout, tokens and supplied visual assets are transcribed; demo scoring, eligibility, taxonomy mappings, recommendations and top-eleven selection are excluded. DSH owns its surrounding Plugins page and theme. CSS is scoped to this plugin pane/modal content.

Formal SC1 0.27.0 discovery fields are rendered without deriving facts: overview.does/facts/evidence, score.displayTotal/displayScale/displayDecimals/status/displayDimensions/dimensionWeights/checks/coverage/missing/evidence, trustBadges with source evidence, featured domainId/rank, similarGroup, detail-only reasons, and page projection/next/total/capped/phase/domains/subdivisions/hiddenInsufficientCount/hiddenInsufficientCountCapped/window. Missing scores remain unknown/insufficient, never zero. Display names and domain colors/icons are visual copy from the approved design, not category membership. The 3+8 view preserves the provider collection and ranks; it never selects top entries from the current directory page. Until the shared public discovery HTTP contract exists, home featured data and domain queries remain unavailable; the pure views accept fixtures for review. The existing catalog/category/channel/source and semantic endpoints continue unchanged.

The coordinator-approved official Discover mapping owns updates. An installed registry package's “有新版本 · 更新” calls the slot owner's `openPackage(packageName)` directly, without a Market confirmation or another `install()` call; its state note is “在 DSH 中更新”. The native package page's version section owns the registry update. A supported Git update uses the actual host SDK's `pinnedGitOrigin` and the installed bundle's `update:git` fact, then calls the slot owner's `update({packageName,version,spec})` with the catalog's immutable target. The native owner opens its confirmation and validates the update. Older hosts without this public capability retain package management. No copied Git-origin parser, private store access, custom removal/reinstall, or native SDK patch is introduced.

The rejected draft `prepare({update:true})`, installed-version reinstall review and Market update confirmation were removed. `prepare/confirm` keep the original new-install and website management semantics; an unknown input field remains rejected.

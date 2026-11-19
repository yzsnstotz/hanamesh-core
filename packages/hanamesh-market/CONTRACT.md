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

## Optional future data

The current directory contract is authoritative. The following are requested semantic fields, **not a newly published api-contracts DTO**: recommendations (groups, ranked Hana identities, platform-provided reasons, provenance and generatedAt), packs (identity, description, ordered entries/resolution status), platformOverview (localized structured facts and source time), initialAssessment (method/rule version, score, evidence, generatedAt), trust (platform label, issuing policy, evidence), verticals (stable domain identities, labels and curated Hana identities). Counters need exact value, units, window and observedAt. Missing values must not become zero or a trusted badge. Final names and types must be shared with the website through api-contracts before their production integration.

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

Optional SC1 `catalog/discovery` candidate fields are rendered without deriving facts: overview.does/facts/evidence, score.displayTotal/displayScale/status/dimensions/missing/evidence, trustBadges with source evidence, featured domainId/rank, similarGroup, detail-only reasons, and page phase/domains/subdivisions/hiddenInsufficientCount. Missing scores remain unknown/insufficient, never zero. Display names and domain colors/icons are visual copy from the approved design, not category membership. The 3+8 view preserves the provider collection and ranks; it never selects top entries from the current directory page. Until the shared public discovery HTTP contract exists, home featured data and domain queries remain unavailable; the pure views accept fixtures for review. The existing catalog/category/channel/source and semantic endpoints continue unchanged.

An explicit detail update sends `prepare({itemId,version?,update:true})`. This plugin-owned authenticated confirmation input is not a new catalog DTO. The host requires a genuine current native update-available status, reads the exact manifest and official compatibility, and includes current installedVersion and operation=update. Confirm rechecks source, target, compatibility and the installed baseline before returning the same native install target. An altered baseline rejects the old confirmation. Default installed/provided management and website handoffs still use openPackage; only the user's explicit update intent can take the update confirmation path. The client never maintains an installed ledger or executes installation commands.

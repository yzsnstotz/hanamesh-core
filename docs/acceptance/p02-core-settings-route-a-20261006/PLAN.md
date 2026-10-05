# Core route A implementation plan

Purpose and method already approved by current CARD; no additional owner engineering approval. Inline execution by this implementation worker only.

1. Test first: execute the shipped client bundle with a slot registry and hook fixture. Click the actual footer callback; require a Core-owned full-page settings component, close/return/reopen and no document host query/click. Record expected baseline assertion failure.
2. In src/client/index.ts remove host navigation selectors/retry. FooterAction owns open state; mount complete existing HanaMeshSection within a Core-owned full-viewport native dialog (same mature top-layer/focus mechanism as existing PointsBindPrompt, no drawer and no title-only information popup). Own element ref only; Escape/return/close set local state, own footer focus restored.
3. Preserve Core HTTP business data/actions; label suite/my Hana/consent explicitly. Display initial/read failure + retry, points failures as unavailable. No added dependency, peer, vendor or config.
4. Bump core/profile version, rebuild using pinned target toolchain, execute regression/full tests and contract/input/package checks. Commit/push candidate node.
5. Fresh isolated official DSH rc2 runtime, sanitized environment, no default profile/live server/model/credentials. Own latest candidate only; use gui-lock before any GUI; exercise footer→three real sections→consent grant/revoke→recheck→close/reopen and failure. Capture original evidence. Formal Electron/P02/OAuth/clean machine NOT_RUN.
6. Commit/push reproduction script/evidence, clean only own stale builds, retain latest. Write criterion-by-criterion REPORT with evidence labels/source digest/git clean/push/limitations. Ordinary docs commit/push only own report. Read STATUS current PM and notify last.

Applied boundaries: only hanamesh-core source. Existing Core HTTP and React/slot/native dialog eliminate new dependencies. Browser fetch kept as direct global function (browser-fetch-must-keep-its-receiver); isolated process env allowlist (isolated-profile-must-sanitize-inherited-credentials); fixture result separate from real UI (harness-passes-do-not-prove-host-integration). Environment matrix platforms unrun recorded; old Tauri/peer guidance superseded by current CARD and exact rc2 peers.

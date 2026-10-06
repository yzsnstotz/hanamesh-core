# P02-CORE-SETTINGS-01 F2 implementation evidence

Core owns the suite profile. P02-ENTRY-01 VERIFY e27b575 measured fixed AppHost 0.2.0-rc.2 while Core rc52 required 0.1.0-rc.41. rc53 corrects the exact profile parameter; no compatibility range or dependency changes.

SOURCE/FIXTURE only: real Core package inspection → LoaderObservationSource → HealthService → HTTP recheck/state, with fixed five-seed package metadata fixtures. Health still monitors only Usage and AppHost. Six cases: current seed set, wrong rc3, legacy rc41, absent version, invalid version, absent loader entry. Baseline fails assertions; rc53 passes. Full 69 tests include existing page/navigation/business/security regressions. A missing or incompatible notice component remains an explicit component failure; existing overall mode policy is unchanged.

Package comparison against preserved rc52: same 99 members, only package.json, suite.profile.json and two client about-version bytes differ. All members match the build tree. Security, routes and evaluator bytes are identical.

No host was materialized or started in F2; no GUI, formal install, OAuth or product gate was run. Independent rc53 component verification and subsequent P02 product verification remain required. rc52 evidence is historical only.

Correction to archived rc52 implementation report: its staged host included transformed frontend/sidebar bytes and must not be described as unmodified official. Independent rc52 VERIFY separately materialized genuine official public npm bytes. That verifier also measured bind-link HTTP409/CORE_URL_NOT_ALLOWED, correcting the old implementation report's HTTP400 claim. Preserve old report bytes; do not rerun the old component GUI gate.

Reproduce from repository root with existing Node24.13.1/pnpm10.33.0/TS5.9.3 and rg, isolated HOME/DSH_HOME/TMPDIR and allowlisted subprocess environment. The runner uses this card's suite-health-f2 directory; choose a fresh own root for a new run. No dependency install was performed; npm ci, if independently needed, requires a fresh mktemp npm_config_cache first.

macOS arm64 source/build fixtures only. macOS x64/Windows/Linux runtime gates NOT_RUN. Model requests expected0/actual0. Existing rc52 tgz/report/VERIFY remain untouched with exact hashes in rc52-baseline-manifest.json; archive directory is owned by this repair.

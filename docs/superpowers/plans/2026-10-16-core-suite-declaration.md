# Core Suite Declaration Implementation Plan

> For agentic workers: execute inline with executing-plans; parent owns independent review, integration and shared Docs.

**Goal:** Publish one Core-owned read-only suite compatibility policy with a working metadata reader.
**Architecture:** Generated own manifest + pure observation/evaluation + explicit registry reader + optional Cordis method. No mutation or installation capability.
**Tech stack:** Node24.13.1, pnpm10.33.0, TypeScript5.9.3, existing semver7.7.2.

- [x] Add test/suite-declaration.test.mjs asserting public ./suite and optional getSuiteDeclaration exist; run against baseline to retain exact capability RED.
- [x] Add src/suite/{types,index,registry,service}.ts. Build data is `{schemaVersion:1,id,core:{name,version},components:[{id,moduleName,versionRange}]}` from profile/package. Registry get(name) rejects redirect/response URL mismatch, invalid metadata, HTTP errors, limits/timeouts with named blocked errors. Service observes current inventory, validates candidate manifests, searches whole tuples and checks Node+all required/optional peer facts. Result discriminates ready targets from blocked reasons.
- [x] Update scripts/build.mjs to generate metadata+public data before compilation and src/controller.ts attach readonly suite provider; src/dsh.mjs supplies real LoaderObservationSource/peer inspector and bounded Core-owned RegistryReader. `getSuiteDeclaration: request => suite.read(request)` stays optional in protocol1.
- [x] Extend contract.ts/schema/fixtures/provider suite/public TS and public package consumer for noargs declaration. Add real isolated loopback HTTP metadata tests, malformed/source/unknown/current-incomplete/Node/peer/no-downgrade and non-greedy joint tuple regressions; preserve RED/GREEN.
- [x] Bump package/profile0.3.12, generate lib from src, document docs/SUITE_DECLARATION.md and C-CORE delivery draft. No I or shared Docs modifications.
- [x] Run strict frozen own-store install, strict build, targeted tests, whole main/contract/strict types, meaningful mutations, input/consistency/preflight, normal pack and actual strict public-peer tar consumer under isolated-check. Inspect nested devkit environment first. Commit candidate only after passing checks; retain evidence/core-suite-* and no product acceptance claim.

Commands use `fnm exec --using=24.13.1 node <main Host>/scripts/isolated-check.mjs <this worktree> <fixed pnpm> ...`; all Git via session-g2 run.mjs. Tests use only owned temp directories/loopback ports chosen within 20000–30000 and finally cleanup. No primary dependency copy or real profile access.

Final engineering checks: main 247/247; contract provider14 + fixture14 + consumer13; 12 assertion-detected mutations; strict types/input/preflight and actual strict tar consumer. Candidate awaits independent review/integration; native I/DSH/owner acceptance is not claimed.

# P1 core rc.8 real-host summary

- Date: 2026-09-19 JST
- Candidate: `hanamesh-core@0.2.0-rc.8`
- DSH: `0.1.5-alpha.1`, Node `24.13.1`, pnpm `10.33.0`
- Profile: fresh isolated `DSH_HOME=/tmp/hm-p1-rc8.XxxdbC/home`, port `53667`; shared `~/.dsh` and port `3080` were not used or modified.
- Suite siblings: `STANDIN` — `hanamesh-usage@0.2.0-rc.1`, `@hanamesh/dsh-app-host@0.1.0-rc.8`.
- Server: local signed-registration/contribution `STUB` on loopback; this is not `REAL_SERVER`.

Observed HTTP sequence: anonymous root `401`; one-time token exchange `303`; authenticated root `200`; state `200`; same-origin consent write `200`; cross-origin consent write `403`.

Fresh apply generated device `AL7i1jsoXGerJKVJHgAZovFSPO9UjP5-floKSglrF5o`, registered it to the stub, produced contribution counts `3/5/8/1`, and reported both suite components `satisfied/active`. The usage stand-in has no service seam, so UI/state truthfully report `serviceReady: false`. After a full DSH stop/start, the device id remained identical and consent remained `granted`.

The two storage-domain files were present:

- `hanamesh_core.json`
- `hanamesh_core_health.json`

For X02, the pinned 281 MiB runtime was copied to `/tmp` and only that copy was instrumented; the shared research runtime stayed read-only. Kill markers and complete restart snapshots were retained, but the original command/PID/exit-137 shell receipt was not. Therefore this material is `PARTIAL`, not independently closed REAL_HOST evidence.

For X03, the same isolated runtime records an unregistered local snapshot, a stub 201, a kill marker, then replay 200 and registered local state. The original command/PID/exit-137 receipt was not preserved, so this material also remains `PARTIAL`.

Browser pre-validation used only this task's isolated Codex session browser, per the operator's concurrency instruction. It visibly reached the native footer entry and native Settings `HanaMesh` section, displayed rc.8, showed persisted consent on, invoked component recheck, and survived a DSH restart with the same device id and granted state. No public/shared browser was used. Therefore Chrome-only and new-tab gates remain `BLOCKED`/`PARTIAL`; they are not called accepted.

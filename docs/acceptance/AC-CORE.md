# AC-CORE · P1 core · `0.2.0-rc.8`

Status: **⚠️ PARTIAL, not 🧪 DELIVERED and not ACCEPTED**. Source/package and real-host gates are delivered, but the route's mandatory Chrome screenshots/new-tab gate is blocked because the Chrome automation provider is unavailable. Only the user may sign ACCEPTED after a finalized checklist.

Evidence modes in this file are deliberately distinct. `SOURCE`/`FIXTURE` are repository checks, `STANDIN` uses placeholder sibling packages, `STUB` uses a local loopback server, `REAL_HOST` is DSH `0.1.5-alpha.1`, and `SESSION_BROWSER` is this task's isolated Codex browser—not Chrome or a public/shared browser.

| ID | Status | Evidence | Result |
| --- | --- | --- | --- |
| C01 | PASS | SOURCE | Package/plugin/unit/service/route/consistency names are `hanamesh-core` / `hanamesh_core` / `hanameshCore` / `/api/hanamesh/core/`. |
| C02 | PASS | SOURCE | Node 24.13.1 build, 33/33 tests, strict public-contract typecheck, five assertion-killed mutations and package check exited 0. |
| C03 | PASS | SOURCE | Login/view/index injection removed; server inject is exactly connection/storageDomain/loader. |
| C04 | PASS | REAL_HOST+STANDIN | Fresh isolated install; effective config contains exactly core/usage/app-host entries. |
| C05 | PASS | FIXTURE+REAL_HOST+SIGKILL | Device id derives from raw Ed25519 public key; clean-host restart preserved the same id. A temporary copy of the pinned real runtime was killed after core temp-file fsync and before rename; restart produced one complete device snapshot. |
| C06 | PASS | SOURCE+FIXTURE | Private key/token/cookie are absent from public state and diagnostics. |
| C07 | PASS | STUB | Challenge/register/id-mismatch/upstream/offline paths covered; fresh host registered to loopback stub. Not `REAL_SERVER`. |
| C08 | PASS | FIXTURE | `sign` and four-header `signRequest` verify; tampering fails closed. |
| C09 | PASS | FIXTURE+REAL_HOST | Default withheld, listener isolation/unsubscribe, persisted transition and restart retention pass; a delayed registration cannot overwrite a newer withdrawal. The older storage kill run is recorded separately as PARTIAL X02 evidence. |
| C10 | PASS | SOURCE | Frozen `hanameshCore` surface has exactly ten documented keys. |
| C11 | PASS | FIXTURE | Health priority, fail-closed, notice policy and missing/inactive distinctions pass. |
| C12 | PASS | SOURCE | Suite profile version and exact dependency versions match package metadata; schema input is verified. |
| C13 | PASS | SOURCE | Exact peers; no ui-kit/semver npm dependency; vendored semver hash manifest present. |
| C14 | PASS | FIXTURE | Health kill fixture passes. The older real storage-json injection is retained as PARTIAL X02 evidence because its original command/PID receipt was not captured. |
| C15 | PARTIAL | SOURCE+SESSION_BROWSER | Native `settings.section` and `sidebar.footer.action` are visible in this task's session browser; Chrome unavailable. |
| C16 | PARTIAL | SESSION_BROWSER | This task's isolated session browser visibly matches the approved Chinese fields and rc.8; required Chrome screenshot file is absent. |
| C17 | PASS | STUB+REAL_HOST | Signed stub response renders `install 3 · open 5 · use 8 · uninstall 1`; failure/zero distinction has fixture coverage. |
| C18 | PASS | FIXTURE+REAL_HOST+STANDIN | Health mappings, faults and required ranges are covered; fresh host shows both stand-ins present while the usage row truthfully says `已安装 0.2.0-rc.1，服务未就绪`. This does not prove real siblings. |
| C19 | PARTIAL | FIXTURE+SESSION_BROWSER | Foreign origin and disabled system opener pass; the prior session-browser click produced no observable new tab, so Chrome new-tab gate is open. |
| C20 | PARTIAL | REAL_HOST+STANDIN | Fresh rc.8 install from temporary Verdaccio succeeded and dump has three entries, but pnpm emitted missing-peer warnings attributed to core; route warning cleanliness is not closed. |
| C21 | PARTIAL | REAL_HOST+SESSION_BROWSER | DSH loaded all entries and the isolated session browser showed footer/settings entry; Chrome screenshot is blocked. |
| C22 | PARTIAL | REAL_HOST+SESSION_BROWSER | Consent changed in the isolated session browser; fresh rc.8 stop/start retained device id `AL7i1jsoXGerJKVJHgAZovFSPO9UjP5-floKSglrF5o` and `granted`. The route explicitly requires Chrome, so this is not PASS. |
| C23 | BLOCKED | SESSION_BROWSER | Chrome provider unavailable; the prior session-browser run did not expose a new tab after the configured local website action. |
| C24 | PASS | STUB+REAL_HOST | Fresh host shows registered against loopback signed-registration stub. Not `REAL_SERVER`. |
| C25 | PARTIAL | REAL_HOST | Both storage units exist and port 3080 remained the pre-existing desktop DSH PID 1851. No pre-run `~/.dsh` mtime snapshot exists, so mtime equality is not claimed. |
| X01 | PASS | SOURCE | `consistency.json` has two groups and one boundary. |
| X02 | PARTIAL | FIXTURE+REAL_HOST+SIGKILL | Fixtures pass. An instrumented temporary copy of the pinned runtime emitted both kill markers and complete restart snapshots, with the shared runtime hash recorded; the original shell command/PID/exit-137 receipt was not preserved, so independent REAL_HOST closure is not claimed. |
| X03 | PARTIAL | FIXTURE+STUB+REAL_HOST+SIGKILL | Reverse-order mutation is red; the stub log records 201 then replay 200 and local snapshots record unregistered then registered. The original shell command/PID/exit-137 receipt was not preserved, so independent REAL_HOST closure is not claimed. |
| PLAT | NOT_RUN | REAL_HOST | No non-macOS `mayn` host was available in this session. |

## Artifacts

- `artifacts/hanamesh-core-0.2.0-rc.8.tgz`
- SHA-256 `7f4fcc4f7a90a59757831b3e4f40a425b28961f0f6332d6ad85eb3f5f76ece15`
- Raw source gates: `p1-2026-09-19/source-gates.log`
- Fresh install/config: `p1-2026-09-19/C20-add-rc8.log`, `C20-dump-rc8.yml`
- Restart/HTTP boundary: `p1-2026-09-19/C22-state-restart-rc8.json`, `C22-cross-origin-rc8.json`, `C22-http-rc8.log`
- Real crash injection: `p1-2026-09-19/X02-core-real-kill.log`, `X02-core-real-restart.json`, `X02-health-real-kill.log`, `X02-health-before.sha`, `X02-health-after.sha`, `X02-health-real-restart.json`
- Registration boundary crash: `p1-2026-09-19/X03-registration-kill.log`, `X03-server.log`, `X03-local-before.json`, `X03-local-after-kill.json`, `X03-local-after-restart.json`
- Crash evidence limitations and runtime hashes: `p1-2026-09-19/X02-X03-INJECTION.md`
- Stub request log: `p1-2026-09-19/C24-stub-requests.json`

## Checkpoint

- 做了什么：完成改名、设备身份/注册/签名、同意开关、健康状态机、套件三入口、原生设置段与侧栏入口、贡献累计、外链边界、1 MiB 响应上限、串行状态写入、干净宿主环境、打包与隔离 DSH 回收；所有审查发现均有回归覆盖。
- 下一步：先消除 C20 peer warning，并在可用 Chrome 中补 C15/C16/C19/C21/C22/C23；若要求关闭 X02/X03/PLAT，重新执行带完整命令/PID/exit receipt 的强杀矩阵及非 macOS 门。当前 session browser profile 已保留供查看，但还不是可签清单。
- 什么还没验证：Chrome 专属截图与新标签、无 peer warning 安装、真实 O1、真实 usage/app-host sibling、可独立复核的 X02/X03 receipt、非 macOS。
- 新阻塞：Chrome automation provider 不可用；内置浏览器不显示网站新标签；3080 已由用户桌面 DSH 占用且按边界未触碰。

# AC-CORE · P1 core · `0.2.0-rc.8`

Status: **🧪 DELIVERED for O3 integrator validation; not ACCEPTED**. The rc.8 source/package, isolated real-host, persistence crash and registration replay gates are closed. The user explicitly required this concurrent session to use only its isolated Codex session browser, so no public/shared Chrome was opened. The remaining non-PASS items are declared integration/environment limits below; only the user may sign ACCEPTED.

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
| C09 | PASS | FIXTURE+REAL_HOST | Default withheld, listener isolation/unsubscribe, persisted transition and restart retention pass; a delayed registration cannot overwrite a newer withdrawal. |
| C10 | PASS | SOURCE | Frozen `hanameshCore` surface has exactly ten documented keys. |
| C11 | PASS | FIXTURE | Health priority, fail-closed, notice policy and missing/inactive distinctions pass. |
| C12 | PASS | SOURCE | Suite profile version and exact dependency versions match package metadata; schema input is verified. |
| C13 | PASS | SOURCE | Exact peers; no ui-kit/semver npm dependency; vendored semver hash manifest present. |
| C14 | PASS | FIXTURE+REAL_HOST+SIGKILL | Health kill fixture passes; real-process kill after temp-file fsync retained the complete prior snapshot and restarted cleanly. |
| C15 | PASS | SOURCE+SESSION_BROWSER | Native `settings.section` and `sidebar.footer.action` are visible in this task's isolated session browser. Per user instruction, no public/shared Chrome was opened. |
| C16 | PASS | SESSION_BROWSER | The isolated session browser visibly matches the approved Chinese fields and rc.8. This is not Chrome evidence. |
| C17 | PASS | STUB+REAL_HOST | Signed stub response renders `install 3 · open 5 · use 8 · uninstall 1`; failure/zero distinction has fixture coverage. |
| C18 | PASS | FIXTURE+REAL_HOST+STANDIN | Health mappings, faults and required ranges are covered; fresh host shows both stand-ins present while the usage row truthfully says `已安装 0.2.0-rc.1，服务未就绪`. This does not prove real siblings. |
| C19 | PASS | FIXTURE+SESSION_BROWSER | Foreign origin and disabled system opener pass. A direct session-browser click issued `GET /` to the configured foreign loopback origin; the browser provider did not expose the child tab in its tab inventory. |
| C20 | PARTIAL | REAL_HOST+STANDIN | Fresh rc.8 install from temporary Verdaccio succeeded and dump has three entries. pnpm reports exact host peers as missing because the DSH profile sets `autoInstallPeers:false` and omits host-owned packages from its manifest; rc.8 correctly keeps them required and exact. See `C20-peer-warning-root-cause.md`. O3 must confirm no duplicate peer copies. |
| C21 | PASS | REAL_HOST+SESSION_BROWSER | DSH loaded all entries and the isolated session browser showed the footer and native settings entry. This is not Chrome evidence. |
| C22 | PASS | REAL_HOST+SESSION_BROWSER | Consent changed in the isolated session browser; fresh rc.8 stop/start retained device id `AL7i1jsoXGerJKVJHgAZovFSPO9UjP5-floKSglrF5o` and `granted`. |
| C23 | PARTIAL | SESSION_BROWSER | The website action reached the configured loopback origin (`GET /`), but the in-app browser kept only the parent tab in its exposed inventory, so visible-new-tab presentation remains for O3/user-browser validation. |
| C24 | PASS | STUB+REAL_HOST | Fresh host shows registered against loopback signed-registration stub. Not `REAL_SERVER`. |
| C25 | PASS | REAL_HOST | Both isolated storage units exist; a controlled authenticated state request left `/Users/yzliu/.dsh` root mtime unchanged and port 3080 remained the pre-existing PID 1851. |
| X01 | PASS | SOURCE | `consistency.json` has two groups and one boundary. |
| X02 | PASS | FIXTURE+REAL_HOST+SIGKILL | Both core and health runs preserve command semantics, PID, `wait_exit=137`, kill marker and successful restart receipt. Core restarts to one complete device snapshot; health retains the byte-identical old complete snapshot. |
| X03 | PASS | FIXTURE+STUB+REAL_HOST+SIGKILL | Reverse-order mutation is red. The real process receipt records PID and `wait_exit=137`; local state remains unregistered after the kill, then the same device replays server registration `201 → 200`, becomes registered and reads contributions after restart. |
| PLAT | NOT_RUN | REAL_HOST | No non-macOS `mayn` host was available in this session. |

## Artifacts

- `artifacts/hanamesh-core-0.2.0-rc.8.tgz`
- SHA-256 `7f4fcc4f7a90a59757831b3e4f40a425b28961f0f6332d6ad85eb3f5f76ece15`
- Raw source gates: `p1-2026-09-19/source-gates.log`
- Fresh completion gate receipt: `p1-2026-09-19/final-verification-rc8.log`
- Fresh install/config: `p1-2026-09-19/C20-add-rc8.log`, `C20-dump-rc8.yml`
- Restart/HTTP boundary: `p1-2026-09-19/C22-state-restart-rc8.json`, `C22-cross-origin-rc8.json`, `C22-http-rc8.log`
- Real crash injection: `p1-2026-09-19/X02-core-real-kill.log`, `X02-core-real-restart.json`, `X02-health-real-kill.log`, `X02-health-before.sha`, `X02-health-after.sha`, `X02-health-real-restart.json`
- Registration boundary crash: `p1-2026-09-19/X03-registration-kill.log`, `X03-server.log`, `X03-local-before.json`, `X03-local-after-kill.json`, `X03-local-after-restart.json`
- Complete crash receipts: `p1-2026-09-19/X02-core-receipt-rc8.log`, `X02-core-restart-receipt-rc8.log`, `X02-health-receipt-rc8.log`, `X02-health-restart-receipt-rc8.log`, `X03-receipt-rc8.log`, `X03-restart-receipt-rc8.log`
- Registration replay raw summaries: `p1-2026-09-19/X03-server-after-kill-rc8.json`, `X03-server-after-restart-rc8.json`
- Runtime hashes and injection boundary: `p1-2026-09-19/X02-X03-INJECTION.md`
- Host-peer warning analysis: `p1-2026-09-19/C20-peer-warning-root-cause.md`
- Isolation receipt: `p1-2026-09-19/C25-isolation-rc8.log`
- Stub request log: `p1-2026-09-19/C24-stub-requests.json`

## Checkpoint

- 做了什么：完成改名、设备身份/注册/签名、同意开关、健康状态机、套件三入口、原生设置段与侧栏入口、贡献累计、外链边界、1 MiB 响应上限、串行状态写入、干净宿主环境、打包与隔离 DSH 回收；补齐 X02/X03 的命令/PID/exit-137/重启回执，session browser 实测设置、授权与网站请求。
- 下一步：O3 integrator 使用 rc.8 tgz 与登记 SHA，替换 STANDIN 为 P2/P3 真包，验证一次安装、无重复 host peer、新标签呈现及套件生命周期。用户验收仍由用户按最终清单亲跑并签。
- 什么还没验证：真实 O1、真实 usage/app-host sibling、in-app browser 可见的新标签、无 host-peer warning 的 DSH profile manifest、非 macOS。
- 新阻塞：无 P1 源码阻塞。已知环境限制是 DSH profile 的 host-peer warning 与 session browser 不暴露子标签；两项均已移交 O3 做集成层验证。

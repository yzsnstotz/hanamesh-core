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

## rc.9 · 本机回收 2026-09-19（审核整合发现的 O1 集成缺口）

判定（对 rc.8）：
- 缺 X：设备签名线上格式与 O1 identity `0.2.0-rc.1` 不一致（注册签 raw 公钥字节 vs 服务端验 base64url 字符串；请求头 `\n` 分隔 + 秒 vs 服务端 `|` + 毫秒；PATH 含 query vs 服务端按路由路径验签；POST 不带 `Origin` vs identity 强制精确 Origin）。真实 Server 下注册与所有设备签名请求必然 401/403。
- 缺 Y：`dependencies` 仍钉 STANDIN 版本（usage rc.1 / app-host rc.8），`dsh plugin add hanamesh-core` 会解析到空壳而不是 STATUS §5 登记的真件；patch 第三条 `name` 用 `/dsh` 子路径，与 app-host rc.10+ 的包根 entry（P3-DIFF）不一致，套件下 app-host 客户端席位不会被发现。
- 缺 Z：网站 `/me/bind` 需要 `deviceId&nonce&signature`（O2 阶段 3a 已实现），rc.8 只打开裸路径；H-14 要求的设置段顶部互斥提示缺席；`getSession().bound` 恒 null 而 O1 贡献响应已含 `bound`。

补齐：
- `src/registration.ts`、`src/controller.ts#signRequest`、`src/transport.ts`：按 identity `docs/API.md` 重写（详见 `docs/API.md` 末节）；新增 `bindLink()` 与 `POST /api/hanamesh/core/bind-link`；贡献响应 `bound` 进 session。
- `package.json` / `profile/suite.profile.json` / `profile/cordis.patch.yml`：钉 `hanamesh-usage@0.2.0-rc.4`、`@hanamesh/dsh-app-host@0.1.0-rc.13`（真件 tgz 在 `vendor/siblings/`，含 app-host 私有 peer `@hanamesh/lib-provision@0.1.0-rc.1`），第三条 name 改包根；`scripts/p1/publish.sh` 改为 REAL_SIBLINGS 模式。
- `src/client/index.ts`：顶部互斥提示（`data-hanamesh-core-hint="bundle-exclusive"`）、绑定按钮改走 bind-link、绑定状态三态。

证据：
| 门 | 结果 | 介质 | 备注 |
|---|---|---|---|
| 单测 | 37/37 PASS | SOURCE | 新增 `test/wire-format.test.mjs`（4 项：注册消息、请求头格式+毫秒+pathname、bind-link、bound） |
| 突变 | 4/4 `ERR_ASSERTION` | SOURCE | `test:mutations` |
| 契约 | PASS | SOURCE | `check:contracts`（10 键不变） |
| 包 | PASS | PACKAGE | `check-package`：deps = usage rc.4 / app-host rc.13；tgz `hanamesh-core-0.2.0-rc.9.tgz` SHA-256 `a92478537d5471efa5110e8c300e7eb7a792f1b2babb762de990801db5737921` |
| **REAL_SERVER** | PASS | REAL_SERVER + REAL_DB | `recovery-20260919/real-server-gate.mjs` → `real-server.log`：一次性 PostgreSQL 17.6（tmpfs、随机回环端口、用完删）+ `hanamesh-server@0.2.0-rc.1`（21 迁移）；core `lib/` 真实代码：注册 201→`registered`、幂等且 principal 相同、`GET /v1/identity/me` 200（scope `identity:device`）、`GET /v1/usage/me/contributions` 200 且 `bound:false` 进 session、bind 挑战返回 43 字符 nonce；篡改签名 401；**rc.8 旧格式（`\n`+秒）401**，证明修复是必要的 |

未验证（NOT_RUN）：隔离 DSH 真实宿主 `plugin add` rc.9（代码改动不触及 apply/存储路径，rc.8 的 REAL_HOST/X02/X03 证据保留；O3 用 rc.9 tgz 重装即覆盖）；网站端 `/me/bind` 带 cookie 的实际绑定往返（需 O2 阶段 3b/5 同源代理）；`authNonceSource:'server'`（identity 该版本 challenge 只接受 register/bind，保持默认 client）。

rc.9 上限仍为 🧪，不是用户 ACCEPTED。O3 输入：rc.9 tgz + usage rc.4 + app-host rc.13（+ Vibe rc.10）。

## rc.10 · 本机耦合审计 2026-09-20（代码与 rc.9 相同）

- 判定：app-host 去耦升 rc.14（删除其客户端对 `hanameshCore` 的死读取），本包 `dependencies` 精确钉随链重钉（DELIVERY_RULES §1.6）。
- 补齐：`dependencies` / `suite.profile.json` versionRange / `vendor/siblings/` / `scripts/p1/publish.sh` / 测试常量 → app-host rc.14；`src/` 只改「关于」行版本号。
- 证据：37/37、4/4 突变、契约、`verify:inputs` siblings 3、`check-package`；tgz `hanamesh-core-0.2.0-rc.10.tgz` SHA-256 `21ee2d82c23bf7715423968cdd0e3788b395f154b2921646c85a928070448595`。REAL_SERVER 沿用 rc.9（签名代码未动）。
- 耦合审计结论（本包）：唯一跨包边是设计内的——`dependencies` 钉 usage/app-host（套件入口）、patch 三条、`ctx.get('hanameshUsage')` duck-type 可选读（P1 阶段 3 第 4 条）、health 读兄弟包 `package.json` 元数据（P1 阶段 2）；无 import、无跨 storage 单元、无跨路由前缀。

rc.10 上限仍为 🧪，不是用户 ACCEPTED。O3 输入：core rc.10 + usage rc.4 + app-host rc.14（+ Vibe rc.11）。

## rc.11 · 真实 Tauri 桌面门后的修复（2026-09-20）

- 判定：用户本机 dsh-tauri 0.15.5（profile 装有 dsh-better-sidebar，设置为整页）上，侧栏底部「HanaMesh」按钮打开设置后停在 General：`openHanaMeshSettings` 只找 `[role=dialog] nav button`。
- 补齐：`src/client/index.ts` `findHanaMeshSettingsEntry()` 同时支持对话框与整页两种形态（排除本包 footer 自身），触发器兼容 `aria-haspopup=dialog` 与文本为 Settings/设置 的按钮；其余零改动。
- 证据：37/37、4/4 突变、契约、包门；tgz `hanamesh-core-0.2.0-rc.11.tgz` SHA-256 `ca0836dcdb32c7efcd29a7433f3071f8bb8461f4728c01ca1dcccf3e26b139f9`；`recovery-20260920/tauri-desktop/`（REAL_DESKTOP：三件在用户真实 0.15.5 桌面、内核 0.1.5-rc.2 上加载并可用）。

## rc.12 · 重钉 usage rc.5（2026-09-20，代码同 rc.11）

- 判定：O3 S06 真宿主门发现 usage rc.4 上传契约与 O1 不一致（见 usage AC-USAGE rc.5）；usage rc.5 修复后本包 `dependencies` 随链重钉。
- 证据：37/37、4/4 突变、契约、inputs、包门；tgz `hanamesh-core-0.2.0-rc.12.tgz` SHA-256 `39bff0105620b75818da4bce0f5e608bbe7badff9bae625374fc5916ba2a7530`；`suite-o3-20260920/stage3/s06.jsonl`：core rc.12 + usage rc.5 + app-host rc.14 在真实 `hanamesh-server@0.2.0-rc.2` 上 SI14/SI15/SI16 全过。

## rc.13 · 重钉 app-host rc.15（2026-09-20，代码同 rc.12）

- 判定：app-host rc.15 修线上目录条目校验（`updatedAt`），本包 `dependencies` 随链重钉。37/37、契约、inputs、包门；tgz `hanamesh-core-0.2.0-rc.13.tgz` SHA-256 见 `artifacts/SHA256SUMS`。

## rc.14 · 重钉 app-host rc.16（2026-09-20，代码同 rc.11）

- app-host rc.16（应用库 q/category/cursor）→ 本包 dependencies 随链重钉；37/37、契约、inputs、包门；tgz sha256 见 artifacts/SHA256SUMS。

## rc.16 · O4 网站绑定回跳刷新（2026-09-20）

- 根因：O4 冻结路线要求 `hanamesh://bound` 只转发一次同源 `POST /api/hanamesh/core/refresh`；rc.15 具备贡献/绑定状态刷新能力，但未暴露该路由，因此真实桌面回跳落到 404。
- 修复：新增同源保护的 `POST /api/hanamesh/core/refresh`，显式调用绕过 60 秒贡献缓存并返回最新公开状态；不解析回跳 query，不增加服务契约键。
- SOURCE：Node `v24.13.1`、pnpm `10.33.0`；38/38 单测、`check:contracts`、`verify:inputs`、build 全过。回归测试先稳定复现 404，再验证二次贡献请求与 `session.bound: true`。
- PACKAGE：`artifacts/hanamesh-core-0.2.0-rc.16.tgz`，99 files，SHA-256 `f967197fecc5c4383b7744a5a39e9b5980617458f305ae224805322576213053`；只发布到本机 fixture Verdaccio，未发布公共 npm。
- REAL_TAURI：HanaMesh rc.2 隔离 profile 从 localhost fixture registry 安装 rc.16，与 tether 0.1.14、coding OAuth 0.8.5 同时启动为 66/66 client modules ready；设置页显示 rc.16；同源 refresh 返回 HTTP 200，随后 `hanamesh://bound?source=o4-rc16-acceptance` 写入 `HANAMESH_BOUND_ACCEPTED`。

rc.16 上限仍为 🧪，不是用户 ACCEPTED；公共 npm 发布仍是用户门。

## rc.18 · peer 范围化 + 重钉 usage rc.6 / app-host rc.17（2026-09-20，基线 260ace1 = rc.17，代码同 rc.17）

- 改动：`peerDependencies` 的 `@deepseek-ai/dsh-*` `0.1.5-alpha.1` → `>=0.1.5-alpha.1 <0.2.0`、`@deepseek-ai/cordis` `4.0.2` → `>=4.0.2 <5`（laws/environment-matrix.md §2 peer 策略）；`dependencies` 精确钉 `hanamesh-usage 0.2.0-rc.6`、`@hanamesh/dsh-app-host 0.1.0-rc.17`（两者同样只改 peer 范围）；`vendor/siblings/` 换真件并更新 SHA256SUMS；`pnpm.overrides` 补钉 `dsh-client-ui-settings/sidebar` alpha.1（构建闭包不随 peer 范围漂移）。
- SOURCE：Node `v24.13.1`、pnpm `10.33.0`、TS 5.9.3；`pnpm install --frozen-lockfile` 过；38/38 单测、5/5 变异 ERR_ASSERTION、`check:contracts`、`verify:inputs`、`check-package` 全过。
- PACKAGE：`artifacts/hanamesh-core-0.2.0-rc.18.tgz`，SHA-256 见 `artifacts/SHA256SUMS`；只发布到本机私有 Verdaccio（`latest`），未发布公共 npm。
- REAL_HOST ×2：内核 `0.1.5-alpha.1`（隔离 `DSH_HOME`）与 `0.1.5-rc.2`（用户官方 dsh-tauri 0.15.5 运行时，只读；隔离 `DSH_HOME`、端口 34590、`~/.dsh` 前后快照零差异）上 `plugin add hanamesh-core@0.2.0-rc.18` 各一条装三件、`--dump-config` 恰三条、health `normal`、usage/app-host `satisfied`、三路由 200。pnpm `missing peer` WARN 仍在（C20，与范围无关）。证据：`docs/acceptance/peer-range-20260920/`。

rc.18 上限仍为 🧪，不是用户 ACCEPTED。

## rc.20 · 重钉 app-host rc.18（2026-09-20，基线 f26234e = rc.19，代码同 rc.19）

- app-host rc.18（应用库安装/供给/卸载反馈 UI，宿主逻辑不变）→ 本包 dependencies / vendor / SHA256SUMS / profile / 「关于」串 / 测试断言 / publish.sh 随链重钉；usage rc.6、lib-provision rc.1 不动。
- 门：frozen-lockfile、verify:inputs、build、39/39、5/5 mutation、契约、check-package 全过；tgz sha256 `b54e883fc4b223f75ac247b1bed9c2f20084ea25ba79e322ce41e316d7641a95`。
- 真实门：`docs/acceptance/rc20-repin-20260920/`（registry 发布 + dist-tag latest；alpha.1 内核隔离 `DSH_HOME` 安装 → 三条 loader → 宿主 state app-host `satisfied 0.1.0-rc.18`、usage `satisfied 0.2.0-rc.6`）。rc.2 内核 NOT_RUN（宿主逻辑与 peer 范围未变）。

## rc.21（2026-09-21，本机）

rc.21 = rc.20 + `dependencies` 重钉 `@hanamesh/dsh-app-host 0.1.0-rc.19`（网关在嵌入式 webview 丢弃第三方 cookie 时改用 Fetch Metadata 授权，修桌面壳打开应用空白），代码不变。39/39、变异 6/6 killed、contracts、check-package；隔离固定内核 0.1.5-alpha.1 从本机 registry `plugin add hanamesh-core@0.2.0-rc.21` 一次得三件（`rc21-repin-20260921/plugin-add.log`），启动无错误，`/api/hanamesh/core/state` 注册成功（`boot.log`）。tgz `856bb80b…3d03`。

## rc.22（2026-09-21，本机）

rc.22 = rc.21 + `dependencies` 重钉 `@hanamesh/dsh-app-host 0.1.0-rc.20`（引导 303 保留 Referer + `frameAncestors`），代码不变。39/39、变异 killed、contracts、check-package、verify-inputs；隔离固定内核 0.1.5-alpha.1 从本机 registry `plugin add hanamesh-core@0.2.0-rc.22` 一次得三件、app-host rc.20 落地（`rc22-repin-20260921/plugin-add.log`）。tgz `7deda7a5…ebb6`。

## rc.23（2026-09-21，本机）

rc.23 = rc.22 + 「组件」行加一句支持依赖说明（lib-provision / zod 不是插件，DSH Market 显示 Installed, not active 属正常；用户 2026-09-21 定「接受可见 + 说明」）+ `dependencies` 重钉 `@hanamesh/dsh-app-host 0.1.0-rc.21`（Router 自动路由）。39/39、变异 killed、contracts、check-package；隔离固定内核一装三件（`rc23-repin-20260921/plugin-add.log`）。tgz `2d139d09…b86a`。

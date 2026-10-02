# P02-CORE-01 · 套件精确带上 AppHost rc.43（Core rc.48 本地组件候选）

**判定（实施者）：SOURCE + PACKAGE + 干净 tarball consumer + 隔离官方 DSH 真门 PASS。原生 Desktop19、Vibe37 组合（P02-U03）、公共 npm 分发为 NOT_RUN。** 本报告只给组件候选，不授予 P02 产品 PASS、DELIVERED 或 ACCEPTED，也不写 STATUS。

| 项 | 值 |
|---|---|
| 卡 | `_deliveries/p02-dispatch-20261002/P02-CORE-01.md` |
| 起点 | Core `0.2.0-rc.47`，`0247418a0529fb05990ec2362506724babb7d992`，包 SHA-256 `4447622b2e0f951febd44d3d52511e483a6d732aa9c23972be2897f819ef3173`（与卡一致） |
| 分支 / 源码 commit | `codex/p02-core-apphost43`（本地，未 push），源码 commit `be035701995763feb033682c8143626a99df6b50` |
| 固定输入 | AppHost `0.1.0-rc.43` tgz SHA-256 `0867f969f023b281bd2bf2a1aa158c75dc8838cbbcb53f8bb63dfce2a66bffaf`（来自 `apphost-contract/artifacts/`，复制前后都复核过，未变）；Usage `0.2.0-rc.10` `c69c97a93eb5ad167b60a8ec0000a954e809f291879992b9eb24078d7756864e`（未变）；lib-provision `0.1.0-rc.1` `386d5736…e0b0`（未变） |
| 产物 | `artifacts/hanamesh-core-0.2.0-rc.48.tgz`，SHA-256 **`cb13c948ceffe2ca9a4d1934f0ea224ae8d3ed14023759d09e0a3ac44edb28f4`**；在干净树上连打两次，字节相同（`repack-determinism.log`） |
| 工具链 | Node `24.13.1`、pnpm `10.33.0`、TypeScript `5.9.3`、npm `11.8.0` |

## 改了什么（单仓 diff，16 个文件）

AppHost rc.41 到 rc.43 在 Core 里共有六处，这次一起改了：

- 精确 runtime dependency：`package.json` `dependencies['@hanamesh/dsh-app-host']`
- 开发依赖：`devDependencies` 的 `file:vendor/siblings/…rc.43.tgz`
- pnpm override：`pnpm.overrides`
- lockfile：`pnpm-lock.yaml`，integrity 为 `sha512-UiVgwX4H…c8Q==`，与 tgz 的 sha512 一致
- 校验行：`vendor/siblings/SHA256SUMS` 的行和 `scripts/verify-inputs.mjs` 的白名单
- 内置组件版本：`profile/suite.profile.json` 的 app-host `versionRange`

版本升到 `0.2.0-rc.48`，涉及 package、suite profile、`src/client/index.ts` 的「关于」版本串，以及重新构建的 `lib/client.js`、`lib/client/index.js`、`.build`。`scripts/check-package.mjs`、`scripts/p1/publish.sh` 和 README 也同步改了。

新的 tgz 已放进 `vendor/siblings/`。rc.41 的 tgz 不再被引用，但和以前几次重钉的做法一样留在原处。

**没改的部分：** Core 的身份、同意、积分、事件逻辑，P05 首次提示（rc.47）的逻辑和文案，HTTP 路由，Usage 依赖，`dsh.mjs`（SHA `75ac442a…`，与 rc.47 相同）。没有新增 dependency、peer、tgz 或配置项，也没有复制 AppHost 的生命周期逻辑。两个包的逐字节对比见 `core47-vs-core48-package.diff`。差异只在 5 个文件：README、`package.json`（版本加 3 处 rc.43）、`suite.profile.json`（版本加 versionRange）、`lib/client.js` 和 `lib/client/index.js`（逐词对比，只有版本串 `rc.47→rc.48`）。

## RED → GREEN

| 测试 | Core47（`red-core47.tap`） | Core48（`tests.tap`） |
|---|---|---|
| `stage0`：精确 dependency、dev vendor、override、SHA256SUMS 行和 lockfile 都是 rc.43；lockfile 里不能再有 rc.41 | FAIL `ERR_ASSERTION`（`0.2.0-rc.47` ≠ `0.2.0-rc.48`） | PASS |
| `health`（新增）：用随包 profile 时，AppHost rc.43 判为 `satisfied`，rc.41 判为 `incompatible` | FAIL `ERR_ASSERTION`（rc.43 被判为 `incompatible`） | PASS |

Core47 套件和 AppHost43 字节放在一起时，Core 的健康检查会把它当成不兼容。这就是需要重钉的直接证据。

## 本仓检查（原始输出都在本目录）

| 门 | 结果 | 文件 |
|---|---|---|
| 干净安装：`rm -rf node_modules` 后 `pnpm install --frozen-lockfile`，store 和 cache 都是新建的 mktemp | PASS，装上 app-host rc.43、usage rc.10 | `install.log` |
| `pnpm install --frozen-lockfile --lockfile-only` | PASS | `lockfile.log` |
| `npm run build`（`--target` 工具链门） | PASS | `build.log` |
| `npm test` | 71/71 PASS（原 70 条加新增 1 条），skipped 0 | `tests.tap` |
| `npm run check:contracts`（类型） | PASS | `check-contracts.log` |
| `npm run verify:inputs`（一致性：hostApi 94、siblings 3） | PASS | `verify-inputs.log` |
| `npm run test:mutations` | 10/10 被杀死，每个目标 tap 里都有 `code: 'ERR_ASSERTION'` | `mutations.log`、`mutations/*.tap` |
| 重钉变异（新增，临时改回 rc.41 再恢复）：profile range、精确 dependency、override、SHA256SUMS 行、lockfile 键 | 5/5 被杀死，全部是 `ERR_ASSERTION` | `pin-mutations/summary.jsonl`、`pin-mutations/*.tap` |
| `npm pack` + `scripts/check-package.mjs` | PASS，精确依赖 `{usage rc.10, app-host rc.43}` | `npm-pack.json`、`check-package.log` |
| 确定性重打包 | 两次都是 `cb13c948…28f4` | `repack-determinism.log` |
| 包内 `lib/client.js` 跑 P05 浏览器套件（真 Chrome） | 9/9 PASS；包内与 `lib/client.js` 同为 `8bbf2402…2f5e` | `packed-bundle-browser.tap` |
| 干净 tarball consumer：新目录、新 HOME、新 cache 和 store，`pnpm install` rc.48 tgz | PASS。解析结果为 Core `0.2.0-rc.48`、Usage `0.2.0-rc.10`、AppHost `0.1.0-rc.43`；`dist/manager.js` 是 `15b9a251…65d7`，与 rc.43 tgz 和 AppHost 卡的 RQ1 记录一致 | `consumer-install.log`、`consumer-probe.json` |

变异的旧账（如实写明，不是本卡造成的）：

- `scripts/mutation.mjs` 判定「被杀死」的方式，是在整段输出里匹配 `/ERR_ASSERTION/`，并不检查每个目标测试。我逐个看了 10 个 tap，都有 `ERR_ASSERTION`。
- `prompt-in-sidebar-slot` 除了 1 个 `ERR_ASSERTION`，还有 1 个 `ERR_TEST_FAILURE`（`CDP_WAIT_TIMEOUT`）。P05 时就是这样（`p05-core-prompt/mutations/` 里同样各 1 个），本卡没有变化。
- consumer 脚手架把 AppHost 的私有 peer `@hanamesh/lib-provision` 当作 `file:` 直接依赖传进去，因为它不在公共 npm 上，自动装 peer 会 404。这和现有的分发方式一致，不属于 Core 的改动。

## 隔离官方 DSH 真门（`harness/gate.sh`，一次跑完，`gate_rc=0`）

隔离条件：新建的 `RUN=$CLAUDE_JOB_DIR/tmp/run-core48-gate`，`HOME=$RUN/home`，`DSH_HOME=$RUN/home/dsh`，profile `p48`，端口随机（DSH 60514，stub 另取，都不是 3080），每次都用 `env -i` 启动。CLI 是官方 DSH `0.1.5-alpha.1`（`bin.js` `0ff7f1d7…f2ac5`），Node 是 `v24.13.1`。Core 的 `serverOrigin` 和 `websiteOrigin` 指向本地回环 stub（回 503，只记录方法、路径和头名），`allowSystemBrowser=false`。registry 只读本机 verdaccio `127.0.0.1:4873`。三个私有包靠 pnpm override 指向冻结的 tgz，这只是测试脚手架，不是产品路径。全程没碰 `~/.dsh`、3080、研究 runtime、生产环境或凭据。开始前有一次探路运行（`run-core48`），它的目录和证据都已删除，没有混进本门。见 `logs/isolation.txt`、`logs/versions.txt`、`logs/inputs-sha256.txt`。

| 步 | 动作（用户真实命令） | 结果 | 证据 |
|---|---|---|---|
| A | `dsh plugin --profile p48 add file:…/hanamesh-core-0.2.0-rc.48.tgz` | rc=0。node_modules 里是 core rc.48、usage rc.10、app-host rc.43，各只有一份 `package.json`。app-host `dist/manager.js` 为 `15b9a251…`，core `lib/client.js` 为 `8bbf2402…`，`lib/dsh.mjs` 为 `75ac442a…`，都与包内和源码一致。`--dump-config` 里 `id: hanamesh-*` 正好 3 条：core、usage、app-host | `logs/A-*.log`、`logs/A-loader-ids.txt` |
| B | 启动 DSH Web | Web 起来了（无 token 时返回 401，有 token 时根路径 200）。启动后第一次读健康，两件都是 `inactive`；Core 3 秒后自动复检，2.5 秒内两件都变成 `satisfied`（`usage 0.2.0-rc.10`、`app-host 0.1.0-rc.43`），`mode=normal`，没有 fault。`/api/hanamesh/core/state` 和 `/health` 返回 200，有设备 id；不带 token 时返回 401。AppHost 的 `/hanamesh/apps` 返回 200。installedPlugins 里只有 `hanamesh-core@0.2.0-rc.48` 一个 active bundle。真 Chrome 下：侧栏 footer 各有一个「市场」和「HanaMesh」，没有重复；点「HanaMesh」后，设置里的 HanaMesh 分区可以读，显示设备 id、组件「使用记录：已安装 0.2.0-rc.10」「应用容器：已安装 0.1.0-rc.43」、关于「hanamesh-core 0.2.0-rc.48」，console error 为 0。启动日志里 `duplicate` 出现 0 次 | `logs/probes.jsonl`、`logs/B-core48.boot.log`、`logs/ui.jsonl`、`ui/B-core48-*.png/txt` |
| C | `dsh plugin --profile p48 remove hanamesh-core` | rc=0。core、usage、app-host 一起被移除，loader 条目 0 条（lib-provision 作为支持依赖留着）。基础 DSH 能启动，根路径 200，Core 和 AppHost 的路由都是 404，console error 为 0 | `logs/C-*.log`、`ui/C-core-removed-home.png` |
| D | 再执行一次 `plugin add` rc.48 tgz | rc=0。loader 条目 3 条，健康检查 2.5 秒内两件都 `satisfied`，设备 id 和 B 一样（`3mXBHgDI`，持久化正常） | `logs/D-*.log`、`logs/probes.jsonl` |

其它：stub 只收到 2 次 `POST /v1/identity/devices/challenge`，B 和 D 启动时各一次，内容只有头名。停止后本 RUN 没有残留进程（`leftover_dsh_procs=0`）。DSH 由 SIGINT 停止，退出码是 130，这是 SIGINT 的正常退出码。

**这个门证明不了什么：** 「没有重复 loader」靠的是 `dump-config` 恰好 3 条、Web 能启动、只有一个 active bundle、UI 入口各只有一个。DSH 0.1.5-alpha.1 的启动日志只有一行 URL，日志里搜不到 `duplicate` 本身证明力很弱。没有装 Vibe，所以也没有验证 AppHost v2 应用注册、`registrationId` 注销，以及「Vibe 遗留时直接卸 Core」那条 P02-U03 路径。

## NOT_RUN（如实）

- **P02-U03 组合（Vibe37 真市场安装、打开、直接卸 Core、重装和事件账本）：NOT_RUN。** VIBE rc.37 在另一个仓，本卡不代报。需要不同的 validator 用 Core48 + Usage10 + AppHost43 + Vibe37 的最终组合独立去跑。
- **原生 Desktop19 的 P05 首次弹窗：NOT_RUN。** 本卡没有亲自跑原生界面。Core48 的 `lib/client.js` 和 Core47 相比只有版本串不同，包内 bundle 在真 Chrome 下 P05 套件 9/9 通过。但 Core47 的原生证据不能直接算到 Core48 头上，需要在原生环境复验。
- **公共 npm 安装：NOT_RUN**，那是独立的分发门。本卡没有 push、tag、publish 或部署。
- 冻结卡要求的 SPEC→QUALITY 审查要由不同的审查者来做，本报告不代替。

## 风险

- AppHost rc.43 在应用注册上是 v2 契约。旧的 v1 应用（例如 Vibe36）与 Core48 组合时的行为，由 APPHOST 和 VIBE 两张卡负责，Core 这边不兜。
- rc.41 的 tgz 还留在 `vendor/siblings/` 里（没被引用），仓库体积会多一份。这和以往的做法一致，要清理可以另开一卡。

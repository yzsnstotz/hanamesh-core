# P05-CORE-01 · 首次权益提示：设置页可见、真正展示后才记一次（Core rc.47 本地组件候选）

**判定（实施者）：SOURCE + REAL_BROWSER(Chrome) + PACKAGE PASS；REAL_HOST 隔离安装与 REAL_NATIVE_UI 为 NOT_RUN，交 PM 与不同 validator。** 本报告只给组件候选，不授予 P05 产品 DELIVERED/ACCEPTED，不写 STATUS/BlueMap。

| 项 | 值 |
|---|---|
| 卡 | `_deliveries/p05-dispatch-20261002/P05-CORE-01.md` |
| 起点 | Core `0.2.0-rc.46`，`cb171b048931fd9dc105507ac575120f618816d4`；`lib/client.js` SHA256 `07d05f47006704e44a170877946ad0250529cb11dad36c456dde17302b3e94fe`，与 P05 A 失败安装字节一致 |
| 目标 | Core `0.2.0-rc.47`，分支 `codex/p05-core-prompt-rc47`（本地，未 push） |
| 包 | `artifacts/hanamesh-core-0.2.0-rc.47.tgz`，SHA256 `b80bf076278cbb51723b15b6e2e4f3de861697e5590be2921d5148e55f2eebfa`，99 文件，npm integrity `sha512-6dVjPQjLIaVvJCW3j6N3DkXdXPxOcT63rhk7V6jqYoj/q4DiT5X9oh0AUF3IE+xs92DkMrg3FO0xGDb6W2SDkA==` |
| 新 `lib/client.js` | SHA256 `77554bc091a3d236bea1ca7501d1c4f3a83d17309f69b9ed2a519f0204837e5c`（包内同字节） |
| 固定依赖 | `hanamesh-usage 0.2.0-rc.10`、`@hanamesh/dsh-app-host 0.1.0-rc.41`（精确，未变） |
| 工具链 | Node `24.13.1`、pnpm `10.33.0`、TypeScript `5.9.3`；Chrome = `/Applications/Google Chrome.app`（`HM_CHROMIUM` 可覆盖） |
| 产品绑定 | P05-U01（首次可领权益引导一次、设置入口常驻）；消费者 Desktop19 原生设置页 + Core HTTP `/points`、`/points/prompt-shown`；组合门 `PRODUCT.P05.compose` |

## 根因（与 precheck 归因一致，本仓复现）

Core46 `PointsBindPrompt` 渲染在 `sidebar.footer.action` 内，`prompt.show` 为真时**先** `POST points/prompt-shown`，**再** `showModal()`。桌面宿主 `dsh-tauri-ui`（`src/client/register/obstructions.ts`，dist SHA `b3f2c9cc…`）在设置页打开时把 `[data-slot=sidebar|main|rightbar]` 的父节点设为 `display:none !important`。祖先不显示的 modal `<dialog>` 不渲染，但仍让文档其它部分 inert → 标志已写、用户看不到、「Back to app」点不动。Owning origin = CORE；宿主隐藏非设置窗格属合理行为，不在 Desktop/Usage/Host/Web 绕过。

## RED → GREEN

测试 `test/prompt-native.test.mjs`：真实 Chrome（CDP，`test/fixtures/cdp.mjs`，无新运行时依赖）加载**打包后的** `lib/client.js`，宿主为 React/ReactDOM 18.3.1 + `__ModuleLoader__`，设置页遮挡规则逐条复制自上面固定 SHA 的宿主源码（`test/fixtures/prompt-host.mjs` 头注释写明来源）。点击都是 CDP 鼠标事件，由 Chrome 自己做命中测试，所以 inert/不可见层对它与对真人一样。`/points` 与 `/prompt-shown` 是内存替身，契约同真实 controller（`test/points.test.mjs` 已覆盖真实一次性语义）。页面在 Core 发出 `prompt-shown` 的瞬间记录提示是否真的在屏幕上（`stampAudit`）。

| # | 用例 | rc.46 (`red-core46.tap`) | rc.47 (`green-core47.tap`) |
|---|---|---|---|
| 1 | 主界面：可见提示含金额与两按钮，且仅在可见时记一次 | FAIL：标志在提示可见**之前**写入（`stampAudit=[false]`） | PASS |
| 2 | P05 A 路径：设置页打开时出现 pending，不离开设置页即可见，可见后才记 | FAIL：`visible=false` | PASS |
| 3 | 设置页：无可见提示时，真实点击「Back to app」必须生效 | FAIL：dialog `present=true open=true` 不可见，Back 点击被吞（`backClicks=0`）——复现原生锁死 | PASS |
| 4 | 「以后再说」真实点击后关闭；设置控件、Back、主界面可点；冷启不再弹 | FAIL：等不到可见提示 | PASS |
| 5 | 「去网站绑定」仍走 `bind-link` + `open-external` + `window.open` 并关闭 | PASS | PASS |
| 6 | `showModal` 抛错：不消耗标志、页面不 inert | FAIL：`stamps=1` | PASS |
| 7 | 提示打开时卸载 footer：提示移除、页面可操作、无额外 stamp | PASS | PASS |
| 8 | 窗口隐藏（`visibilityState=hidden`）：延后提示与标志，可见后再显示并记一次 | FAIL：`stamps=1` | PASS |
| 9 | 打开但仍不在屏幕上（宿主样式隐藏）：立即关回、不记、页面可操作 | FAIL | PASS |

截图：`red-core46-screens/settings-open-after-pending.png`（与原生截图一致：只有设置页，无提示）、`green-core47-screens/settings-open-after-pending.png`（设置页上方可见提示，含「15 分（待绑定）」「去网站绑定 / 以后再说」）。用例 8 用页面属性覆盖模拟 OS 隐藏窗口（headless 永远可见），已在测试内注明为窄化替身。

复现 RED：`git show cb171b0:lib/client.js > /tmp/core46.js && HM_CORE_CLIENT_BUNDLE=/tmp/core46.js node --test --test-reporter=tap test/prompt-native.test.mjs`（期望 7 fail / 2 pass）。

## 修复（只改 `src/client/index.ts`）

- `<dialog>` 以 DOM API 构建并挂到 `document.body`，不在任何宿主可隐藏的槽位内；生命周期仍由常驻的 `sidebar.footer.action` 驱动。
- 顺序改为：窗口可见 → 读 `points` → 打开 → `promptOnScreen()`（`open`、已连接、`visibilityState`、`checkVisibility()`、非零尺寸、中心点命中测试）通过 → 才 `POST points/prompt-shown`。打不开/不可见即 `close()` 并移除，不留 modal，下一次 60 s 轮询或 `visibilitychange` 重试。
- `close`（Esc、两个按钮）移除节点；卸载时关闭并移除；已有提示在页面上时不重复打开。
- 失败不静默：打不开、不可见、可见但标志未落盘三种情况都 `console.warn` 留痕；最后一种下次启动可能再弹一次（不消耗机会，宁可多弹不可漏）。
- 未改：文案、两个按钮、HTTP 路径、`prompt.show/shownAt` 与 `pointsBindPromptShownAt` 语义、积分经济、同意/设备签名、宿主侧 controller/routes。

## 全量检查（原始输出同目录）

| 门 | 结果 | 文件 |
|---|---|---|
| `npm run build`（目标 TS 5.9.3） | PASS | `build.log` |
| `npm test`（含新浏览器套件） | 70/70 PASS，skipped 0 | `tests.tap` |
| `npm run test:mutations` | 10/10 被断言杀死（原 6 + 新 4：`prompt-in-sidebar-slot`、`prompt-stamp-before-open`、`prompt-no-visibility-gate`、`prompt-ignores-hidden-window`） | `mutations.log`、`mutations/*.tap` |
| `npm run check:contracts` | PASS | `check-contracts.log` |
| `npm run verify:inputs` | PASS（hostApi 94，siblings 3） | `verify-inputs.log` |
| `pnpm install --frozen-lockfile --lockfile-only --ignore-scripts` | PASS | `lockfile.log` |
| `npm pack` + `scripts/check-package.mjs` | PASS，99 文件，deps 精确 | `npm-pack.json`、`check-package.log` |
| 浏览器套件跑**包内解出的** `lib/client.js` | 9/9 PASS | `packed-bundle-browser.tap` |

变异说明：`prompt-in-sidebar-slot` 只被 2/4 杀死而 3 仍过——可见性门把不可见的侧栏 dialog 关回，所以即使挂错位置也不再锁页面；两道防线各自独立有效。

## 依赖变化

仅新增 **devDependency** `react-dom 18.3.1`（精确，与已钉 `react 18.3.1` 配对；npm，MIT，https://github.com/facebook/react）。原因：浏览器测试需要渲染客户端 React 组件；运行时 ReactDOM 属于宿主（DSH/桌面壳）供给，不进 `dependencies/peerDependencies`，不随包（包 99 文件不变）。传递新增 `scheduler 0.23.2`（MIT）。无新 config。

## 未跑的门（如实）

- **REAL_HOST 隔离 profile 安装：NOT_RUN。** 本卡禁止碰研究 runtime、P04 已签 profile 与 P05 A 原始失败 profile；本次没有另起可用的桌面 runtime 拷贝。由不同 validator 在新隔离 `DSH_HOME`/HOME/端口装 rc.47 tgz 实跑。
- **REAL_NATIVE_UI：NOT_RUN。** 实施者无 macOS Accessibility，没有亲点原生界面；不得把 Chrome 结果当原生 PASS。WKWebView 与 Chrome 在「祖先 `display:none` 的 modal 不渲染但 inert」上表现一致（原生 precheck 已实测该现象），但 rc.47 在 WebKit 的实际可见性须原生复验。
- **REAL_LOCAL_PG / 冷启标志读回：NOT_RUN**（本卡不改服务端；由 validator 查 PG pending、`storages/hanamesh_core.json` 标志与冷启）。
- 下一步：PM 独立审查本地 commit → 不同 validator 在新隔离设备 + 一次性 PG 真实 Mac 原生入口：设置页开同意 → 不离开设置页看到提示 → 「以后再说」→ 标志只写一次 → Back to app 可点 → 冷启不再弹 → 设置页常驻绑定入口与「去网站绑定」系统浏览器路径；随后 PM 把 rc.47 纳入 P05 组合，从头跑 U01–U03。

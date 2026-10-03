# P06-CORE-APPHOST45-01 · Core49 精确消费 AppHost45

2026-10-03。判定：**Core 单 origin `PASS_LOCAL` / `🧪 DELIVERED`**。固定 Core49 包在独立官方 DSH Host 的安装、target HTTP、健康、卸载和冷启动重装门通过。P06 桌面原生组合、官网到客户端入口与用户 `ACCEPTED` 不在本判定内。

## 冻结身份与修改范围

- 唯一源码仓 `hanamesh-core`，分支 `codex/p06-core-apphost45`，基线 commit `ddeb136adfd666e02e6ebf915833be3e10e253bb`（Core48）。最终本地 commit/tree 由本轮 PM 回报固定；报告随该 commit 提交，避免自引用哈希。
- Core49 固定包 `artifacts/hanamesh-core-0.2.0-rc.49.tgz` SHA256 `ebc2f1eaa8a211a2427599cf4e348392d16f50c5de3f833388ff7db2c29fc781`。输入 AppHost45 `afc35169eaa90d81112643e1417f7a2463a7366975527a1f78e32725dcc91e5a`；Usage10 `c69c97a93eb5ad167b60a8ec0000a954e809f291879992b9eb24078d7756864e`；lib-provision1 `386d57361ccc3c8578f54cad8137acc291dd72e01b3ff987e65dfaa716f2e0b0`。DSH 脚手架 zod4.5.4 `51f51d886af1428713bf52b4e795afa43e2b43956b8483c9a92590f4c5a7b296`。
- 只改既有 AppHost dependency/dev tgz/override/lock、`vendor/siblings/SHA256SUMS`、suite profile、Core 关于版本、相应断言/文档/封包脚本；重新构建 `lib/client.js`、`lib/client/index.js`、`.build/client-cjs/client/index.js`。Usage10 与 lib-provision1 pin、Core 身份/同意/积分/首次提示逻辑、`src/dsh.mjs` 未变。没有新增 dependency/peer、产品配置项或随包 tgz。实现文件 `git diff --check` 通过；原样 TAP 诊断文本有测试框架输出的行尾空格，未改写原始证据。

## RED → GREEN 与固定包

| 门 | 实际命令及退出 | 原始证据 |
|---|---|---|
| RED | 在 Core48 只改最终断言后，`fnm exec --using 24.13.1 node --test --test-reporter=tap test/stage0.test.mjs test/health.test.mjs` → 1；真实 `ERR_ASSERTION`：AppHost45 期望 `satisfied`，实际 `incompatible`；版本期望 rc49，实际 rc48。 | [`evidence/red.tap`](evidence/red.tap) |
| GREEN 安装/构建 | 独立新 cache/store 的 `pnpm install --lockfile-only --ignore-scripts`、`pnpm install --frozen-lockfile`、`pnpm build` 均 0；Node `24.13.1`、pnpm `10.33.0`。 | [`evidence/lock-update.log`](evidence/lock-update.log)、[`evidence/install-frozen.log`](evidence/install-frozen.log)、[`evidence/build.log`](evidence/build.log) |
| GREEN 静态/全测 | `pnpm verify:inputs` 0；`pnpm check:contracts` 0；`pnpm test` 0，71/71、skip0。 | [`evidence/verify-inputs.log`](evidence/verify-inputs.log)、[`evidence/contracts.log`](evidence/contracts.log)、[`evidence/green.tap`](evidence/green.tap) |
| 真实变异 | `pnpm test:mutations` 0；10 个 mutant 均真实测试退出 1，输出 `ERR_ASSERTION` 与 `not ok`，不是字符串命中替代。历史 mutation 原件恢复；本轮 TAP 复制到新卡。 | [`evidence/mutations.log`](evidence/mutations.log)、[`evidence/mutation-tap/`](evidence/mutation-tap/) |
| 封包 | 两次 `npm pack --json --pack-destination artifacts` 的 SHA256 同为 `ebc2f1ea…c781`；`node scripts/check-package.mjs artifacts/hanamesh-core-0.2.0-rc.49.tgz` → 0，精确 runtime dependencies 为 Usage10/AppHost45。 | [`evidence/pack-first.sha256`](evidence/pack-first.sha256)、[`evidence/pack-second.sha256`](evidence/pack-second.sha256)、[`evidence/check-package.json`](evidence/check-package.json) |
| 包内 P05 回归 | 抽出固定 tgz 的 `lib/client.js`，`cmp` 与构建产物字节相同；对该**包内文件**跑独立真 headless Chrome 首次提示 9/9、skip0。 | [`evidence/packed-client-sha256.txt`](evidence/packed-client-sha256.txt)、[`evidence/packed-prompt-browser.tap`](evidence/packed-prompt-browser.tap) |
| 干净消费者 | 新目录、新 HOME/cache/store，以固定 tgz + 本地 override 在 pnpm `10.33.0` 安装 → 0。实际 Core49/Usage10/AppHost45；Core 客户端 SHA `43005d7d…c521`、AppHost dist 69 文件与输入 tgz 全部逐字节一致。 | [`evidence/consumer-install.log`](evidence/consumer-install.log)、[`evidence/consumer-probe.json`](evidence/consumer-probe.json) |

消费者准备时曾误用随包 pnpm `11.7.0`，该工具忽略 `package.json` override，公开 npm 对私有 Usage 返回 404；失败日志被纠正工具版本的成功日志覆盖，不能冒充原始证据，见 [`evidence/consumer-prep-failed.note.md`](evidence/consumer-prep-failed.note.md)。有效消费者安装的完整原始输出已保留。

## `REAL_HOST`：隔离官方 DSH 组合

官方 CLI `0.1.5-alpha.1` 字节 SHA256 `0ff7f1d72c4e0cbe14001709c81e20a04b70464118a7f78568952988e28f2ac5`；官方 Desktop Node `v24.13.1`；固定 pnpm `10.33.0`。完整 Node/pnpm/CLI SHA 与版本见 [`evidence/host/tool-sha256.txt`](evidence/host/tool-sha256.txt)、[`evidence/host/tool-versions.txt`](evidence/host/tool-versions.txt)。每条 DSH CLI 都经 [`harness/dsh.sh`](harness/dsh.sh) 的 `env -i`，同命令设置全新 HOME/DSH_HOME、空白 userconfig、隔离 cache/store。profile `p49`、Web `64962`、503 stub `64963`；只读本机 registry `127.0.0.1:4873`，override 指向已核五个本地 tgz。Core `serverOrigin`/`websiteOrigin` 都指回环 503 请求记录 stub，`allowSystemBrowser=false`；stub 仅见两次设备 challenge 的方法/路径/字节数，未有事件上传或外送。脚手架见 [`harness/`](harness/)，输入/配置见 [`evidence/host/clean-replay/inputs-sha256.txt`](evidence/host/clean-replay/inputs-sha256.txt)、[`evidence/host/clean-replay/logs/p49-scaffold.txt`](evidence/host/clean-replay/logs/p49-scaffold.txt)、[`evidence/host/clean-replay/logs/stub-requests.jsonl`](evidence/host/clean-replay/logs/stub-requests.jsonl)。

第三轮**全新且所有祖先非 symlink**的 RUN，`./docs/acceptance/p06-core-apphost45-rc49/harness/gate.sh` 真退出 0（pipefail 已生效）：

| 步骤 | 真实结果 |
|---|---|
| A 安装一次 | `dsh plugin add file:<Core49 tgz>` 0；node_modules Core49/Usage10/AppHost45、AppHost manager 和 Core client SHA 与输入/包内一致；三个 Hana loader id 各 1。 |
| B 首次启动 | 新 Host 进程启动；无 token 根路由 401，登录后 Core state/health 200，设备 ID 存在；约 2.5 秒后 Usage10/AppHost45 都 `satisfied`，`mode=normal`、`fault=null`。`/hanamesh/apps` 200；重复 loader 报错 0。 |
| B target HTTP | 认证主体 + 正确 Host/Origin/`x-hanamesh-client` POST `{packageName:"dsh-pet"}` → 202；读回当前目标。真实 wire `Host: foreign.invalid` → 403 `HOST_DENIED`；外部 Origin → 403 `ORIGIN_DENIED`；缺 CSRF header → 403 `CSRF_DENIED`；iframe → 403 `FRAME_CONTROL_DENIED`；合法 201 字符名 → 400 `TARGET_SEARCH_UNSUPPORTED`；拒绝均未覆盖当前目标。日志只保留 target ID 哈希。 |
| C 卸载与启动 | `dsh plugin remove hanamesh-core` 0；Core/Usage/AppHost loader 各 0，三包从 node_modules 移除；新进程可启动，Core/AppHost 路由 404。 |
| D 冷启动重装 | Core49 固定 tgz 重新安装 0；三个 loader 各 1，新的 Host 进程中 Core health 两件再次 `satisfied`；此前 target 内存态为 null，再次正负门同 B 通过；无重复 loader。 |

真实原始输出：[`evidence/host/clean-replay/gate.log`](evidence/host/clean-replay/gate.log)、[`evidence/host/clean-replay/logs/`](evidence/host/clean-replay/logs/)。三次 Host 启停及退出码在 `boot-summary.log`，所有 CLI 退出码在 `steps.log`，target 细项在 `probes.jsonl`。Host CLI 故障前置与脚手架排错未藏：首轮临时目录落 macOS `/var` symlink，被 AppHost 正确以 `UNSAFE_DATA_PATH` 拒绝，见 [`evidence/host/gate-first-run.log`](evidence/host/gate-first-run.log)、[`evidence/host/logs/B-first-run-var-symlink.boot.log`](evidence/host/logs/B-first-run-var-symlink.boot.log)；第二轮无 symlink RUN 已走完 A–D，但测试用 Node fetch 没有把覆写 Host 发上线路，误得 202，且旧 `probe | tee` 吞了断言退出码，该轮不得当 PASS，见 [`evidence/host/gate.log`](evidence/host/gate.log)。只修测试脚手架为原生 `http.request` 与 pipefail、另建新 RUN 后取得上述第三轮 PASS；产品源码与固定 tgz 均未改。

## 清理与未跑门

第三轮两个随机端口监听数 0，脚手架残留 DSH 进程 0，隔离 RUN（含一次性会话 URL）已删除；仅保留脱敏日志。见 [`evidence/host/clean-replay/cleanup-receipt.txt`](evidence/host/clean-replay/cleanup-receipt.txt)。本轮未触 `~/.dsh`、3080、P05 34815/Chrome、研究 runtime，也未 push/tag/npm/Release、部署或用生产凭据。

- `NOT_RUN`：DESKTOP rc21 的真实隔离原生随包/Core49/AppHost45/Usage10 组合；用户从官网详情进入客户端卡片并亲点安装；公开 npm 普通用户完整路径；P06 用户 `ACCEPTED`。
- `NOT_RUN`：P05 首次提示在**当前 Core49 桌面原生实例**的重验；本卡只证明固定包内客户端的独立 Chrome 回归。
- 本地 503 stub 与只读本机 registry 不能证明生产服务、账号、真实目录或公开分发。

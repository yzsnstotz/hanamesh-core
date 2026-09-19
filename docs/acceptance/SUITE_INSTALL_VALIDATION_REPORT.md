# HanaMesh 三件套 · 套件集成验证报告（O3）

> 本机 session · 2026-09-20 · 状态 **⚠️ PARTIAL**：阶段 1（一次安装）与阶段 2（T10 生命周期）全过；阶段 3（S06 授权边界，需 O1 宿主）与阶段 4（首轮演示）**NOT_RUN**。🧪 只有用户能签的 ACCEPTED 之前的上限；本报告不冒充阶段 3/4。
> 可重跑：`scripts/p1/verdaccio.sh <root> 4879` → `scripts/p1/publish.sh <root> real 4879`（+ 手动发 core 前一 rc 供升级场景）→ `scripts/o3/t10.sh <root> 4879`。

## ① 环境与版本表

| 项 | 值 |
|---|---|
| DSH | `0.1.5-alpha.1`（`hanamesh-dsh-runtime/runtime`，钉版）；真实桌面另见 ⑥ |
| Node / pnpm | 24.13.1 / 10.33.0 |
| 本地 npm 仓 | verdaccio 6.10.3 @ 127.0.0.1:4879（临时，proxy npmjs） |
| `hanamesh-core` | 0.2.0-rc.11 · sha256 `ca0836dcdb32c7efcd29a7433f3071f8bb8461f4728c01ca1dcccf3e26b139f9`（升级场景基线 rc.10 `21ee2d82…48595`） |
| `hanamesh-usage` | 0.2.0-rc.4 · `f8488b0797165b70cabf7542b4bb97b217bd547a62efbcf4e1499e0820d107a1` |
| `@hanamesh/dsh-app-host` | 0.1.0-rc.14 · `169c63d812efea0c1b64a6527d52c64b5f454046b18a7f4cb14467e390d7304c` |
| O1 宿主 | 阶段 1/2 未接（`serverOrigin: null`）；阶段 3 需 `hanamesh-server@0.2.0-rc.2` |
| 端口 | 每个 HOME 随机回环端口；3080 是用户桌面自己的 DSH（本报告未占用） |

## ② 阶段 1 · 一次安装三件（SI01–SI06）

`suite-o3-20260920/stage1/`（= 当日 `recovery-20260920/suite-install`）：全新隔离 `DSH_HOME` → `dsh plugin --profile core add hanamesh-core@<CORE_VER>` → 三包入 `node_modules`（+zod），profile `dependencies` 只有 core，`bundles` 末尾 `hanamesh-core`（SI01）；`--dump-config` 恰三条 `hanamesh-core / hanamesh-usage / hanamesh-app-host`，第三条 name 为包根（SI02）；启动三件 apply、无 duplicate/failed（SI03）；真实 Chrome：侧栏「应用库」「HanaMesh」、Settings 三段、HanaMesh 段同意开关默认关（SI04，`settings-hanamesh.png`）；`pnpm ls`：`hanamesh-core → @hanamesh/dsh-app-host + hanamesh-usage`，`@deepseek-ai/*` 由宿主提供不在 profile 内、zod 一份 4.5.4（SI05，`stage2/2a-pnpm-ls.txt`）；操作次数 1/0/0（SI06）。peer WARN（host-owned 包不在 profile manifest）= 已知 C20，非缺陷。

## ③ 阶段 2 · T10 五场景（SI07–SI13）

`stage2/T10-ops.md`（每行有日志文件名）：

| 场景 | 结果 | 判定 |
|---|---|---|
| 2a 全新安装 | 三条、三件 apply、deviceId 生成 | PASS |
| 2b-i 已有 usage 再装 core | usage 单独 apply（1 条）→ 装 core 后启动失败 `duplicate loader entry id: hanamesh-usage` → `plugin remove hanamesh-usage` 后三条 apply；`storages/hanamesh_usage*` 保留 | PASS（SI07） |
| 2b-ii 已有 app-host 再装 core | 同形：`duplicate loader entry id: hanamesh-app-host`；remove 后三条 | PASS（SI08） |
| 2b-iii 已有 core 再显式装 usage | 启动失败 `duplicate loader entry id: hanamesh-usage`；remove 后三条（双向互斥成立） | PASS（SI09） |
| 2c 升级 rc.10 → rc.11 | 版本表更新、仍三条、`deviceId` 前后相同 | PASS（SI10） |
| 2d-i 禁用 usage（patch `disabled: true`） | 启动成功；core 设置段组件行 usage=`inactive`/服务未就绪；无错误 | PASS（SI11） |
| 2d-ii usage 非法 config（`maxPending: 0`） | 整棵树失败、进程退出：`plugin tree failed to load: … hanamesh-usage: INVALID_CONFIG`；恢复 = 改回 config。宿主无单插件隔离失败（既定行为） | PASS（SI12） |
| 2e 卸载与数据保留 | remove core 后 `dependencies` 空、`bundles` 两条、`node_modules` 无三件；`storages/` 三 domain 文件保留；无 HanaMesh 可启动；重装后 `deviceId` 相同 | PASS（SI13） |

**用户须知（写进 README/市场条目）：** 已单独装过 usage/app-host 的用户，装 core 前先 `dsh plugin remove` 它们；反向亦然。失败是响亮的（启动即报 `duplicate loader entry id: <id>`），不会静默。**彻底删除数据 = 手动删 `$DSH_HOME/storages/hanamesh_core*.json`、`hanamesh_usage*.json`、`hanamesh_app_host*.json`（及 `hanamesh_library*`、`hanamesh_router*`）。**

观察：core 健康快照在 HTTP 就绪后 2 s 时把 usage 记为 `inactive`（fiber 尚未 active），6 s 后为 `satisfied` + 服务就绪；「重新检查」按钮即时刷新。不算缺陷，写入 P1 已知行为。

## ④ 阶段 3 · S06 授权边界（SI14–SI19）

| ID | 结果 |
|---|---|
| SI14 未同意零上传 / SI15 同意后上传 / SI16 撤回 / SI17 iframe 边界 | **NOT_RUN**（需 O1 宿主 rc.2 + 一次性 PG；core rc.9 的 REAL_SERVER 门已证明设备注册/签名读贡献可用，但 usage 上报与撤回未在真宿主跑） |
| SI18 不强制钱包 | PASS：三 tgz grep `wallet|metamask|ethers|web3|mnemonic` 只命中 core `vendor/srv-identity/contracts.d.ts` 一条注释「never implies … wallet permission」；设置段截图只有「去网站」 |
| SI19 日志无密钥 / `~/.dsh` / 3080 | 本报告所有 HOME 日志 grep `apikey|api_key|secret|bearer` = 0；隔离 HOME 未碰 `~/.dsh`；3080 由用户桌面占用，本报告随机端口。（用户当日另授权在真实桌面 `~/.dsh` 安装，见 ⑥） |

## ⑤ 阶段 4 · 首轮演示（SI20–SI23）

NOT_RUN：未配置目录源/`nodeBinary`、未接 Server/网站；Vibe 打开与「去网站」留待 O2 部署与 O4。

## ⑥ 真实桌面补充（不在 O3 矩阵内，但是最强的一次安装证据）

用户授权后，在用户本机 dsh-tauri **0.15.5**（内核 **DSH 0.1.5-rc.2**，不是 alpha.1）的真实 `~/.dsh/profiles/tauri` 上，用 `file:<解压目录>` + `pnpm.overrides` 一条命令装三件：三条 loader 条目、三件 apply、core 健康 normal、usage 服务在线、app-host 识别到用户已装的 Coding OAuth Gateway；设置整页形态下 HanaMesh 段完整。见 `recovery-20260920/tauri-desktop/`。说明：内核 rc.2 与插件 peer alpha.1 只产生 pnpm WARN，运行正常——`O4-DSH-VERSION` 的实测记录。

## ⑦ 缺陷回流表

| 发现 | 归属 | 处理 |
|---|---|---|
| core 侧栏底部按钮在整页设置形态停在 General | P1 | core rc.11 已修（本日） |
| `file:<tgz>` 依赖被 dsh-tauri 启动自愈当悬空卸掉 | O4/部署文档 | 用目录型 `file:`；写进 O4 与 P3 安装说明 |
| dsh-tauri 壳 `link:` 进 .app 的包在命令行 pnpm 下 chmod EPERM（macOS App Management） | O4 | 壳内安装不受影响；命令行安装需绕过；O4 fork 阶段评估 |
| core 健康快照启动 2 s 内 usage 显示 inactive | P1（观察） | 记录，不改 |

## ⑧ Checkpoint

- 做了什么：阶段 1 + 阶段 2 全部场景在钉版 DSH 隔离 HOME 跑通并留原始日志；脚本 `scripts/o3/t10.sh` 可重跑；真实 Tauri 桌面一次安装补证。
- 下一步：阶段 3 用 `hanamesh-server@0.2.0-rc.2` + 一次性 PG 跑 SI14–SI17；阶段 4 待 O2 部署与 O4 目录源。
- 什么还没验证：SI14–SI17、SI20–SI23。
- 新阻塞：无实现阻塞。

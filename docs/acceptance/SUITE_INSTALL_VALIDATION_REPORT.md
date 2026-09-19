# HanaMesh 三件套 · 套件集成验证报告（O3）

> 本机 session · 2026-09-20 · 状态 **⚠️ PARTIAL**：阶段 1（一次安装）、阶段 2（T10 生命周期）、阶段 3（S06 授权边界，真实 O1 宿主）全过；阶段 4（首轮演示）**NOT_RUN**。🧪 只有用户能签的 ACCEPTED 之前的上限；本报告不冒充阶段 3/4。
> 可重跑：`scripts/p1/verdaccio.sh <root> 4879` → `scripts/p1/publish.sh <root> real 4879`（+ 手动发 core 前一 rc 供升级场景）→ `scripts/o3/t10.sh <root> 4879` → `CORE_VER=<ver> node scripts/o3/s06.mjs <root> 4879`（一次性 PG + `hanamesh-server@0.2.0-rc.2`）。

## ① 环境与版本表

| 项 | 值 |
|---|---|
| DSH | `0.1.5-alpha.1`（`hanamesh-dsh-runtime/runtime`，钉版）；真实桌面另见 ⑥ |
| Node / pnpm | 24.13.1 / 10.33.0 |
| 本地 npm 仓 | verdaccio 6.10.3 @ 127.0.0.1:4879（临时，proxy npmjs） |
| `hanamesh-core` | 阶段 1/2：0.2.0-rc.11 `ca0836dc…b139f9`（升级基线 rc.10 `21ee2d82…48595`）；阶段 3：**0.2.0-rc.12** `39bff0105620b75818da4bce0f5e608bbe7badff9bae625374fc5916ba2a7530`（= rc.11 + 重钉 usage rc.5） |
| `hanamesh-usage` | 阶段 1/2：0.2.0-rc.4 `f8488b07…d107a1`；阶段 3：**0.2.0-rc.5** `d0e66da926174e5bf8843a850601fdd39225bb69dd9e0da60ef67935ce2575b4`（S06 暴露的契约缺口修复） |
| `@hanamesh/dsh-app-host` | 0.1.0-rc.14 · `169c63d812efea0c1b64a6527d52c64b5f454046b18a7f4cb14467e390d7304c` |
| O1 宿主 | 阶段 1/2 未接（`serverOrigin: null`）；阶段 3：`hanamesh-server@0.2.0-rc.2` + 一次性 PostgreSQL 17.6（23 迁移），core patch `serverOrigin` 指向它，usage `uploadIntervalMs: 5000` |
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

`stage3/s06.jsonl`（REAL_SERVER + REAL_DB + REAL_HOST）：

| ID | 结果 | 证据 |
|---|---|---|
| SI14 未同意零上传 | **PASS** | 起宿主后 core 已 `registered`；`consent=withheld` 期间 12 s + 装入一个应用包再启动 8 s，服务端 `usage.events` 计数 0，outbox `stopped/pending 0` |
| SI15 同意后上传 | **PASS（第二次）** | 第一次（usage rc.4）：同意后 153 条待传全部 `UPLOAD_UNAVAILABLE`、sent 0 → 根因两处契约缺口（body 信封、签名键序）→ usage rc.5 修复；第二次（core rc.12 + usage rc.5）：同意后 ≤3 s 服务端收下 **148 条**，每条 `deviceId/hanaRef/action/occurredAt/eventId/nonce/signature`（服务端验签通过）；`sourceHanaRef/targetRef` 不上线。重发得 duplicates 未单独触发（服务端幂等由 O1 E01 已证） |
| SI16 撤回 | **PASS** | 撤回后 usage `DELETE /v1/usage/me/devices/:id/events` 恰 1 次（attempts 1，`deletedEvents: 148`），服务端计数 0，outbox `pending 0`，本地事件 0 |
| SI17 iframe 边界 | PARTIAL | 未开应用；只有匿名 `GET /hanamesh/apps` → 401 `UNAUTHENTICATED`（阶段 1 探针）。完整 403 `FRAME_CONTROL_DENIED` 留阶段 4 |
| SI18 不强制钱包 | PASS | 三 tgz grep `wallet|metamask|ethers|web3|mnemonic` 只命中 core `vendor/srv-identity/contracts.d.ts` 一条注释「never implies … wallet permission」；设置段只有「去网站」 |
| SI19 日志无密钥 / `~/.dsh` / 3080 | PASS | 所有隔离 HOME 日志 grep `apikey|api_key|secret|bearer` = 0；隔离 HOME 未碰 `~/.dsh`；3080 由用户桌面占用，本报告随机端口 |

**观察（写进 P2 已知行为）：** 同意后首批上传的是「已装插件发现」得到的 148 条 `install` 事件——包括 `@deepseek-ai/*` 宿主自带包。这是 P2「已装插件发现」的设计（Loader 投影），但对用户意味着「同意」即上报本机全部已装插件名；简报 §A.4 口径下可接受，建议 P2 后续只上报非 `@deepseek-ai/*` 条目或在同意文案里写明。

## ⑤ 阶段 4 · 首轮演示（SI20–SI23）

NOT_RUN：未配置目录源/`nodeBinary`、未接 Server/网站；Vibe 打开与「去网站」留待 O2 部署与 O4。

## ⑥ 真实桌面补充（不在 O3 矩阵内，但是最强的一次安装证据）

用户授权后，在用户本机 dsh-tauri **0.15.5**（内核 **DSH 0.1.5-rc.2**，不是 alpha.1）的真实 `~/.dsh/profiles/tauri` 上，用 `file:<解压目录>` + `pnpm.overrides` 一条命令装三件：三条 loader 条目、三件 apply、core 健康 normal、usage 服务在线、app-host 识别到用户已装的 Coding OAuth Gateway；设置整页形态下 HanaMesh 段完整。见 `recovery-20260920/tauri-desktop/`。说明：内核 rc.2 与插件 peer alpha.1 只产生 pnpm WARN，运行正常——`O4-DSH-VERSION` 的实测记录。

## ⑦ 缺陷回流表

| 发现 | 归属 | 处理 |
|---|---|---|
| usage 上传 body 用 `{events:[…]}` 信封、签名键序用码点排序，与 O1 冻结契约（裸数组、固定六键顺序）不一致，真宿主全拒 | **P2** | usage rc.5 已修（本日）；core rc.12 重钉 |
| 同意后上报 148 条含 `@deepseek-ai/*` 宿主包的 install 事件 | P2（观察） | 记录；建议过滤或写进同意文案 |
| core 侧栏底部按钮在整页设置形态停在 General | P1 | core rc.11 已修（本日） |
| `file:<tgz>` 依赖被 dsh-tauri 启动自愈当悬空卸掉 | O4/部署文档 | 用目录型 `file:`；写进 O4 与 P3 安装说明 |
| dsh-tauri 壳 `link:` 进 .app 的包在命令行 pnpm 下 chmod EPERM（macOS App Management） | O4 | 壳内安装不受影响；命令行安装需绕过；O4 fork 阶段评估 |
| core 健康快照启动 2 s 内 usage 显示 inactive | P1（观察） | 记录，不改 |

## ⑧ Checkpoint

- 做了什么：阶段 1 + 阶段 2 全部场景在钉版 DSH 隔离 HOME 跑通并留原始日志；脚本 `scripts/o3/t10.sh` 可重跑；真实 Tauri 桌面一次安装补证。
- 下一步：阶段 4（首轮演示：Vibe 打开、两处使用记录一致、去网站）待 O2 部署与 O4 目录源/`nodeBinary`。
- 什么还没验证：SI17 完整 iframe 边界、SI20–SI23。
- 新阻塞：无实现阻塞。

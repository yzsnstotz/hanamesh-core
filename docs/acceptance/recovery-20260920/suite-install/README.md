# 套件一次安装 · 真实宿主门（本机 2026-09-20，🧪 证据，不是用户 ACCEPTED）

**问题：** 「现在完成的三件能不能直接装进本地 DeepSeek Harness Desktop 用？」

**做法：** 临时 verdaccio（127.0.0.1:4879）发布 core rc.10 / usage rc.4 / app-host rc.14（`scripts/p1/publish.sh <root> real 4879`；lib-provision 是 private 且已内联进 app-host，不发布）→ 全新隔离 `DSH_HOME`（`scripts/p1/fresh-home.sh`，DSH = `hanamesh-dsh-runtime` 钉的 `0.1.5-alpha.1`，随机回环端口，非 3080）→ `dsh plugin --profile core add hanamesh-core@0.2.0-rc.10` → `boot.sh` 起宿主 → 真实 Chrome（headless，CDP）换 token 进 UI。

**结果（REAL_HOST + REAL_UI）：**
- `plugin-add.log`：一条命令装入 `hanamesh-core`、`hanamesh-usage`、`@hanamesh/dsh-app-host` 三包（+zod）；peer WARN 为已知 C20（宿主自带包不在 profile manifest）。
- `dump-config.yml`：三条 loader 条目（`hanamesh-core` / `hanamesh-usage` / `hanamesh-app-host`，第三条 name 为包根）。
- 宿主起后：`/api/hanamesh/core/state` → health `normal`，组件 usage `satisfied 0.2.0-rc.4` 且 `serviceReady:true`（`hanameshUsage` 服务真在）、app-host `satisfied 0.1.0-rc.14`；`/api/hanamesh/usage/health` 200；`/hanamesh/apps` 200；浏览器启动图含 `hanamesh-core/client.js` 与 `@hanamesh/dsh-app-host/client.js`。
- UI（`ui-dom.json`、`*.png`）：侧栏「应用库」「HanaMesh」两个入口；Settings 导航含「供应商」「应用库来源」「HanaMesh」；HanaMesh 段完整渲染（互斥提示、设备 id、授权开关、绑定/网站按钮、组件两行、关于 `hanamesh-core 0.2.0-rc.10 · DSH 0.1.5-alpha.1`）；「供应商」段四家来源 `dsh-models absent`；「应用库」覆盖层打开，无目录源时显示 `CATALOG_SOURCE_REQUIRED`（无远端源的预期）。
- `boot.log` 无 error/duplicate。

**边界：** `serverOrigin`/`websiteOrigin` 为 null（未接 Server/网站，显示「未连接 / NOT_CONNECTED」）；没有配置目录源与 `nodeBinary`，应用库只到「需要来源」为止；DSH 首启的两个原生对话框（Internal Testing Notice / API key）由脚本按钮点掉。**未在 Tauri 桌面壳上跑**：本机 `/Applications/Deepseek Harness Desktop.app` 是 0.11.1、内核 DSH `0.1.2-rc.1`（三件钉 `0.1.5-alpha.1`），且官方 Tauri 壳硬编码 3080 而该端口正被用户自己的桌面占用——红线端口，未动。

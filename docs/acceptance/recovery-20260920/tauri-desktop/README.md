# 真实 Tauri 桌面（dsh-tauri 0.15.5，用户本机，非隔离）· 三件套安装与 UI 门 · 2026-09-20

用户授权（2026-09-20）：把本机 `/Applications/Deepseek Harness Desktop.app` 从 0.11.1 升到官方 0.15.5，直接在用户自己的 `~/.dsh`（profile `tauri`）上装三件并验证，不隔离、不备份。

**过程与事实：**
1. 0.15.5 aarch64 dmg（sha256 `3250f2e5…b8524b`，Developer ID 公证有效）替换 .app；首启：profile 由 `desktop` 迁为 `tauri`；旧 `node_modules` 为 pnpm 11 store 所建，0.15.5 复用用户 pnpm 10 → 「Startup failed」（store 不匹配）；按壳提示删旧 `node_modules` 重启后重建成功。
2. 内核：0.15.5 推荐 DSH **0.1.5-rc.2**；用户在壳的「核心引擎」页下载并切换（用户动作）。
3. 安装：`file:<tgz>` 依赖会被壳的启动自愈判为悬空（只认目录）→ 改为 `file:~/.dsh/hanamesh-local/<解压目录>`；两个兄弟包经 profile `pnpm.overrides` 指向本地目录，不依赖任何 registry。`~/.local/bin/dsh plugin --profile tauri add file:…/hanamesh-core` 一条装三件（`plugin-add-core.log`）。已知坑：pnpm 给壳 `link:` 进 .app 的包 chmod bin 时 EPERM（macOS App Management 保护 /Applications 内的包，仅壳自身进程可改）；本机用「把 9 个带 bin 的 fallback 软链换成拷贝」绕过，只影响本次命令行安装。
4. 结果（REAL_DESKTOP，内核 0.1.5-rc.2，插件 peer 钉 0.1.5-alpha.1 只 WARN）：三条 loader 条目；`/api/hanamesh/core/state` health `normal`、usage `0.2.0-rc.4` 服务在线、app-host `0.1.0-rc.14`；侧栏「应用库」「HanaMesh」；设置页（用户 profile 装有 dsh-better-sidebar，设置为整页形态）含「供应商」「应用库来源」「HanaMesh」三段；HanaMesh 段完整（`tauri-settings-hanamesh.png`）；「供应商」段自动识别用户已装的 Coding OAuth Gateway（configured，5 个模型）；「应用库」在无目录源时显示 `CATALOG_SOURCE_REQUIRED`（预期）。
5. 缺陷与修复：core rc.10 的侧栏底部「HanaMesh」按钮只认 DSH 默认设置对话框，在整页设置形态下停在 General → **rc.11** 改为对话框/整页两种形态都能定位「HanaMesh」入口；重装后 `tauri-footer-click.png` 直达 HanaMesh 段。

**未做：** 未连接 Server/网站（`serverOrigin`/`websiteOrigin` 为 null）；未配置目录源与 `nodeBinary`；未在此桌面上跑 Vibe。这些是 O3/O4 与 Server 部署后的事。

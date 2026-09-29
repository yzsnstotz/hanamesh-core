# CORE37 / APPHOST35 有限组合封条

2026-09-30。origin `hanamesh-core` 唯一 writer；基线 CORE36 `f850b7a64981fb37140505739e50387ca6bf8c3e`。研发切片 P01-U02/P08 → 实际消费者本机 CORE37 / USAGE9 / APPHOST35 / VIBE30 → 父产品组合 checkpoint。CORE 本仓只负责套件版本及组件范围，不替 APPHOST 实现 heartbeat，也不替 VIBE 实现运行时行为。

仅更新 CORE 37 与 APPHOST 35 的精确 `dependencies`、dev vendor、pnpm override/lock、suite profile、输入 SHA、静态断言、既有 publish 脚本的候选路径、README 和“关于”版本字面量。`scripts/p1/publish.sh` **没有执行**。APPHOST35 输入 `vendor/siblings/hanamesh-dsh-app-host-0.1.0-rc.35.tgz` SHA256 `3a4f272385edcc32bfc7d24066b5f51e345bce5d2d7940bab782fb1c5b46591a`；USAGE9 SHA256 `57733078cffecd546e6d970a23882fc8b21120f41c8022e0cdeb9eae3560881f` 与 PROVISION1 SHA256 `386d57361ccc3c8578f54cad8137acc291dd72e01b3ff987e65dfaa716f2e0b0` 原 tgz 保持逐字节相同。`profile/cordis.patch.yml` 保持逐字节相同；`src/client/index.ts`、`lib/client.js`、`lib/client/index.js`、`.build/client-cjs/client/index.js` 与基线相比仅“关于”文字从 36 变 37。没有新增依赖、配置项、插件间 import 或 CORE 行为。

本次 SOURCE/PACKAGE 门：Node 24.13.1 / pnpm 10.33.0 / TypeScript 5.9.3 严格 build PASS；`check:contracts` PASS；`verify:inputs` PASS（hostAPI 94、siblings 3）；`pnpm test` 54/54 PASS；离线 frozen-lock install PASS（实际解析 APPHOST35、USAGE9、PROVISION1）；`pnpm pack` + source-free `check-package` PASS。定向静态断言先在 CORE36 基线观察到 RED（期望 37、实际 36），再更新 pin 得到 GREEN。命令输出见 `raw/`；没有重跑历史 mutation 门，本次是元数据精确钉值切片。

产物 `artifacts/hanamesh-core-0.2.0-rc.37.tgz` SHA256 `c1906146e61863bb4cf3dbdc98f6591cf7c9313ac58fa9eabe0f21297023913f`，99 个包成员，`package.json` 与 `suite.profile.json` 版本及 APPHOST35 范围相符。包按原 `files` 规则不含 siblings tgz；本机组合须由父 checkpoint 使用固定 file 输入安装。包检查不等于真实 DSH 安装、真实 UI 或产品 PASS。

最终 CORE37 / USAGE9 / APPHOST35 / VIBE30 组合安装、可见页面超过 90 秒、heartbeat、关闭释放、冷重启及 P01 完整流程，由不同 validator 在隔离 profile 运行；本仓未运行这些 REAL_UI 门。未改 STATUS、其他 origin 或验收 profile；未碰凭据、DB、`~/.dsh`、3080、研究 runtime；未推送、发布或部署。最高状态仅候选 SOURCE/PACKAGE PASS，ACCEPTED 只由用户给。

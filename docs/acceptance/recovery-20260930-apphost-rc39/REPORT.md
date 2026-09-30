# CORE41 · APPHOST39 精确组合

2026-09-30。本仓只负责 HanaMesh Core 套件依赖、profile 与显示版本的精确重钉，产品步骤 P01 U01/U02/U04/U05，实际消费者为本机 HanaMesh Mac rc.19 隔离 profile。缺陷修复在 APPHOST39 原 origin；Core 的设备身份、同意、积分逻辑未改。

固定依赖 `hanamesh-usage 0.2.0-rc.9`、`@hanamesh/dsh-app-host 0.1.0-rc.39`；vendor SHA-256 后者为 `c6b829371db4367f108849f9d2d0e4a67294aebb7c80514b80cc61bc95d75321`。`hanamesh-core 0.2.0-rc.41` tgz SHA-256 `ce0a0c62190f8327c298c1bcbef66c44079aef90763dbf0b2f45900feb9a6f1c`，仅发本机私有 registry。

Node 24/pnpm 离线安装、`build:offline`、54/54 测试、`verify:inputs` 与 `git diff --check` PASS。原生隔离 UI 在冷启动前后实读 Core41、Usage9、AppHost39；同设备绑定、同意和生产积分可读。完整产品判定以不同 validator 的 P01 报告及 `STATUS.md` 为准，不能用本仓包门代替。

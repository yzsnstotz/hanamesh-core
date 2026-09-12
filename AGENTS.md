# HanaMesh 客户端研发总则

以 DSH 为宿主、Tauri 为薄壳，普通 UI、Harness 适配和业务接入优先通过标准 DSH 插件实现；先复用成熟能力，只补明确缺口，不重写内核或把业务搬进壳。一个实际插件默认一个独立 repo，一次用 Codex 或 Claude 原生编排交付一个范围明确、可安装可验收的版本；内部小步验证并连续收尾，不把微任务退给用户调度，不让 Meridian 或重流程成为前置。只写本仓，跨插件只用锁定产物和公开契约；配套 host/UI 保持一致，独立开发不等于任意热升级。开发前查本仓及共享 learning，结束时沉淀问题、失败尝试、有效解法、适用版本和回归证据。交付真实包、最小集成结果与简短限制说明；测试替身不冒充实测，缺权限不扩权，基础缺陷不靠跨仓重构掩盖。

本地执行时先读文档仓 STATUS.md 与当前模块 KICKSTART，沿用 MODEL_POLICY.md 的默认模型；依赖已由用户验收才开工，一个主 agent 负责到底，独立模块按用户派发并行且隔离环境；状态和产物只写 STATUS.md，本地 commit，不因收尾自动 push；工具名不同可直接读 laws／learnings 文件，不新建编排层。

## 本仓写入与安全边界
仅修改 hanamesh-plugin-identity；vendor 中的公开契约与输入 tarball 是只读锁定证据。
不写 DSH session 事件；只用 storage-domain 单 global 发布非授权观察。
不创建账号系统、授权账本、JWT、grant；不将 UI 状态当作资源授权。
凭据仅驻留宿主私有内存，不进入 SDK、sidecar、日志或 iframe。
不修改共享 STATUS；四字段 checkpoint 放在 docs/acceptance/AC-24.md 末尾。
未经本次授权不建远端、不 push、不发布、不建数据库、不访问真实账号。

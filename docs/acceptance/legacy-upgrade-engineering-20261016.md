# 历史升级与可见启动诊断 · 工程回执

2026-10-16，官方 DSH0.2.0-rc.2。此前全新隔离配置测试通过，没有覆盖 owner 历史数据；本次补测并修复该路径。用户操作入口与包哈希见 [owner 原地升级说明](./OWNER-LEGACY-UPGRADE-20261016.md)。

真实异常：Usage rc.31 在读取 `hanamesh_usage_events` 时抛 `DomainError/invalid-record`；3条旧 rejected 事件的规范16字节 base64url nonce 被当前新事件 token 校验拒绝。9月11条 records 正常。完整证据与边界见 Usage `docs/compatibility/legacy-storage-rc32.md`。

Core0.3.8 从宿主公开 Loader 的 failed Fiber.await() 观察真实错误，只保留有限的代码与已知 domain。诊断有超时界限；未知异常、恶意 getter、迟到拒绝均不会使健康检查挂起或泄露任意 message/stack/cause/私密路径。可识别存储格式、版本、后端、介质及宿主配置校验错误；裸 ZodError 不擅自判定为插件配置错误。

健康接口和设置页显示相同的具体原因与下一步。此例为 `invalid-record（hanamesh_usage_events）`，指导备份、保留数据、安装兼容版本、完全退出重开、再检查。repair 与新受保护操作拒绝仍保留；不会因为添加诊断就伪造 normal。已恢复时仍要求资源端逐次检查。持久化健康 DTO 保持原字段，用已有 reason/nextStep 承载安全诊断。

## 最终执行证据

- Core目标 build、输入/工具链检查、strict公开类型检查、186/186完整测试、39项合同检查、6项实际变异通过；最终包58项入口/strict类型消费者通过。聚合 preflight 含硬编码 owner 路径的全局 dsh shim，未调用，改跑对应独立检查。
- 官方未改动 rc.2 桌面 + Core0.3.8/Usagerc.31/同一历史副本：真实 failed、repair/reject；真实设置页的可见组件区域显示具体 invalid-record 和重启步骤，已截取只含组件文本的图片。
- 官方随包 CLI 在同一隔离 profile 原地升级 Usage rc.32：重启后 Usage satisfied/active、Core 自动 normal，11旧汇总及176旧事件逐条不变。真实 Usage 设置页可读历史并生成1条带签名 open；再重启仍正常。AppHost0.6.2 unchanged。
- 后端在隔离副本明确关闭；没有连接 owner34440/48606 或 api.hanamesh.com，没有模型/网站积分验收声明。本轮未重跑 alpha.2 实际宿主，不能把类型消费者当作 alpha 桌面通过。
- 仅读取 owner 明确授权的五个文件；私钥副本仅在权限0700本机隔离根内，结束已删。owner 的真实 profile 未修改，其活跃宿主仍自行写健康文件。

红绿记录覆盖实际新诊断及历史兼容；有一份重启文案测试首次命令从错误 cwd 运行，仅为 runner precondition 错误，未计作断言红测。其后的正确目录186项测试通过。独立源码审阅未发现额外P1/P2；Usage审阅指出的旧记录重发P2已修并复核关闭。审阅本身没有额外运行桌面或构建。

脱敏日志、失败/恢复组件截图、比较结果与 SHA256SUMS 在 `/Users/yzliu/.cache/hanamesh-runs/session-g-upgrade-20261016/`。无私密存储、完整事件或密钥被提交。所有本轮隔离进程/临时目录及安装依赖用完清理，已跟踪 lib/.build 交付保留。本次仅本地 main 提交，无新标签、不推送、不发布、不部署；owner 原环境升级与真实使用→网站积分仍待亲测，不是 ACCEPTED。

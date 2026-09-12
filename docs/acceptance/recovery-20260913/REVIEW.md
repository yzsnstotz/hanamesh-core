# 2026-09-13 独立回收判定：plugin-identity

来源是 `_deliveries/` 原包、本仓还原后的 `main` 和本目录新跑的日志。原始交付树与归档未改；本目录为回收者新增证据。交付方自报的 `PARTIAL` 未被升级为 `DELIVERED` 或 `ACCEPTED`。

- 通用门：原包 npm ci=1（错误的 ui-kit peer）；补齐正确 scoped peer、锁定 ui-kit tgz 和 devDependencies 后，干净副本 npm ci=0、目标 build=0。见 `install.log`、`build.log`；备用安装日志仅证明备用路径。
- 本地回归：43/43；2/2 变异（干净副本重跑）。见 `test.log`／`test-fixed.log`、`mutation.log`／`mutation-fixed.log`。通过的 fixture 不替代真实矩阵。
- 独立发现：原包 ui-kit peer 名错误；现已修为 @hanamesh/ui-kit 并纳入已验收 tgz（SHA256 26097a60…），但实际页面尚未消费官方样式。
- 真实宿主补测：固定 research DSH 0.1.5-alpha.1、独立 `DSH_HOME` 的 `web` profile 中 `dsh plugin add` 退出 0（报告缺失 peers、并提示未声明 `dsh.bundle`，故手动在隔离 profile 插入插件行）；启动后匿名 `/` 与 `/hanamesh/identity` 都为 401，token 换 cookie 后登录页与脚本均为 200，SIGTERM 退出 0。见 `real-install-attempt.log`、`real-config.log`、`real-host-auth-attempt.log`。这只证明本包可在真实宿主加载和展示登录页，没有真实 SRV-01 身份往返，也不关闭 D02/D05/D07。
- 补齐证据：`package.json`、`package-lock.json` 与新增 `vendor/hanamesh-ui-kit-0.1.0-rc.3.tgz`；无 `node_modules` 的独立 Git 归档副本 `npm ci`、目标 TS 5.9.3 build、43/43、2/2 均退出 0。见 `frozen-install-fixed.log`、`target-build-fixed.log`、`test-fixed.log`、`mutation-fixed.log`。原 rc.1 tgz 尚未重包；上面的真实宿主加载证据来自原包，不把本次 metadata 修正冒充已在宿主重测。
- 判定：范围缺口仍在，保持 `PARTIAL`（⚠️）。没有填写用户签名，也没有把清单草稿定稿。
- 最小后续：依赖/锁图与目标 build 已补齐；补真实 DSH+SRV-01 登录、伪造身份和资源端拒绝；完成 D09 视觉。

证据类型以各日志和模块验收矩阵为准；`preflight.log` 只说明条件可见性，不代表真实验证。隔离测试没有访问个人 `~/.dsh` 或 3080。

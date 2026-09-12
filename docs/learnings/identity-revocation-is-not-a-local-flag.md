# 撤销不是本地标记；测试子进程退出零也不代表断言运行过

ID: `identity-revocation-and-child-test-context`
模块／标签: MOD-02, plugin-identity, credentials, mutation, consistency
证据类型: SOURCE + CONTRACT_FIXTURE + REAL_PROCESS_FIXTURE_MEDIA；**不是 REAL_HOST / REAL_API**
适用基线: DSH 0.1.5-alpha.1 @ 5dda764ed3aa172535a7967b06ff95d9cbfe536a；SRV-01 0.1.0-rc.1 / sha256 19b54a32841647a99ed04883833461c0702f2b073567204d718c2e042cdce557。
实际环境: Linux x64，Node 22.16.0，TypeScript 5.8.3，npm 10.9.2；2026-09-13 Asia/Tokyo（原始日志按运行时 UTC，可能显示 9 月 12 日）。
可见性: INTERNAL

## 问题／目标

登录与远端撤销是跨介质操作，本地 UI、sidecar 和远端 session 不能一起提交。只把 UI 改成退出既不能证明远端已撤销，也不能阻止迟到响应恢复本地凭据。重启后的空 cookie sign-out 更不能证明旧会话已撤销。

## 复现／证据

`test/controller.test.mjs` 覆盖 abort-ignoring 登录迟到、资源响应越过退出、存储先关闭、撤销失败重试以及新 session 退出不能清掉旧撤销未知记录。`test/edges.test.mjs` 覆盖超时后迟到 cookie 和显式账户切换。

`test/crash.test.mjs` 在 fsync/rename 检查点与远端事实文件提交后，通过真实子进程 IPC 抵达注入点再 SIGKILL。远端是文件事实替身，非真实 SRV-01。基线只有安全侧残留；反序变异让独立 checker 出现 `ERR_ASSERTION`。完整原始输出在 `docs/acceptance/crash/`。

首次运行跨介质 checker 时，父 node:test 环境变量 `NODE_TEST_CONTEXT` 被继承，子进程警告递归运行并跳过文件，竟然 exit 0。反序测试要求非零退出，所以本轮 harness 自己抓住了这个假绿。历史原始警告保存在 `docs/acceptance/history/nested-checker-first.log`，首轮失败在 `history/crash-harness-first.tap`。

## 修复／复用办法

退出先 fence generation 并阻断新操作，服务端确认后才发布撤销完成。Cookie 只用于已有凭据的重试；缺 cookie 的 200 不作撤销证明。重启继承的未确认记录在新 session 退出后仍保持；需要真实服务端恢复流程，不新增猜测接口。

跨 process node:test 检查前移除 `NODE_TEST_CONTEXT` / `NODE_TEST_WORKER_ID`。始终显式 `--test-reporter=tap`；不仅检查 exit code，还要检查实际测试数量，反序变异必须 `not ok` + `ERR_ASSERTION`，模块导入失败或测试被跳过不算被杀。

## 防止重犯与适用限制

`npm test` 和 `npm run test:mutation` 保留回归。不要把“有 SIGKILL”升级为“真实 DSH 介质一致性已验证”；本轮只是实际终止了运行生产 controller 的测试子进程。回收者还必须在固定 DSH backend 与真实 SRV-01 上复验 X02/X03。

另一项修复是测试源码扫描原先把“禁止 localStorage”的注释匹配成真实使用；已收紧文案消除该误报，历史结果保留。目标宿主、浏览器与 ui-kit 未运行，不把它们记为已验证适用范围。

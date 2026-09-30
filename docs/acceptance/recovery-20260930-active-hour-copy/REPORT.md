# Core rc.43 · P01-U04 活跃小时文案

- 产品步骤：原生客户端「我的 Hana」读回积分来源与本设备近 90 天真实贡献事件。
- 实际消费者及组合节点：DSH 原生设置页消费 Core 客户端 bundle；与 Usage rc.9、AppHost rc.39、Vibe rc.34、Server rc.19 的有限产品组合由主任务重装并交给独立 validator 复验。
- 修复 origin：`hanamesh-core`。原 `use` 的「使用贡献/使用」容易被理解为模型调用，现积分类型与事件动作同标「应用活跃小时」；说明其按授权视图应用网关请求计算，可能包含后台请求，不代表模型调用次数，也不等于逐笔积分。计分、事件、签名、分页、依赖未修改。
- TDD：新增精确文案回归先在 rc.42 源码失败，再改展示文案；目标 Node 24.13.1 构建成功，`npm test` 61/61，`npm run verify:inputs`、`npm run check:contracts`、`npm run test:mutations`（6/6 预期断言失败）及 `node scripts/check-package.mjs` 均通过，`git diff --check` 无差异错误。
- 本机封包：`artifacts/hanamesh-core-0.2.0-rc.43.tgz`，SHA-256 `deab7ce0248d23a9892e26287f3cca1291e61b037078eeacda2d3f9bbe2f2274`。这是 Core 源码/封包门；**本报告不声称原生产品复验或用户 ACCEPTED**。

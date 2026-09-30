# CORE42 · P01-U04 原生积分来源与本设备事件

- 唯一 origin：`hanamesh-core`，本地分支 `codex/core-usage-rc8`；固定 `hanamesh-usage 0.2.0-rc.9`、`@hanamesh/dsh-app-host 0.1.0-rc.39`，没有新增依赖或修改邻仓。
- 实际消费者：`/Applications/HanaMesh.app` → HanaMesh 设置 →「我的 Hana」「贡献事件」；组合节点 `PRODUCT.P01.compose` 的 U04。完整 P15 不由此判 PASS。
- 产物：`artifacts/hanamesh-core-0.2.0-rc.42.tgz`，SHA-256 `a693cdae44562041b3b178d0491e26b7e1e9462eac06563e1aff9fe354e31b28`。仅供本机隔离 DSH profile 安装；未推公开远端或 npm。打包后适配检查发现新活动路由未在 DSH 注册为 GET；首次本地包从未安装或分发，修正后覆盖未发布候选，本文摘要只对应最终字节。

## 缺口判定与修复

rc.41 把六类账本分项和截断 UUID 塞在一行；`/v1/custody/me/points` 不提供逐事件历史。rc.42 仅在 Core 宿主侧用公开 Registry profile 补 `displayName`（失败回退短 ID），界面显示非零的按类型积分汇总，并将分类差额诚实标成「其他账项」。`GET /api/hanamesh/core/activity` 用本设备 Ed25519 签名读 Usage 已有的原始事件接口，服务端 URL 带查询但 canonical 签名只用 pathname。宿主严格验证返回的时间、动作、数量、升序和 opaque 游标，并只给浏览器 `hanaRef/action/occurredAt`；不暴露签名、nonce、主体、回执。未同意、未注册或上游失败均不伪装成零事件。

Usage 原有接口按发生时间升序。客户端每轮最多取 5 页 × 200 条；只有游标抵达尾部才把最新 25 条倒序显示。超过本轮扫描预算时显示已扫描条数和「尚未抵达最新」，让用户继续读取；不会把旧安装事件冒充最近活动。每条事件不标分值，因为去重、封顶、绑定归属等只能由 Custody 权威账决定。列表限本设备近 90 天、未撤回且仍在原始保留期的事件，不代表账号所有设备或逐笔账。

## 本仓验证

| 门 | 本次结果 | 原始证据 |
|---|---|---|
| 先写测试再实现 | RED：名称缺失、活动路由 404、非法查询 404、旧首页误把首批升序事件当“最新”；GREEN 后全部通过 | `test/points.test.mjs`, `test/activity-client.test.mjs`, `test/client.test.mjs` |
| Node24.13.1 / TS5.9.3 / pnpm10.33 构建 | PASS | `npm run build` exit 0 |
| 单元 / 宿主适配 fixture | 60/60 PASS | `unit.tap` |
| 六个既有变异 | 6/6 assertion failure | `mutation.log` |
| 锁定真件与公开契约类型 | PASS | `inputs.log`, `contracts.log` |
| tgz 源码隐藏检查 | PASS，包名/版本/依赖/客户端 bundle 均一致 | `node scripts/check-package.mjs artifacts/hanamesh-core-0.2.0-rc.42.tgz` exit 0 |
| DSH 原生 route 注册 | Core adapter fixture 验证 `activity` 是 GET；新增 RED 曾揭出最初误注册 POST，修正后 PASS | `test/fixtures/adapter-check.test.mjs` |

## 尚未跑的产品门

本仓测试只是 Core 契约与产物验证。**本报告未把 rc.42 装入真实 `/Applications/HanaMesh.app`**；组合负责人需在原 P01 隔离 `DSH_HOME` 更新本机私有 registry/安装包，从真实设置入口核对可读名称、非零分类、真实 Vibe 使用事件时间与类型、同账号网站权威积分、刷新和冷恢复，再交不同 validator 独立复验。该真实门通过前状态为 `PARTIAL`，不是用户 `ACCEPTED`。

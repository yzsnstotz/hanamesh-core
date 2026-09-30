# Core45 · AppHost40 精确套件接线（2026-10-01）

**判定：SOURCE + PACKAGE PASS；P01 整卡和 REAL_NATIVE_UI 尚待独立组合验证。** 本次只改 `hanamesh-core` 原 origin 的精确依赖、profile 版本、锁、固定 sibling 包和静态断言；没有修改 Core 身份、同意、积分或事件行为，没有安装到当前 validator profile，也没有推公开 origin。

| 固定输入 | 身份 |
|---|---|
| Core 起点 | `0.2.0-rc.44`，本地提交 `601064d`；Usage `0.2.0-rc.10` 保持不变 |
| 新 AppHost | `@hanamesh/dsh-app-host 0.1.0-rc.40`，tgz SHA-256 `81de63e344bb6aab955ca8789d74a3172c72bb4b5acb23210cd6b4d5e4d6491d` |
| Core 目标 | `0.2.0-rc.45`，tgz SHA-256 `9eae451824ec6f1d12bce8f343a4f086d61a093730a78aefb2ae0cf590b9718d` |
| 产品绑定 | `P01` 原生设置的组件健康与安装前置（U01/U02）、关闭后重开及冷恢复（U05）；实际消费者为 Desktop19 原生客户端的一装三件套，组合节点 `MAC-COMPOSE`。AppHost40 的视图修复归 AppHost 原 origin，本包只提供其固定消费者。 |

验证顺序：先将 `test/stage0.test.mjs` 固定为 Core45/AppHost40，运行 `node --test --test-reporter=tap test/stage0.test.mjs` 得 1 项 `ERR_ASSERTION`（实际 Core44）；随后只更新版本接线，重新运行同测试 5/5 PASS。Node `24.13.1`、pnpm `10.33.0`、TypeScript `5.9.3` 下完成：`npm run build` PASS；`npm test` 61/61；`npm run test:mutations` 6/6 均为断言失败检测；`npm run check:contracts`、`npm run verify:inputs` PASS（host API 94、sibling 3）；`pnpm install --frozen-lockfile --lockfile-only --ignore-scripts` PASS。`npm pack --pack-destination artifacts --json --ignore-scripts` 得 99 文件；`node scripts/check-package.mjs artifacts/hanamesh-core-0.2.0-rc.45.tgz` 从包解压验证 deps、patch、公开导出和无跨插件 import，PASS。tgz 摘要已登记 `artifacts/SHA256SUMS`。

范围核对：`profile/cordis.patch.yml` 的三条 Loader 入口字节未动，Usage10 与 lib-provision1 tarball 未动，Core `src` 只把“关于”中的自身版本号改为 rc.45；没有新增依赖或配置。`pnpm-lock.yaml` 的 AppHost40 integrity 与新 tgz 一致，并将两个 peer 范围按包内 `package.json` 校正为 `>=4.0.2 <5`、`>=0.1.5-alpha.1 <0.2.0`。构建生成的 `lib/client.js`、`lib/client/index.js` 和 `.build` 只有该版本字符串变化。

**仍未验证：** 本包未装入独立原生 profile，未证明 AppHost40 长闲置后关闭/打开响应时间或整个 P01 U01–U05。需由不同 validator 在隔离 DSH_HOME/端口按最终 Core45/Usage10/AppHost40/Vibe 对应 peer 的固定组合实走，用户 `ACCEPTED` 不由本报告给出。公开 origin、本机私有 registry 与生产未写入。

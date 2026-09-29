# CORE rc33 有限组合返回（2026-09-29）

## 范围与身份

- 唯一 origin：hanamesh-core；base `d8680d59e2a6dde3e898482568d584c94df7eb3b`（rc32），独立 worktree 分支 `codex/core-usage-rc8`。原仓 main 未改，未 push/tag/发布。
- 用户本机修复授权的有限产品计划：`PRODUCT_DELIVERY_PLAN.json` SHA256 `bb066b5eaacb59ae214e47d578c2f47c400ff7310b9698df4f797646d1f529b5`。全量父 runner 未启动。
- 产品消费者：desktop 市场/CORE 同意 UI；组合节点 `PRODUCT.P04.compose` 与 P01 `MAC-COMPOSE`。
- 固定：CORE `0.2.0-rc.33` + USAGE `0.2.0-rc.8` + APPHOST `0.1.0-rc.32` + PROVISION `0.1.0-rc.1`。USAGE origin 的行为修复由 commit `73e89961d9962d7236ecebeeb9b84bb61a2b9ecb` 提供，CORE 不补 USAGE 行为。
- 契约：保持既有 CORE 服务/HTTP/存储 schema；只改依赖、vendor 输入、lock、suite profile、版本元数据/测试 pin。源码与生成输出仅“关于”版本文字 rc32→rc33；无新 dependency/peer/import/UI 功能。

## 复现与最小修改

原 `scripts/verify-inputs.mjs` 的 regex 仍接受 APPHOST rc31，实际 SHA256SUMS 及 vendor 为 rc32；原版运行在实际 rc32 行触发 ERR_ASSERTION（见 raw/baseline-verify-inputs-red.log）。仅把 APPHOST regex 改为当前真实 pin rc32，并把 USAGE 输入改 rc8；之后 hostApi94/srvIdentity/semver/siblings3 全部通过。

APPHOST/PROVISION 的 tarball 与 base 逐字节相同，lock 仅 USAGE rc7→rc8 及新 tarball integrity 改动。CORE tgz 按原 files 白名单打包，不内嵌 vendor/siblings；真实 profile 必须分别提供固定同链产物/既有 override，不能用包检查代替安装。

## 验证（本次 SOURCE/PACKAGE，不是 REAL_UI）

工具链：macOS arm64，Node v24.13.1（显式 fnm 二进制），pnpm10.33.0，TypeScript5.9.3。npm 缓存临时隔离，pnpm store `../core-pnpm-store`。没有读取/加载生产凭据，没有被测 Codex 调用。

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| pnpm install --no-frozen-lockfile --ignore-scripts | PASS | 分支外 core-raw/install.log |
| pnpm install --frozen-lockfile --offline --ignore-scripts --store-dir ../core-pnpm-store | PASS，锁已同步，离线无重新解析 | raw/frozen-install.log |
| npm run verify:inputs | PASS（94 个宿主 API 输入，3 个 siblings digest） | raw/verify-inputs-green.log |
| npm run build | PASS，--target；仅版本显示生成差异 | raw/build.log |
| npm test | 54/54 PASS，0 skip | raw/tests.tap |
| npm run check:contracts | PASS | raw/contracts.log |
| npm run test:mutations | 6/6 mutants 均因 ERR_ASSERTION 失败；非语法/缺模块假阳性 | raw/mutations.log；完整 TAP 保留分支外 core-raw/mutations/ |
| npm run test:crash | 2/2 PASS | raw/crash.tap |
| npm pack --pack-destination ../ --json | PASS | 分支外 core-raw/pack.json |
| node scripts/check-package.mjs ../hanamesh-core-0.2.0-rc.33.tgz | PASS，source-free import、suite deps、服务 keys、无 sibling import | raw/check-package.log |
| git diff --check | PASS | 本机命令 |
| 源码/生成物 diff 逐字节归一化 rc32→33 与 base 比较 | PASS，只有版本文字 | 本机断言 |
| APPHOST/PROVISION tgz 与 base 逐字节比较 | PASS | 本机断言与固定 SHA |

不运行 preflight（其探测涉及研究 runtime），不执行现有 publish.sh（只机械更新版本），不使用本机 registry，也未改 desktop source。

## 产物

| 包 | SHA256 |
| --- | --- |
| hanamesh-core-0.2.0-rc.33.tgz | `4ce6bc9e67c654b20eb61c7c65e3e9cb2d4ae8c688c5461da7e4a68a1c99afcd` |
| hanamesh-usage-0.2.0-rc.8.tgz | `81a3b325265b235bad8558cd683bd555f2fe7b2ca2a69ccf113ad5d56a729a8d` |
| hanamesh-dsh-app-host-0.1.0-rc.32.tgz | `40fc5d2aab0845ae7922669d9378337a2399fae65c629405002a8cb2887867e8` |
| hanamesh-lib-provision-0.1.0-rc.1.tgz | `386d57361ccc3c8578f54cad8137acc291dd72e01b3ff987e65dfaa716f2e0b0` |

CORE tgz 位于 artifacts/ 及 worktree 外分支目录；USAGE rc8 在 vendor/siblings/ 和分支目录。没有创建新远端，没有发布。

## 产品门与返回判定

- 此分支：组合候选 READY_FOR_CHECKPOINT，真实安装/profile/P04/P01 整体门 NOT_RUN。
- 父 session 负责独立审查 commit/产物、升级实际隔离 profile，并由不同 validator 从真实入口执行同意→真实使用→撤回→重启恢复与贡献/积分读回。
- 前一 USAGE 修复有 REAL_HOST + CORE STANDIN + SUSAGE DELETE STUB 生命周期证据；不能升级成真实服务或完整产品 PASS。
- P04 在线/离线撤回真实服务、网页撤回交叉检查、保留账本、P01 已有账号绑定/Vibe/provider/积分/重启恢复：本 CORE 切片不宣称通过。P15 高阶发起/活动支线维持前只读报告未跑/源码缺口；不阻塞 P01 基础门。
- 不修改 STATUS；返回 parent 做组合与每卡状态判定。ACCEPTED 仅用户给。

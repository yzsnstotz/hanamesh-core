# CORE38 / APPHOST36 有限组合封条

2026-09-30。唯一写入 origin：`hanamesh-core`；基线 CORE37 `b6c75da0c48403d118e046aa478d87129e21719f`。本切片只服务 P01-U02（从市场安装并打开 Vibe 后可重入、重启恢复）与 P08（Vibe 完整使用路径）的套件依赖闭包；实际消费者与组合检查点固定为 **CORE38 / USAGE9 / APPHOST36 / VIBE31**。冷恢复旧活跃租约的行为修复属于 APPHOST36 origin；CORE 不复制该逻辑。

CORE38 将精确 `dependencies`、开发 vendor、`pnpm.overrides`、锁文件、`suite.profile.json`、SHA verifier、静态断言、既有本地候选发布脚本以及版本文案重钉到 APPHOST36。`profile/cordis.patch.yml` 不变。无新增依赖、配置项、插件间 import 或 CORE 功能行为。`scripts/p1/publish.sh` **未执行**；无公开发布或推送。

冻结输入：APPHOST36 `vendor/siblings/hanamesh-dsh-app-host-0.1.0-rc.36.tgz` SHA256 `4e7f6b137a5ffa1b1a71420f384bb4112bcb94e6f1ea12d18fff1ac75f8e5009`，直接从 APPHOST 原仓同摘要产物复制。USAGE9 SHA256 `57733078cffecd546e6d970a23882fc8b21120f41c8022e0cdeb9eae3560881f` 与 PROVISION1 SHA256 `386d57361ccc3c8578f54cad8137acc291dd72e01b3ff987e65dfaa716f2e0b0` 保持原字节。输入 verifier PASS：hostAPI 94、siblings 3。元数据测试先观察到预期 RED（Core38 断言读到现存 Core37），然后更新生产元数据和固定输入得到 GREEN。

SOURCE/PACKAGE 验证：Node 24.13.1 / pnpm 10.33.0 / TypeScript 5.9.3 严格 build PASS；`check:contracts` PASS；`pnpm test` **54/54 PASS**；独立临时目录、独立 pnpm store 的 frozen-lock **offline install PASS**，读回 APPHOST36 / USAGE9 / PROVISION1；source-free `check-package` PASS。首次离线生成 lock 因本机缺 `@types/react` 离线 registry metadata 返回 `ERR_PNPM_NO_OFFLINE_META`，随后隔离 store 在线生成 lock，另起临时目录以 `--offline --frozen-lockfile` 成功验证最终锁；该初始失败不作为完整离线安装结果。原始通过日志见 `raw/`。本次仅精确钉值切片，未重跑历史 mutation/真实 UI 门。

候选产物 `artifacts/hanamesh-core-0.2.0-rc.38.tgz` SHA256 `fba4b67bbb39f83eee3d78b0c8acfcc31761292341cceaefa28d7e10ffff6059`，99 个包成员；包内依赖 Core38 → USAGE9 + APPHOST36，包本身不含 siblings tgz。包检查不等于真实 DSH 安装或产品 PASS。

最终 CORE38 / USAGE9 / APPHOST36 / VIBE31 组合安装、自然市场入口、真实 Vibe 视图长停留/关闭/重开/冷重启、Provider 使用与贡献/积分读回，全部由父 checkpoint 的**不同 validator**在隔离真实产品入口执行；本仓这些 REAL_HOST/REAL_UI 门均 **NOT_RUN**。未改 STATUS、其他 origin、本人 profile、`~/.dsh`、3080、研究 runtime、凭据或 DB。最高结论：候选 SOURCE/PACKAGE PASS；产品卡仍不可交用户 ACCEPTED。

# CORE35 / APPHOST33 有限组合候选

- Origin：hanamesh-core；base CORE34（源代码commit `722234aa604d6852a03a24fcc5f04d54eedbd4dc`；报告tip `ccfe76b0f9717b269039601c5b2887202bd69c43`），独立worktree。原main不动，public origin push仍BLOCKED；不push/tag/publish。
- 消费者 P01-M02/M06 / P08-U03 与既有P04同意使用UI，节点 MAC-COMPOSE / PRODUCT.P04.compose；父已授权仅必要本机修复组合，计划SHA256 `bb066b5eaacb59ae214e47d578c2f47c400ff7310b9698df4f797646d1f529b5`。没有全量runner。
- 固定 CORE `0.2.0-rc.35` / USAGE `0.2.0-rc.9` / APPHOST `0.1.0-rc.33` / PROVISION `0.1.0-rc.1`。APPHOST origin修复commit `3b1db62249077c87b5f800bd1c84b80c07914e47`，CORE只更新声明/vendor/锁与元数据，不补任何生命周期行为。
- source/lib/.build归一“关于”rc34→rc35后与base逐字节相同。USAGE9/PROVISION1 tgz逐字节不变，lock只有APPHOST33 input/pin/integrity改动。无新增deps/peer/import/UI/schema/HTTP。CORE tar按既有files不内嵌vendor/siblings，真实profile须提供分别固定同链产物/override。

| 当前检查 | 结果 | 证据 |
| --- | --- | --- |
| install固定输入与锁 | PASS | raw/install.log |
| frozen offline install | PASS，无重新解析 | raw/frozen-install.log |
| verify-inputs | PASS，hostApi94/srvIdentity/semver/siblings3 | raw/verify-inputs.log |
| target build | PASS Node24.13.1/pnpm10.33.0/TS5.9.3 | raw/build.log |
| 当前tests | 54/54 PASS，含已有2个crash门，0skip | raw/tests.tap |
| 公共contracts | PASS | raw/contracts.log |
| source-free package | PASS，依赖pin/service keys/adapter/no sibling import | raw/check-package.log |
| 归一源码/同链artifact逐字节与diffcheck | PASS | 本机断言 |

CORE 6个mutants在CORE34已PASS（HISTORICAL，既有behavior code此轮字节未改，按父指令不重复），不升级成CORE35 fresh mutation证据。APPHOST33本次135PASS/2browser skip/18mutants/真实离线包及父独立7门证据见该origin报告，本组合不复制为产品PASS。

| 包 | SHA256 |
| --- | --- |
| CORE35 | `a37aed664fdaee934e823a4395439cb12a376ef863215d00250d303820c80485` |
| APPHOST33 | `0d67b7ec8bd2dcb9391cc2e1233048748e6712cd8942dbcbc9449df049bcc946` |
| USAGE9 | `57733078cffecd546e6d970a23882fc8b21120f41c8022e0cdeb9eae3560881f` |
| PROVISION1 | `386d57361ccc3c8578f54cad8137acc291dd72e01b3ff987e65dfaa716f2e0b0` |

READY_FOR_CHECKPOINT；当前SOURCE/PACKAGE，真实新profile安装/原orphan现场Open与重启/P01真实provider积分完整流程NOT_RUN，由父升级并让differentvalidator亲跑。父现场profile/锁/进程/DB未碰，没有读取生产凭据/调用被测Codex，没有改desktop或任何其他origin。STATUS归父，ACCEPTED仅用户。

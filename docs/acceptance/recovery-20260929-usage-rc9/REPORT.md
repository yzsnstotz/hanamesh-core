# CORE rc34 / USAGE rc9 有限组合返回

- Origin：hanamesh-core，base rc33 commit `1fd820265ac9a5369a438c268afe535af2bb0c33`。独立worktree；原main未改，未push/tag/发布。
- 产品消费者：P01 M02 / P04 A02 desktop市场与同意UI。组合节点 MAC-COMPOSE / PRODUCT.P04.compose。父计划SHA256 `bb066b5eaacb59ae214e47d578c2f47c400ff7310b9698df4f797646d1f529b5`；不是整包runner。
- 固定组合 CORE `0.2.0-rc.34` / USAGE `0.2.0-rc.9` / APPHOST `0.1.0-rc.32` / PROVISION `0.1.0-rc.1`；USAGE9 origin commit `9279b8834768248a0b4baf79610a096499abf195`。
- 仅组合声明、vendor tarball、锁、profile与版本显示；CORE源码/生成物与base归一rc33→rc34后逐字节相同，无行为/UI功能/HTTP/schema/dependency/peer新增。APPHOST32/PROVISION1与base逐字节相同，lock只usage pin/integrity改动。
- CORE按现有files不内嵌vendor/siblings；实际profile必须提供单独固定同链产物/override。

| 检查 | 本次结果 | 证据 |
| --- | --- | --- |
| install锁生成 | PASS | raw/install.log |
| frozen离线install | PASS，无重新解析 | raw/frozen-install.log |
| verify:inputs | PASS hostApi94/siblings3 | raw/verify-inputs.log |
| target build | PASS Node24.13.1 / pnpm10.33.0 / TS5.9.3 | raw/build.log |
| 完整tests | 54/54 PASS，0skip | raw/tests.tap |
| 公开contracts | PASS | raw/contracts.log |
| mutations | 6/6因ERR_ASSERTION被杀 | raw/mutations.log（完整TAP分支外core34-raw/mutations） |
| crash | 2/2 PASS | raw/crash.tap |
| source-free包检查 | PASS，import/suite deps/publickeys/no sibling import | raw/check-package.log |
| diff --check及行为/同链逐字节断言 | PASS | 本机断言 |

| 产物 | SHA256 |
| --- | --- |
| hanamesh-core-0.2.0-rc.34.tgz | `fcd0d788a9470ff163f7b6c141ba974252685bc2c5c25d6f55605a0e8e653601` |
| hanamesh-usage-0.2.0-rc.9.tgz | `57733078cffecd546e6d970a23882fc8b21120f41c8022e0cdeb9eae3560881f` |
| APPHOST rc32 | `40fc5d2aab0845ae7922669d9378337a2399fae65c629405002a8cb2887867e8` |
| PROVISION rc1 | `386d57361ccc3c8578f54cad8137acc291dd72e01b3ff987e65dfaa716f2e0b0` |

READY_FOR_CHECKPOINT；本次SOURCE/PACKAGE验证。真实profile安装、真实Vibe安装计分、P04撤回/重启完整流程尚未由本分支执行（NOT_RUN），父须独立审查并由不同validator从入口复跑。USAGE已有真实安装metadata只读证据不等于REAL_UI/REAL_DB产品PASS。未操作生产凭据/数据、Codex、~/.dsh/3080/研究runtime/desktop源；不运行preflight或publish脚本，只更新其元数据pin。STATUS由父维护，ACCEPTED仅用户给。

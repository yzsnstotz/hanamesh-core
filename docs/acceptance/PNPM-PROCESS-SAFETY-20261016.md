# pnpm 隔离安装测试的进程安全修复

2026-10-16：旧 `test/noninteractive-install.test.mjs` 在带 `packageManager: pnpm@10.33.0` 的临时工程内，经 PATH 启动全局 pnpm 10.23.0；自安装目标位于该工程的临时 HOME 内，子进程再次发现祖先的 packageManager，造成递归自安装。编排已终止事故的孤儿进程并删除临时根。触发此次事故的命令是未固定 pnpm PATH 的测试运行；不能把 Node 的绝对路径当作 pnpm 已被固定。

## 修复

- 测试先要求 Node 24.13.1；只解析这个 Node 安装目录下的 pnpm，验证版本 10.33.0。PATH 或继承的 npm_execpath 指向别的 pnpm 时，在执行前明确失败；不启动那个旧程序，也不安装指定版本来修复环境。
- 版本探测在独立目录进行。临时 user.npmrc、环境变量和命令参数均关闭 `manage-package-manager-versions`，然后才写测试工程的 packageManager。
- pnpm 通过已验证 Node + pnpm.cjs 绝对路径启动；子环境明确指定，不继承个人 HOME 或凭据。保留原来无 CI、无 TTY、切换 store 的真实测试目的。
- `test/support/pnpm-process.mjs` 用独立 POSIX 进程组拥有每次调用。超时和正常父进程结束均做整组 TERM、宽限后 KILL，再用负 PID 确认组消失；观察 exit 而非可能被孤儿管道拖住的 close。输出有字节上限。
- 模块级集合拥有所有并发组。SIGINT/SIGTERM/SIGHUP 清理期间合并重复信号，等全部组清理后才重发信号；显式 process.exit 也对仍拥有的组执行同步 KILL。SIGKILL 无法被任何进程捕获；外部强杀仍应杀拥有的进程组。

## 回归与边界

定向覆盖：真实离线安装与切 store；低版本 PATH；继承旧 npm_execpath；完整旧环境测试进程明确失败且旧 pnpm 的 marker 从未执行；超时/正常父退出；外层 exit/interrupt；两个清理速度不同的组收到重复 SIGTERM。所有 PID 检查均应 ESRCH，临时目录由测试清理。8 项定向在 macOS arm64 / Node24.13.1 / pnpm10.33.0 通过。Windows 进程树策略未实现，这些 POSIX 进程测试在 Windows 显式跳过；不把它记成 Windows 已验证。

## 跨仓静态排查（未执行这些脚本）

| 仓 / 入口 | 核实的现状与风险 |
|---|---|
| core `test/noninteractive-install.test.mjs` | 本次确定的递归组合，已按上述方式修复。 |
| core `scripts/build.mjs` | `spawnSync('pnpm', ['--version'])` 仍从 PATH 取程序；正常构建时 HOME 在工程外，不等于本次递归组合。未硬化该历史入口，运行必须用固定工具链与独立 HOME。 |
| usage `scripts/`、`test/` | 本次字面调用扫描未找到 pnpm 子进程；`scripts/p2/pack-standins.mjs` 调用 npm pack。未证明共享 devkit、间接生成命令或外部宿主同样安全。 |
| app-host `scripts/pack-verification.mjs` | PATH 的 pnpm + spawnSync，HOME/TMPDIR 是 producer 的兄弟目录；不是此次 packageManager 祖先关系，但缺固定程序、整组超时回收。 |
| server-usage `scripts/contract-conformance.mjs`、`test/document-closure.test.mjs` | 消费目录里经 PATH 调用 pnpm，使用 spawnSync；需固定程序及整组回收。consumer 未写 packageManager，不直接复现本次组合。 |
| semantic `scripts/pack.mjs`、`scripts/verify-contract-consumer.mjs` | PATH pnpm + 同步子进程；需固定程序及整组回收。未改该仓。 |
| host `scripts/prepare-stage4-owner.mjs`、`test/contract/uow-independent.test.mjs` 等 | PATH pnpm；部分入口已有自有 ChildProcess 跟踪，仍须审核其子孙进程回收。此次没有运行或修改宿主，也没触及 owner 验收副本。 |
| custody `test/document-closure.test.mjs`、`scripts/pack.mjs`、`scripts/verify-contract-source.mjs` | PATH pnpm + 同步/历史运行器；交提供方审查，不代改 H 的仓。 |
| indexer `scripts/verify-runtime-deps.mjs` | npx 明确 pnpm11.28.2，与写入的 packageManager 一致；继承 HOME，不是本次临时 HOME 祖先组合。仍无整组回收。`scripts/pack.mjs` 的 PATH pnpm 也需硬化。 |
| claim `scripts/runtime-deps.mjs`、registry `scripts/verify-runtime-deps.mjs` | npm exec 明确 pnpm11.28.5，与 consumer packageManager 一致；继承 HOME，不直接复现本次组合。仍无整组回收。 |
| web-market `scripts/verify-p13.mjs`、`scripts/verify-p21.mjs` | PATH pnpm 的历史验证入口；未启动，需各提供方再审运行器的组回收。 |

本次只修改 Core 的测试工具与回归，没有把其余仓未运行的脚本宣称已修复。排查范围为代码根各模块的 scripts/test 下 JS/TS 源文件；不扫描个人凭据、不运行不确定的包管理器、不扩散安装试验。

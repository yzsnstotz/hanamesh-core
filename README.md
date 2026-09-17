> **↗ RENAMED 2026-09-17：原 hanamesh-plugin-identity → hanamesh-core。Stage 1 的 Core 插件（登录态/会话、Server 连接、同意开关、侧栏入口 + 设置一段）。product-profile 的健康/受限状态机将并入。package.json 名与代码改名由路线 L3 完成。PRD v2.0 §4.2。**

# hanamesh-plugin-identity

**当前状态：PARTIAL · v0.1.0-rc.3。目标构建和隔离 DSH／SRV-01 技术联验已通过；用户 ACCEPTED 与剩余视觉、介质门尚未完成。**

HanaMesh MOD-02 的登录界面、五态会话观察和用户作用域 JSON API SDK。SRV-01 是唯一身份真相；本插件不签发其他服务必须接受的 token、grant、entitlement、会员或资源权限。每个资源操作仍由资源端独立授权，修改本地状态不会构成远端授权。

## 2026-09-13 本机回收结果

在 macOS arm64、Node 24.13.1、pnpm 10.33.0、TypeScript 5.9.3 上，干净副本 `npm ci --offline --ignore-scripts`、目标 `npm run build`（含 `skipLibCheck: false` 的宿主声明门）、44/44 源码测试及两项变异均退出 0。隔离 `DSH_HOME` 的 DSH 0.1.5-alpha.1 已安装并加载插件；隔离本机 PostgreSQL 17.6 上运行锁定的 `hanamesh-server-identity@0.1.0-rc.1` 包，两个合成账户完成真实登录、本人读取、跨主体拒绝、退出和伪造身份负测。Chrome 独立 profile 的真实页面表单也完成登录与本人读取。证据和精确命令见 `docs/acceptance/recovery-20260913/plugin-identity-wave2/REVIEW.md`。

当前可安装候选是 `artifacts/hanamesh-plugin-identity-0.1.0-rc.3.tgz`；SHA-256 见 `artifacts/SHA256SUMS`。安装命令是 `dsh plugin --profile <隔离 profile> add <tarball> --offline`。此包未声明 `dsh.bundle`，需按 DSH 真实 `cordis.patch.yml` 的 `- insert:` 语法把插件和 `profile/identity.config.example.json` 配置加入隔离 profile。构建源仓的 `package-lock.json` 已可离线安装开发依赖；它不等于整个 DSH profile 的运行 lock。

回收新增的 `@hanamesh/ui-kit@0.1.0-rc.3` 锁定 tarball 已用于目标依赖图，但页面尚未消费官方样式；D09 仍待完成。D07 的真实浏览器页面没有隐藏控件（强制显示改动数为 0），所以本轮只证明绕开 UI 直接请求在可见性调整前后均获 401，原文“去掉隐藏逻辑”步骤保持 PARTIAL。一次性本地资源与合成账户不代表生产环境；没有用户验收签字、远端创建或发布。

## 原始交付轮次记录（历史，以下 rc.1 环境与阻塞状态以本节当时为准）

## 本轮实际环境与锁定基线

| 项目 | 产品目标 | 本轮实际 |
|---|---|---|
| 平台 | macOS / darwin-arm64 | Linux / x64 |
| Node | 24.13.1 | 22.16.0 |
| pnpm | 10.33.0 | 未安装 |
| TypeScript | 5.9.3 | 5.8.3；strict 编译便携核心，无 `noCheck` |
| npm | 非产品基线 | 10.9.2，用于离线 lockfile 与 npm pack |
| DSH | 0.1.5-alpha.1 @ `5dda764ed3aa172535a7967b06ff95d9cbfe536a` | 只有附件的公开类型声明；无真实运行时 |
| SRV-01 | `hanamesh-server-identity@0.1.0-rc.1` | 锁定 tarball / 公开契约在仓内；未运行服务或数据库 |
| ui-kit | `hanamesh-ui-kit@0.1.0-rc.3`，已验收源码记录 `d1e1a50` | 附件未提供 tarball、digest、可消费接口；未接入样式 |

`lib/` 是上述实际环境的离线编译输出。DSH 适配器做了 JavaScript 语法与接口装配替身测试，**完整宿主类型检查未通过前置依赖门，真实 DSH 加载、浏览器和 ui-kit 视觉验收未执行**。目标构建命令在工具链不匹配时直接失败，不偷偷降级。

SRV-01 tarball SHA-256：

```text
19b54a32841647a99ed04883833461c0702f2b073567204d718c2e042cdce557
```

精确版本与附件哈希见 `deps/LOCKS.json`、`deps/HOST_API.sha256.json`；94 个公开宿主声明／描述文件逐个核对。ui-kit 缺失字段保持 null，不拿源码 commit 当产物 digest。不用 workspace link、不复制上游实现、不启动第二套身份服务。

## 已实现的范围

独立页面 `/hanamesh/identity`，在宿主首页注入“账户与登录”链接；消费 `connection`、`webServer`、`storageDomain` 的已提供公开接口，不修改 DSH core。页面是无自造设计 token 的语义 HTML 功能界面，明确标记 ui-kit 接入待完成，**不代表视觉交付完成**。

公开服务 `ctx.hanameshIdentity` 与包子路径 `hanamesh-plugin-identity/contracts`、`hanamesh-plugin-identity/client` 提供五态、已验证主体、ready / authenticated 两步检查、用户作用域请求。本地强制登录通过 `requiredLogin` 配置，默认 false；受保护请求无论如何都要求有效身份，且每次向 SRV-01 重新检查。第三步资源权限不由本插件回答。

密码只用于本次登录；服务端 cookie 只留在宿主私有内存，不进入 DTO、普通 SDK、iframe、浏览器持久存储、sidecar 或诊断。凭据访问不是对恶意本机代码的沙箱保证。本轮是一个 DSH profile 的单所有者会话，不是多租户浏览器隔离系统。

`storage-domain:hanamesh_identity` 使用 single 布局，每次状态转移调用一次 `global.set` 发布完整观察镜像。不往 DSH session 写入自有事件。重启后只恢复过期／退出观察，**绝不恢复授权或 cookie**。保护操作失效时发出状态变化供业务 owner 收敛任务；本插件不会删除或擅自终止私有工作。

## 构建、测试、打包

在仓目录操作。离线复验使用已有 TypeScript 编译器，不安装系统组件、不需要数据库、远端或凭据：

```sh
npm run verify:inputs
npm run build:offline
npm test
npm run test:mutation
npm run test:crash
```

严格目标构建：由本机回收者在 Node 24.13.1、pnpm 10.33.0、TypeScript 5.9.3 和**实际固定宿主依赖**就绪后执行 `npm run build`。`HM_TSC` 可指定同版本编译器可执行文件。`tsconfig.host.json` 不关闭 `skipLibCheck`。

`package-lock.json` 由 `npm install --package-lock-only --ignore-scripts --legacy-peer-deps --offline` 产生，只锁本插件与精确 peer 声明；**它不是已解析的完整 DSH 宿主依赖图**。运行 peer 由固定宿主提供。已将 DSH 相关依赖在 `overrides` 中固定到 alpha.1，包括已知缺声明链上的 `dsh-attachment`；没有安装这些包来冒充真实检查。回收时需要完成宿主依赖解析与类型检查，不能改为 rc.2 或使用 `skipLibCheck` 绕过。

本轮 npm 产物按默认名放在 `artifacts/hanamesh-plugin-identity-0.1.0-rc.1.tgz`，同目录有 SHA-256。重新产生内容不同的锁定产物必须升 rc 版本，不覆盖本轮候选或复用标签。`private: true` 只防误发布，不妨碍 npm pack / 本地安装。

```sh
# 仅在有意制作一个尚未发布的新版本时运行；目标构建先通过。
npm pack --pack-destination artifacts
```

测试里的 `.invalid` 域名、账户、密码、cookie 全是合成数据。43 项顶层测试包含宿主装配替身、真实子进程 SIGKILL、原子文件镜像与远端事实替身；另有两项 guard 变异和两个写入顺序反转。**这些不是 REAL_HOST / REAL_API / REAL_DB 证据**，详见 `docs/acceptance/AC-24.md`。

## 本机回收与安装边界

使用独立随机测试目录、独立 `DSH_HOME`、新建 `web` profile 和空闲端口；不读写 `~/.dsh`，不访问个人 3080，不改上游 checkout。优先使用已交付 `hanamesh-dsh-runtime`，否则使用输入文档指定的 `research/…/rt/`，并核对 DSH commit。

在本机既有、确认版本的 CLI 中执行 `dsh plugin add <tarball>`，以该 CLI 实际支持的 profile 选择方式加入新建的 web profile。**本仓不猜测未提供声明的 CLI profile 参数，也不生成猜测形状的 Cordis 配置文件。** 把 `profile/identity.config.example.json` 作为本插件配置值交给该 profile 的装配器；确认 `connection`、`webServer`、`storageDomain` 及其 backend 就绪。样例 `.invalid` 地址必须换为获授权的 SRV-01 精确 origin 与 deploymentId。

先用宿主自己的登录 URL 完成 DSH 浏览器认证，再打开账户页面。插件不接管宿主 `303 → Set-Cookie → GET` 握手，不向页面转交宿主 token。这里的登录是 **SRV-01 账户登录**，与 DSH 浏览器认证是两道不同门。

## 不能省略的限制

当前仅实现锁定 SRV-01 的邮箱／密码登录和 JSON 请求；没有 OAuth、注册、钱包登录、文件下载、WebSocket、多 origin 转发或会员判定。未获本次授权建立账户、执行数据库或联系生产 API。

账户切换必须先退出现有会话。远端撤销失败时，本地立即拒绝新保护操作，cookie 只用于撤销重试，状态保留 `logoutPending`。进程被杀会丢失该 cookie：随后无 cookie 的 sign-out 不能证明旧远端会话被撤销，新会话退出也不能消除旧的未确认记录。旧服务器会话可能等待其原有过期或由获授权服务端流程撤销；本插件没有假造“全端撤销”的接口。见 `docs/SECURITY.md`。

完整矩阵、原始日志、阻塞和四字段 checkpoint 只在 `docs/acceptance/AC-24.md`。本轮没有更新共享 STATUS、没有建远端、push 或发布。

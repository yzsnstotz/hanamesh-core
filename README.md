# hanamesh-core · 0.3.3

Core提供设备身份、同意/撤回、HanaMesh设置段、套件入口和健康观察；Usage/AppHost独立安装，缺少或版本不匹配时有明确提示，身份和同意仍可用。绑定回跳由focus/visibility刷新，不依赖深链。Core不采集事件、不实现应用容器或钱包奖励。

固定官方D7目标为Desktop/DSH0.2.1-alpha.2、Cordis4.0.5-alpha.1；正常Desktop包管理使用bundled pnpm11.28.5默认政策。Desktop初始化后须完全退出，管理程序用其公开CLI `dsh plugin --profile desktop add <已核验的Core候选tgz>`安装并重开。当前0.3.3是本地候选版本，本文不宣称npm发布或真实产品已验收。不能用旧rc.2 profile证明此组合。

Core首次激活前，由管理程序配置本轮loopback/null origins与环境内sharedIdentityDir、隔离HOME/DSH_HOME/用户数据并清继承凭据；正常profile配置输入见[API.md](docs/API.md)。出厂合法默认值保持。设备共享路径在身份行可见，预算区只展示具名数值。安装和真实resolved版本/路径须保留收据，声明文本不当安装证据。

公开调用/类型及独立确定性FIXTURE验签向量见[CORE_CONTRACT.md](docs/CORE_CONTRACT.md)。sign仅签原Uint8Array；请求头签名与业务事件签名分开，六事实样例不是C-USAGE正式编码权威。

## 依赖与构建

Node `24.13.1`、pnpm `10.33.0`、TypeScript `5.9.3`。固定 D7 上游 `d743267388641bc76f17c45ce8b4c231aed1d32c` 的官方宿主 peer 精确钉 `@deepseek-ai/cordis@4.0.5-alpha.1` 与实际使用的 `@deepseek-ai/dsh-*@0.2.1-alpha.2`；React `18.3.1` 与 Zod `4.5.4` 由公开依赖闭包供给。Core 不 import Usage/AppHost。

`@deepseek-ai/dsh-typert-protocol@0.2.1-alpha.2` 是 connection 公开类型的活动依赖，和 scope/storage 一起明确列入本包宿主 peer 与开发依赖；干净消费者只供给已声明的宿主依赖。无运行时补丁，构建不跳过库类型检查。构建使用实际公开官方包；历史 DSH 0.1.5-alpha.1 类型快照已归档到 `docs/archive/host-api-dsh-0.1.5-alpha.1/`，不参与构建与发布。版本范围判断用正常依赖 `semver@7.7.2`，不再随包携带复制件。

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm check:contracts
pnpm verify:inputs
```

运行时必须使用隔离 `DSH_HOME`。公开包不含本机 sibling tgz、研发链接或私有 registry 依赖。私钥以 PKCS8 base64url 保存在 DSH storage-domain JSON 中；不通过 Core 契约、HTTP 或日志输出。

Server 注册 POST 的 Origin 为 serverOrigin；Server 的可信 Origin 须包括自己的公开地址。收录不代表审核或推荐。

## Development tools

`@hanamesh/devkit` is installed from `git+https://github.com/yzsnstotz/hanamesh-server-shared.git#semver:^0.2.0&path:/packages/devkit`. It is used by development scripts only and is not a runtime dependency or public peer. pnpm 10.33.0 supports this Git subpackage selector; npm Git source installation does not. Use Node 24.13.1 and `pnpm install --strict-peer-dependencies --frozen-lockfile`; preflight runs the installed public supply suite against the resolved package, exports, CLI and lock. Normal npm tarball consumption is checked separately.

Run `pnpm build`, `pnpm test`, `pnpm test:mutations`, `pnpm test:crash`, `pnpm check`, `pnpm run pack`, then `pnpm verify:pack`. Core keeps its six mutation cases, DSH/PostgreSQL inventory probes, public package assertions and input digests in this repository. The devkit supplies toolchain checking, preflight, isolated mutation execution and package verification. `HM_CORE_RUN` optionally places temporary consumers and mutation evidence in the card run directory; the default is `artifacts/`.

The package consumer checks JavaScript and strict TypeScript without devkit installed. The root type entry also needs the public DSH type prerequisite `@deepseek-ai/dsh-typert-protocol@0.2.1-alpha.2`, already used by the local host type gate.

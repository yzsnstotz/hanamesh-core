# hanamesh-core · 0.3.9

Core提供设备身份、同意/撤回、HanaMesh设置段、套件入口和健康观察；Usage/AppHost独立安装，缺少或版本不匹配时有明确提示，身份和同意仍可用。绑定回跳由focus/visibility刷新，不依赖深链。Core不采集事件、不实现应用容器或钱包奖励。

组件启动失败时，健康行显示白名单错误码、已识别的数据域、原因与处理建议；读取失败原因最多等待250ms，未知错误安全降级。不保存或展示原始错误、路径、堆栈或记录内容。数据格式不兼容时先备份并安装支持该格式的组件版本，保留原数据后重新检查；Core不迁移其他组件的数据。修复前仍保持repair并拒绝新的受保护操作，重新检查确认组件健康后恢复normal。

宿主兼容目标为用户可安装的官方 Desktop/DSH 0.2.0-rc.2 起的0.2.x（包含0.2.1-alpha.x）。公开 DSH peer 使用范围，精确版本仅保留在开发/构建输入。DSH 管理器按 includePrerelease=true 检查，另列0.2.1预发布比较项以兼容普通包管理器；上限0.3.0-0排除下一minor的预发布。实际桌面测试结果见 docs/acceptance/dsh-rc2-compat-20261015.md，不把声明当运行证明。

Core首次激活前，由管理程序配置本轮loopback/null origins与环境内sharedIdentityDir、隔离HOME/DSH_HOME/用户数据并清继承凭据；正常profile配置输入见[API.md](docs/API.md)。出厂合法默认值保持。设备共享路径在身份行可见，预算区只展示具名数值。安装和真实resolved版本/路径须保留收据，声明文本不当安装证据。

公开调用/类型及独立确定性FIXTURE验签向量见[CORE_CONTRACT.md](docs/CORE_CONTRACT.md)。sign仅签原Uint8Array；请求头签名与业务事件签名分开，六事实样例不是C-USAGE正式编码权威。

## 依赖与构建

Node `24.13.1`、pnpm `10.33.0`、TypeScript `5.9.3`。开发输入固定公开 alpha.2/Cordis4.0.5-alpha.1，宿主peer放行rc.2及0.2.x；Cordis覆盖实际rc.2的4.0.4与alpha的4.0.5-alpha.1，React18与Zod4保持同major范围。Core 不 import Usage/AppHost。

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

## Session G · agent 本地进程面（0.3.5）

`node lib/agent-cli.js` 通过 stdin/stdout JSON 提供不加载 DSH 的设备、同意、签名、注册、绑定链接与撤回入口。Usage 只调进程协议，不 import 本插件。设备沿用共享根 `identity/device.json`；agent 同意独立、默认关闭。`state` 为只读，不创建目录；任意签名/注册都等待同意。已撤回后只开放本设备固定 DELETE 操作，不开放任意签名。没有默认线上地址。

请求示例（根与地址由调用方明确配置）：`{"config":{"sharedHome":"<绝对路径>","serverOrigin":null,"websiteOrigin":null},"input":{"operation":"state"}}`。结果 `{result:{…}}`；错误 `{error:{code}}` 并退出1；不导出私钥。进程接口细节与错误见 `docs/AGENT.md`。

本轮平台证据：macOS arm64 / Node24.13.1。Intel macOS、Windows x64、Linux x64 真机为 NOT_RUN（无本轮机器）；Linux/Windows arm64 无本轮支持承诺。CLI/单元/包检查不能替代真实宿主和 owner 验收。

Agent0.3.6 signs explicit consent generations and requires a transactional v2 withdrawal barrier; see docs/AGENT.md. A matching committed server tombstone closes delayed old grants/uploads. No-device is distinguished from a completed remote deletion.

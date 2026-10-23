# hanamesh-core · 0.3.10

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

Binding links carry the original Identity expiry and clock domain as unsigned display metadata; they never change server expiry or authorize confirmation. See docs/API.md and docs/SECURITY.md.

## 不可关闭的平台依赖发布门（0.1.9）

`DSH_PNPM_PLATFORM_CLOSURE`，`disableable=false`。编排提供的触发背景是：DSH bundled pnpm 11.7.0 在处理不适用平台的 optional 子包时可能安装完成却不退出，宿主因此一直等待。这里检查发布包的完整安装闭包，不宣称修复 pnpm 自身。不能关闭：关闭后可能发布用户无法完成安装的插件；Mac、Windows、Linux 使用同一规则，不按检查机平台过滤。没有 skip/allow/ignore、环境开关、白名单或仅警告模式。遇到违规应更改依赖分包方式或移除依赖，不能以改客户端、omit-optional、超时或重试替代。

正常工具为仅开发依赖的 `@hanamesh/release-platform-gate@0.1.9`，固定本仓 `vendor/hanamesh-release-platform-gate-0.1.9.tgz`（33790B，SHA256 `c72010c96a5f22e36d65f6c1fd850e583dead7e843644eba1657b4416d9cbd0d`），由 pnpm 正常冻结锁校验。工具代码只在该已审开发包中，不复制扫描器、不从邻仓导入，不进入插件运行 dependency、peer、bundle 或产品载荷。

冻结安装继续用 Node 24.13.1 / pnpm 10.33.0，`pnpm install --strict-peer-dependencies --frozen-lockfile`。原构建/测试/检查仍须全部执行，再使用 **npm** 正常发布入口：

```sh
npm run release:check
# 仅在另获发布授权后：npm run release:publish
```

`release:check` 执行正常 npm pack（保留生命周期），检查实际 tar 与 `pnpm-lock.yaml`，输出 JSON、tar/锁 SHA256，并保存 `artifacts/release-platform/receipt.json`；失败退出 1，触发包/字段/原因及不可关闭理由可见。未来 `release:publish` 只发布最后再次核 SHA 的同一受检 tar，不重新打包目录。`prepublishOnly` 正常守卫以 `SOURCE_PUBLISH_FORBIDDEN` 拒绝目录发布（不通过真正 npm publish 验证）。不能直接取旧 tar 绕过本次检查。CI 的 `release-check` 固定执行原门和发布门，仅只读检查，无发布凭据/权限；本接线不授权 npm 发布。人为删除脚本、禁用 npm 生命周期或另行直接调用 registry 不属于本门授权的发布路径。

检查普通 dependencies、optionalDependencies、必需/已解析 peer（包括冻结锁独有的 peer）、实际 bundle/vendor、每个包自身的锁，absent optional peer 逐项列出。平台 os/cpu/libc 字段或平台 optional 目标以 `PLATFORM_FIELD` / `PLATFORM_OPTIONAL` 拒绝；身份/范围/冻结漂移、强 SRI 错配分别具名拒绝。有限支持 [dependency-shapes-v1 合同](https://github.com/yzsnstotz/hanamesh-docs/blob/dad7fc34d52c784ac99cdd7a8a31fcaa0a618d36/tools/release-platform-gate/DEPENDENCY_SHAPES.md)：registry、实际 bundle 的 git、实际归档内 file/link/workspace、受约束 HTTPS tarball、bundle/vendor；npm lock v2/v3、pnpm lock v9。合同外协议、锁版本、未知 resolver 字段、patch/catalog/injected/overrides 等形态以 `UNSUPPORTED_DEPENDENCY_SHAPE` 拒绝，包含 shape/why/action/contract。处理方式是改成合同内可证明的供给，或先扩合同并独审，不能猜测或静默放行。

本次为发布检查接线，产品版本/公开运行合同保持原正式基线；新 tar 与旧正式 tar 的摘要分别记录，不能混用。工具独审通过不等于本仓接线独审、真实 DSH/owner 安装或 Windows/Linux 真机通过；这些按实际证据另记。没有执行 npm 发布。

原 `verify:pack` 先正常打包并过发布门，再对同一受检 tar 做严格外部消费者验证；`npm run pack` 同样走受检入口。历史 `scripts/p1/publish.sh` 已退役并转正常目录发布守卫，不再发布旧 tar 或其他仓的包。

Core 既有 devkit Git 源为私有仓，公开仓的 GitHub Actions `GITHUB_TOKEN` 不拥有该邻仓读取权。新增 CI 在缺少维护者配置的只读 `HANAMESH_DEVKIT_READ_TOKEN` 时具名 `DEVKIT_SOURCE_ACCESS_REQUIRED` 失败；通过标准 gh credential helper 消费环境变量，不将值放进 URL/argv 或输出。本次未创建/读取/配置秘密，不声称远端 Actions 已验证；本机通过既有正常 Git 认证冻结安装。

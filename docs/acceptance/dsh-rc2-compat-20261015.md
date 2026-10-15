# 官方 DSH rc.2 兼容修复（Session G，2026-10-15）

范围：Core 0.3.7、Usage 0.2.0-rc.31、AppHost 0.6.2。仅本机工程交付；没有部署、npm 发布或 owner ACCEPTED。

## 根因与实际 API 差异

已读官方应用 `/Applications/DeepSeek Harness.app` 的 Info.plist、app.asar 内实际 package.json / 编译实现，并对照上游公开标签 `dsh-v0.2.0-rc.2` 与 `dsh-v0.2.1-alpha.2`。官方桌面版本确为 0.2.0-rc.2，随包 Cordis 4.0.4、Schemastery 3.18.4；alpha.2 开发输入为 Cordis 4.0.5-alpha.1、Schemastery 3.18.5-alpha.1。

| 消费方 | rc.2 实际存在的接口 | 与 alpha.2 的相关差异 / 修复 |
|---|---|---|
| Core | storage-domain defineDomain/open/global get/set/close；Connection fetch.register/requestRejection；Cordis get/provide/effect/on；Loader entries/条目元数据/模块解析；客户端 slots.inject/register、settings.section、sidebar.footer.action | 未发现已消费接口缺失。解除宿主精确 peer；关于页改为自身版本与支持系列，不把构建宿主版本冒充当前宿主 |
| Usage | session get/list/flush、events/inherited/header/ownSeq；sessionPersistence open/read/flush；command/run、command/done 的 agent.session；storage-domain；TypertRemoteService/$mount 与客户端 slots | rc.2 BundleInfo 没有 availability，有 installed/removable/enabled/version/error/readOnlyReason/rows。旧代码按 availability 过滤，导致安装和页面事件丢失。新适配仅在字段不存在时识别 rc.2 形状；显式未知值、错误、只读与不明确所有权仍拒绝 |
| AppHost | storage-domain、webServer.register/port、Connection requestRejection、Cordis provide/get/effect/inject/reflect、可选 credentials/llm、ModuleLoader/slots | rc.2 public pluginManager.installBundle 不支持 saveExact；alpha.2 才有。旧路径无法满足精确保存读回要求。rc.2 通过已核实的官方随包公开 CLI 安装，明确 restart-required；alpha.2 保留公开 manager 热安装。缺可核实能力时 ready:false 并说明原因，不先修改 profile |

DSH 源码 `packages/boot/app-boot/src/plugin-compatibility.ts` 中 evaluatePluginCompatibility 对 `@deepseek-ai/dsh` 和 `@deepseek-ai/dsh-*` peers 使用同一个宿主版本，调用 `semver.satisfies(runtimeVersion, range, {includePrerelease:true})`。实际 ASAR 中实现一致；其 app-boot/lib/index.js SHA256 为 `234db45e1b3f8c683b5bc1f551948b2a2ec52a6468c7b6937725a23f1c0e0d96`。Cordis peer 不经过此 DSH 名称过滤器，仍须满足包管理器约束。没有使用版本豁免或强制跳过。

公开 DSH peers：`>=0.2.0-rc.2 <0.3.0-0 || >=0.2.1-0 <0.3.0-0`。Cordis：`>=4.0.4 <4.1.0-0 || >=4.0.5-alpha.1 <4.1.0-0`；AppHost Schemastery：`>=3.18.4 <3.19.0-0 || >=3.18.5-alpha.1 <3.19.0-0`。DSH 的 includePrerelease 规则覆盖 rc.2 起的 0.2.x 预发布；第二个析取也让普通 npm semver 接受当前 0.2.1-alpha.x。0.2.0-rc.1 与 0.3.0 的预发布均不接纳。开发输入仍精确固定，声明范围不承诺未经实测的未来破坏性 API。

历史回退确实存在：Core 的范围提交 92b7cc3 后，42ef5e0 改回精确 rc.2，后续改为 alpha.2；Usage 5b5ce2a 后 d467128 改回精确 rc.2、205d9c81 固定 alpha.2；AppHost 7fc127c 后 b992d37 改回精确 rc.2、a00c80e 固定 alpha.2。把开发输入版本复用到公开运行 peer 是共同原因，不能靠每次宿主更新重发插件解决。

## 验证与边界

- Core 最终源码：build、173/173、最终包独立 JS/strict TS 消费者通过；新 About 断言先红后绿。
- Usage：build/check、31/31 定向、338 pass / 2 可选真实后端 skip、24 个变异检出、最终包严格 peers / 公开类型 / 宿主入口消费者通过。
- AppHost：build/types/toolchain/consistency、325 pass / 2 既有浏览器 skip、57 个变异检出、最终包 JS/TS 与真实 rc.2 提供方闭包严格消费者通过。裸 pnpm 自动拼最新 alpha.3 与 Cordis 4.0.4 的宿主组合失败，未伪装为通过；插件运行在宿主已提供的依赖闭包内。
- **真实官方 rc.2 桌面**：使用未修改的已安装应用与公开 `runtime/cli/bin/dsh`。旧 Core 0.3.6 被真实兼容检查拒绝，新三包安装及加载通过。UI 默认 withheld / 事件 0；UI 同意后真实 manager 库存生成三条签名本机安装事件，未设置后端则 offline。市场 UI 安装本机无害 scoped 测试插件，profile 精确保存 0.0.1，显示需重启；重启后官方 Plugins 页显示 `1 total · 1 running` / `Running`。真实 Usage 设置页打开产生 open 事件；撤回后事件 0。没有调用模型或后端，没有据此声称积分闭环。
- 全新 HOME / DSH_HOME / ZDOTDIR / Electron user-data，最小环境；规范化临时路径含中文和空格。所有本轮桌面进程与临时根已清理。测试初稿的 `/var` 符号链接、registry 范围、测试 bundle 名称错误均已修正后重跑，不把初次失败算产品通过。
- **真实公开 npm alpha.2 CLI/web**：全新 HOME / DSH_HOME，完整公开宿主依赖安装后，实际 CLI 版本为 0.2.1-alpha.2，三包正常安装与加载；独立 Chrome 使用全新 user-data 与 mock keychain。默认 withheld / 事件0、真实安装库存签名、本机市场经 public manager 热安装 applied、官方 Plugins 显示 Running、真实 Usage 设置页 open、撤回清零均通过。未运行模型。没有官方 alpha.2 桌面安装包，不把 CLI/web 回归称为官方 alpha 桌面验收。初稿关闭自动 peer 安装导致宿主缺 cordis-plugin-group，属于不完整宿主闭包，已按公开宿主正常自动 peer 安装后全新重跑；原失败收据保留。

小证据及不可变包保留 `/Users/yzliu/.cache/hanamesh-runs/session-g-dsh-compat-20261015/`。`evidence/rc2-exercise-before.json`、`rc2-exercise-after.json`、`native-runner-receipt.json` 是真实桌面工程收据；`alpha-exercise-{before,after}.json` / `alpha-runner-receipt.json` 为独立真实 alpha CLI/web 收据；源码/合成测试不会替代这些证据。owner 操作见 [验证三](OWNER-VALIDATION-3.md)。

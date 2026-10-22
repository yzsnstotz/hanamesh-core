# `hanameshCore` 契约

| 方法 | 签名 | 语义 | P2 是否依赖 |
|---|---|---|---|
| `protocolVersion` | `readonly '1'` | 契约版本；破坏性改动升 `'2'` 并 bump minor | 是 |
| `getDeviceId()` | `() => string` | 本机设备 id，`apply` 后立即可得，不依赖注册 | 是 |
| `getPublicKey()` | `() => string` | raw 32 字节 base64url | 否 |
| `sign(bytes)` | `(bytes: Uint8Array) => Uint8Array` | Ed25519 原始签名 64 字节；同步；私钥不出进程 | 是（事件签名） |
| `signRequest(input)` | `(input: {method: string; path: string; body: Uint8Array \| null}) => Promise<Record<'x-hm-device-id'\|'x-hm-timestamp'\|'x-hm-nonce'\|'x-hm-signature', string>>` | 设备鉴权四个头 | 是（上报/撤回） |
| `getConsent()` | `() => 'granted' \| 'withheld'` | 当前同意状态（本机真相） | 是 |
| `onConsentChange(listener)` | `(listener: (state, changedAt: string) => void) => () => void` | 订阅；返回取消函数；注册时不回放当前值 | 是 |
| `getSession()` | `() => SessionSnapshot` | 设备注册观察；可能陈旧，不是授权证明 | 是（只读展示） |
| `getServerOrigin()` | `() => string \| null` | 生效的 Server origin（0.3.4：设置页地址 ?? 配置）；null = 离线 | 是 |
| `getHealth()` | `() => HealthSnapshot` | 组件健康快照 | 否 |
| `getSuiteDeclaration?(request?)` | `({registry, coreVersion?}?) => Promise<SuiteDeclaration>` | Core 唯一只读套件声明与兼容三包组合；协议1可选扩展，见 [公开说明](SUITE_DECLARATION.md) | 否 |

契约明确不暴露私钥、PKCS8、token、cookie、nonce、传输实例或 storage-domain 写接口。

## 发布形态（rc.55 起，只加不改）

协议仍是 `'1'`，上表方法、字段与拒绝语义不变。rc.55 在同一个 `./contract` 导出下增加可选的机器可读部分，供提供方与消费方跑同一套检查：

| 导出 | 内容 |
|---|---|
| `hanamesh-core/contract` | 上述类型；新增 `CORE_SERVICE_NAME`、`CORE_PROTOCOL_VERSION`、`CORE_SUPPORTED_PROTOCOL_VERSIONS`、`CORE_REQUIRED_METHODS`（7 个）、`CORE_OPTIONAL_METHODS`（`getPublicKey`、`getHealth`、`getSuiteDeclaration`）与握手 `checkCoreService(value, accept?)` |
| `hanamesh-core/contract/schema.json` | v1 数据形状（JSON Schema 2020-12）；`x-hanamesh` 列出服务名、版本、必需/可选方法、`signRequest` canonical 与握手顺序 |
| `hanamesh-core/contract/fixtures` | 提供方 fixture `createCoreProviderFixture()`、消费方参考 fixture `createCoreConsumerFixture()`、13 项握手矩阵 `coreHandshakeCases()`；全部带 `CORE_FIXTURE_LABEL`，不是产品提供方 |
| `hanamesh-core/contract/suite` | `runCoreProviderSuite(provider)`、`runCoreConsumerSuite(consumer)`、`validateCoreValue(def, value)` |
| bin `hanamesh-core-contract-suite` | 在已安装的包里对真实 `SessionController.service`、提供方 fixture、参考消费方跑套件；`--consumer <file>#<export>` 再跑你的接受函数 |

### 握手

`checkCoreService(value, accept = ['1'])` 对每个输入只有一个结果，顺序固定：

1. `undefined`/`null` → `{status:'absent', reason:'CORE_ABSENT'}`
2. 非对象 → `{status:'incompatible', reason:'CORE_NOT_OBJECT'}`
3. `protocolVersion` 不在 `accept` → `{status:'incompatible', reason:'CORE_PROTOCOL_UNSUPPORTED', provided, supported}`
4. 缺必需方法 → `{status:'incompatible', reason:'CORE_METHOD_MISSING', missing}`
5. 否则 `{status:'present', protocolVersion, optional}`（`optional` 只列确实是函数的可选方法）

不做静默兼容：版本不符或缺方法一律 `incompatible`。这些是形状诊断，不能证明真实 Cordis 装配、设备就绪、同意或服务端状态。

### 提供方套件检查项

`handshake.present`、`handshake.rejects-other-version`、`surface.closed`（不多暴露成员）、`identity.deviceId`、`identity.publicKey`、`sign.ed25519`（64 字节且可用 `getPublicKey` 验签、不改输入）、`signRequest.canonical`（四个头；`METHOD|pathname|unixMilliseconds|nonce|hex(sha256(body))` 验签；去掉 query/fragment）、`signRequest.rejects-invalid`、`consent.state`、`consent.subscribe`（订阅不回放、经提供方自己的写路径改一次只通知一次、取消后不再通知、结束恢复原值）、`session.schema`、`serverOrigin`、`health.schema`。

### 消费方套件

消费方给出接受函数 `accept(value) → {status, reason?}`，对 13 项握手矩阵逐项给出与 `checkCoreService` 相同的 `status`（给了 `reason` 时也要相同）。

### 版本规则

只加可选成员 = 小版本，仍是 `'1'`，加进 `CORE_OPTIONAL_METHODS` 与 schema；删除、改名、改语义 = `'2'`，按合约卡批次同步所有消费方后发布。

## 0.3.1 正常源包声明

一行变更：移除继承的 Identity rc1 协议副本与其 SHA 权威，开发一致性门正常安装已发布 `@hanamesh/server-identity` 源 tag 范围；Core 协议 v1、schema、提供方/消费方 fixture 与产品策略保持原字节。

包 SemVer 是发布/安装选择；wire `protocolVersion: '1'` 与内部数字 `schemaVersion: 1` 不是包 SemVer，Core 没有全 SemVer 严格相等的握手检查。v1 握手已接受额外可选成员，并拒绝不同 wire 主版本、数字替代和缺少必需方法；闭合 schema 与提供方私有成员边界继续生效。

0.3.3 起本仓不再依赖任何合约包（含开发依赖），也不再保留 `contract-tests/identity` 独立验证包；测试所需 fixture 内联在 `test/fixtures/`，测试不读取文档仓或合约包。Core 产品运行依赖不含 Identity 服务实现包。

0.x caret 不是整个 major 范围：`^0.2.0-rc.11` 不接受 `0.3.0`，`^0.2.0-rc.55` 也不选择 Core `0.3.0`。安装选择与 wire 兼容分别记录；已有消费方不用为 v1 行为修改。

### 正常 Git 安装与验证依赖边界

0.3.0 的候选 tgz 消费通过，但 npm Git 包准备会安装根开发依赖；根 Identity 依赖引入其 devkit rc2 peer 与本仓 rc1 冲突，真实正常 Git 消费失败 404。0.3.1 将同一源范围移到独立验证包，Core 源包的正常构建不引入 Identity 提供方依赖；不改上游 peer、不放宽包管理检查、不复制合约。验证包单独正常安装并冻结其 lock。

开发门：先 `pnpm install --frozen-lockfile --store-dir <共享缓存>`，随后 `pnpm build`、`pnpm check`、`pnpm test`。0.3.3 起没有独立验证包与 `pretest` 安装步骤。


## C-CORE 提供方定义交接（J1S2-CORE-01）

`src/contract-fixtures.ts` 为真源，重建后的 `lib/contract-fixtures.js`（包导出 `hanamesh-core/contract/fixtures`）向本包的开发消费者提供（正式 API 由提供方合约文档追加）：

- `CORE_CONTRACT_DEFINITION`：合约 id、服务名、wire 协议、全部九个现行调用的输入/输出、同步异步、错误适用条件、签名 canonical。`types` 引用现有 v1 JSON Schema 的字段定义，包含 SessionSnapshot 全部八个字段；没有第二份协议字段副本。
- 类型重导出：`ConsentState`、`ConsentPrompt`、`RequestSignatureInput`、`DeviceAuthHeaders`、`SessionSnapshot`、`HanaMeshCoreContract`、`CoreHandshake`。
- `createCoreContractExamples()`：带 fixture 标签的同意状态、设备 id、公钥、会话、origin、原始请求字节及可验签四头；握手错误返回值与 `{code,status}` 运行错误样例。每次生成独立 Ed25519 公钥/签名，不输出私钥。请求 body 是 `Uint8Array | null`，消费方应保留或重建原始字节；JSON 序列化对象不替代签名输入。
- `createCoreProviderFixture()`：最小内存模拟提供方，可切换同意、订阅/取消、签名及读取会话；`createCoreConsumerFixture()` 与现有 13 项握手矩阵可检查消费方。

```js
import {CORE_CONTRACT_DEFINITION, createCoreContractExamples, createCoreProviderFixture} from 'hanamesh-core/contract/fixtures';
const definition = CORE_CONTRACT_DEFINITION;
const examples = await createCoreContractExamples();
const provider = createCoreProviderFixture({initialConsent: 'withheld'});
await provider.setConsent('granted');
```

卡片中的 `getConsent` 错误来自调用前的服务握手，是 `{status,reason,...}`，不能当成 getConsent 抛出的异常。既有握手还返回 `CORE_NOT_OBJECT`。卡片声明的运行错误保留原码：`CORE_NOT_READY`（503）、`CORE_DEVICE_CORRUPT`（500）；后者对应设备密钥读取/签名的损坏守卫。现有实现的输入、销毁及可选 server nonce 路径守卫另列在 `implementationErrors`，不隐藏为卡片错误。`getServerOrigin()` 的产品实现直接返回生效的 `string | null`（0.3.4 起 = Core 设置页保存的地址 ?? 插件配置；更换后下一次调用即返回新值；销毁后仍如此），没有就绪异常守卫：`CORE_NOT_READY` 是卡片声明的可用性错误，`implementationErrors: []` 表示当前 getter 不抛此码。离线的 null 不是错误；`getSession()` 为可能陈旧的观察，不是授权证明。

J1.S4 起 `CORE_NOT_READY` 有了具体触发条件：本机共享设备身份文件不可读或损坏时，`getDeviceId` / `getPublicKey` / `sign` / `signRequest` / `getSession` 都抛 `CORE_NOT_READY`（503），Core 不会新建身份顶替；原因与文件位置在 `GET state` 的 `identity` 字段与设置段里（见 API.md「本机共享设备身份」）。修复后经 `POST refresh` 恢复，无需重启。合约形状与错误码集合不变。

本交接只整理本仓定义，未在此发布新的合约包。


### 无 TTY 自检的依赖目录重建

根目录 `pnpm-workspace.yaml` 明确只选择当前包（`packages: ['.']`），并设置 `confirmModulesPurge: false`，继续使用既有冻结 lock。已装依赖来自另一个 HOME/store 时，pnpm 可重建生成的 node_modules，不依赖调用方设置 CI 或提供 TTY。无 CI、无 TTY 的两 store 实际安装回归验证此路径，仍使用 `--frozen-lockfile`。该选项在本仓固定 pnpm 10.33.0 的 YAML 设置中生效，放入 .npmrc 不会传入对应安装选项。


## D-77 完整提供方说明

### 协议1提供方调用补充（D-77审核通过，117346af历史快照）

依据：本模块main117346af77cab016a109f14f45155719fe873b2d的src/contract.ts、controller.ts、device.ts、errors.ts和dsh.mjs。只追加现行事实和使用说明，不删除旧条目、不升级协议、不调整签名覆盖范围。以下SOURCE提供方测试不是宿主装配证据。

#### 服务实例与调用判据

Cordis服务名`hanameshCore`；`protocolVersion`实际为字符串`'1'`，不是数字1。必需方法依次为getDeviceId、sign、signRequest、getConsent、onConsentChange、getSession、getServerOrigin；可选能力getPublicKey、getHealth；本节对应117346af历史快照。0.3.12现行可选能力为getPublicKey、getHealth、getSuiteDeclaration，详见[公开套件声明](SUITE_DECLARATION.md)。函数存在以`typeof value[name] === 'function'`判断，允许原型方法；getPublicKey不属于协议1必需方法，使用前须检查其能力。

本包checkCoreService返回诊断值，不会代替服务调用或注册：null/undefined→{status:'absent',reason:'CORE_ABSENT'}；非object→{status:'incompatible',reason:'CORE_NOT_OBJECT'}；协议不在消费者支持的字符串列表（默认['1']）→CORE_PROTOCOL_UNSUPPORTED，provided为字符串或null，supported为支持列表；必需方法缺失→CORE_METHOD_MISSING并按上列顺序返回missing；完整→{status:'present',protocolVersion:'1',optional:[实际存在的可选函数名]}。这种present仅说明形状，不能证明实际Cordis注入、身份准备、同意、服务端可达或健康。getter自身抛出的访问错误不会被该诊断函数归一化。

#### 逐调用输入、输出、错误与约束

|调用|输入|返回及执行方式|现行提供方错误/约束|
|---|---|---|---|
|getDeviceId|无|同步string|身份不可用CORE_NOT_READY(503)，释放后CORE_DISPOSED(503)|
|getPublicKey|无|同步string，当前设备raw32字节Ed25519公钥的无填充base64url|同getDeviceId；此调用读取已存公钥，不替代签名时的密钥一致性校验|
|sign|Uint8Array确切字节（Buffer可用）|同步Uint8Array，64字节原始Ed25519签名|CORE_NOT_READY/CORE_DISPOSED；私钥解析或公私钥/deviceId不一致CORE_DEVICE_CORRUPT(500)。类型不合法不保证统一Core错误|
|signRequest|{method:string,path:string,body:Uint8Array\|null}|异步Promise，见下节四个字符串头|输入结构/body/path不合法CORE_INPUT_INVALID(400)，身份/密钥/释放错误同上；server nonce失败CORE_UPSTREAM_UNAVAILABLE(503)，载体限制/IO错误保留实际原因|
|getConsent|无|同步'granted'\|'withheld'|直接读当前存储值；CORE_ABSENT/PROTOCOL_UNSUPPORTED/METHOD_MISSING是调用前诊断，不是此getter抛出的业务错误|
|onConsentChange|(state,changedAt)=>void|同步返回()=>void退订函数；不返回Promise|没有初始回放；两个位置参数不是单一对象；监听器异常隔离，见下节|
|getSession|无|同步只读SessionSnapshot|CORE_NOT_READY/CORE_DISPOSED；不要求已注册或已同意|
|getServerOrigin|无|同步规范化origin string\|null|实际无条件读取生效地址（0.3.4：设置页地址 ?? 配置），包括身份失败和释放后；null表示本地离线配置，无自动网络探测|
|getHealth|无|同步HealthSnapshot|可选只读健康视图，不是授权依据；尚未检查时返回repair/CHECK_NOT_RUN|

**逐方法适用条件（Q-212已澄清）**：旧摘要getServerOrigin合列CORE_NOT_READY，按上表将设备准备错误限于实际受保护调用；现有配置getter无条件string或null，保留旧摘要与协议，不新增抛错，不把null当网络或身份失败。协议诊断与getConsent实际调用也须分开。不存在“主体未知原因”新字段，不为消费者私有实现新增字段/错误。

#### 设备归属、原始字节签名、同意

getDeviceId为`base64url(sha256(rawPublicKey32))`，43字符无填充；getPublicKey为同设备raw32字节的base64url（43字符）。不是PEM/SPKI文本。验签库需要SPKI时可把raw32接在DER前缀`302a300506032b6570032100`后构造Ed25519公钥。sign不做JSON编码、哈希、前缀、换行或请求规范化，直接Ed25519签给定字节。

签名时校验存储PKCS8私钥导出的公钥与存储公钥及deviceId一致；未就绪/损坏时不能生成替代身份。私钥永不作为合约输出。sign和signRequest是密码学原语，当前实现不因withheld或未注册拒绝签字节；usage应在采集/发送入口检查同意。签名可验不等于服务端登记、账号绑定或允许采集。

以下六事实仅为本方密码学FIXTURE输入，验证sign原样签Uint8Array，不是当前C-USAGE正式业务字段顺序/JSON/UTF-8编码规范；Core不依赖其正式确认才能交付。本例选择deviceId、hanaRef、action、occurredAt、eventId、nonce顺序JSON.stringify，然后UTF-8编码；更改字段/属性顺序/空白会改变给定字节，不能冒充已被原签名保护。扩展字段如何进入业务签名由C-USAGE提供方定义，Core不会替对端限制或剔除字段。

历史出处只登记：0.3.2 及以前曾以devDependencies引用 `@hanamesh/api-contracts` git-tag v0.10.0（resolved 7ddb2be334ad80dfed05d1e0f5128926bb82a3b3；contracts/usage/events.js SHA256 `930fa4db27b08c76b6320a0b5f9198632e75b4466bed9a8b2d0acec6609ccdc3`），0.3.3 已移除。它不是当前API权威。正式业务编码需求已由PM写入原ServerUsage提供方卡，Core不设反向依赖。

固定公开测试设备示例（仅FIXTURE，不属于真实账号/设备）：
```
publicKey = 11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo
deviceId = If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk
UTF8原文 = {"deviceId":"If4x36FUomFia_hUBG_SJxt77UtqvkWqWId-9H-XIbk","hanaRef":"hana_fixture_雪","action":"use","occurredAt":"2026-01-01T00:00:00.000Z","eventId":"event-fixture-1","nonce":"event-nonce-1"}
64字节签名的base64url = HvBngPnB1nkwPUex8f5ZdgPFTfmgpF6xbDGB9nhks-gVNrAn2Y_af4pe9TWIdepcTLUCIANOczsUwGWHaGrHBA
```
原文相同重复签名确定相同；修改任一事实、JSON属性顺序、空白、改为竖线串/哈希文本均验签失败。实际签名输出是Uint8Array，上面为展示编码，不能把base64url文本当原始签名验证。

#### signRequest的原覆盖范围与正负例

输入必须包含body，undefined不是null；null和零字节Uint8Array的sha256相同。Buffer是Uint8Array；一般数组/对象/字符串不是合法body。method使用原字符串toUpperCase，不trim，不自行白名单化；当前仅检查其类型，不承诺额外HTTP token语法校验。实际HTTP客户端另有方法/载体规则，不新增已不存在的限制。

path从首个?或#开始删除后缀，保留此前原样pathname：必须以/开始，不能含竖线；不URL decode、不重排参数、不normalize路径。query/fragment不进入签名。body以实际发送的精确字节计算sha256小写hex，不JSON parse/stringify重写；空白和属性顺序影响签名。

签名原文为UTF-8：`METHOD|pathname|timestamp|nonce|hex(sha256(body))`；timestamp为Date.now()十进制Unix毫秒字符串。默认nonce来自16随机字节base64url；authNonceSource='server'时通过既有设备challenge端口请求{purpose:'auth'}，只采用返回的非空nonce，不静默回退/重试。

返回仅四个字段：x-hm-device-id=当前deviceId；x-hm-timestamp=该timestamp；x-hm-nonce=该nonce；x-hm-signature=64字节Ed25519签名的无填充base64url。deviceId头、query、fragment、Origin、Host、cookie、content-type以及其它头均不在上述原文内。不得擅自追加覆盖范围，服务端仍需使用deviceId解析公钥并执行自己的注册、撤销、nonce/时钟/权限检查。

正例：POST /v1/usage/events传实际JSON批次UTF-8字节；GET /v1/usage/me/contributions?from=a&to=b配body:null只签pathname；DELETE /v1/usage/me/devices/:deviceId/events配body:null或空字节只签pathname。不向网络发请求也能以固定timestamp=1767225600000、nonce=auth-fixed-fixture-nonce独立验签（test/core-public-provider.test.mjs）。改变方法/path/timestamp/nonce/body任一被覆盖字节验签失败；将带查询的完整path参与验签失败；相同timestamp/nonce下修改未签查询不改变签名，不能宣称查询受保护。此POST请求签名不是批次内每条事件的sign(bytes)签名。

#### SessionSnapshot完整字段与未知含义

|字段|类型与来源|
|---|---|
|protocolVersion|'1'|
|deviceId|string，当前身份|
|registration|'unregistered'\|'registered'\|'failed'，当前登记状态|
|principalId|string\|null，存储的服务端登记结果；null不代表未绑定或无账号|
|bound|boolean\|null，来自已有贡献读取；null=尚无可靠绑定观察，不能从余额/登记状态推断|
|serverReachable|boolean\|null，最近登记/刷新观察；null=尚未观察|
|checkedAt|string\|null，与上述服务端观察对应的ISO时间，不是getter调用时间|
|reason|string\|null，registration.lastError；非完整健康/未知原因统一枚举|

初始例：{protocolVersion:'1',deviceId:'上述FIXTURE ID',registration:'unregistered',principalId:null,bound:null,serverReachable:null,checkedAt:null,reason:null}。未注册且reason=null是合法未知，并非把失败缓存为不存在。失败例：registration:'failed',principalId:null,reason:'IDENTITY_RATE_LIMITED',serverReachable:false,checkedAt:'2026-01-01T00:00:00.000Z'；失败也可能保留先前principalId，不可重写为假主体。getter返回冻结快照，不暴露私钥/账号cookie。

getHealth返回{revision:number,mode:'normal'\|'restricted'\|'blocked'\|'repair',components:readonly unknown[],fault?:string}；无检查例{revision:0,mode:'repair',components:[],fault:'CHECK_NOT_RUN'}。本补充不猜components的跨模块字段，不把健康状态当权限。

#### 同意事件、持久化与释放

公开订阅：`const unsubscribe = core.onConsentChange((state,changedAt)=>{...})`。文档旧摘要的{state,changedAt}描述事件事实，真实JS调用为两个位置参数；传单一对象回调需使用方自行适配，不改变提供方。

changedAt由成功同意写入生成的new Date().toISOString()原值，与存储consent.changedAt一致；先持久化并更新状态，再调用监听器。不回放初始值；包括同值再次写入，都会产生一次通知。时间戳不是单调序列号，两次写入可能处于同一毫秒。失败写入不改变同意且不通知；单个监听器抛错不阻止其它监听器。退订同步void、可重复调用、此后没有该监听器的通知；提供方dispose清空当前监听器并取消/释放自身资源。同意读取/配置getter不因dispose增加新错误，涉及设备的调用则CORE_DISPOSED。

### 证据界线与发布约束

test/core-public-provider.test.mjs使用真实SessionController.service及隔离内存存储/载体FIXTURE，检查原字节、独立crypto.verify、结构/生命周期。不是消费方duckCore，不是原生Desktop注入。scripts/segflow-plugin.test.mjs另由程序真实CLIENT执行设置操作；安装候选/默认manifest/实际resolved及激活前本地origin/共享身份路径收据必须保留。无skip、偷补依赖、改peer、关闭上游策略或fixture UI替代；最终包重取证，产品发行初开仍由DESK04承担。



### 确定性独立验签向量

`CORE_DETERMINISTIC_FIXTURE_VECTORS`（`hanamesh-core/contract/fixtures`）提供固定公开测试公钥、设备 id、原始 UTF-8 文本及签名和 POST/GET/DELETE 请求样例。请求头使用固定 timestamp/nonce，仅演示 canonical 字节，不是当前产品 signRequest 响应，也不允许将固定 nonce 用于业务发送。`bodyUtf8: null` 表示 null，空字符串表示空字节；用 TextEncoder 生成实际字节。向量不含私钥，不为 C-USAGE 制定业务编码。现有 createCoreContractExamples()/createCoreProviderFixture() 默认仍生成独立密钥。

`CORE_CONTRACT_DEFINITION.types` 的原七项保留，新增可选 getHealth 的 schema 在 `optionalTypes.HealthSnapshot` 引用同一冻结 schema；公开类型 HealthSnapshot 也由 fixtures 重导出。不改变 schema 文件/协议或老调用。

## DSH 首次使用记录提示（0.3.15）

公开本机 `GET /api/hanamesh/core/state` 增补 `consentPrompt: ConsentPrompt`（类型经 `hanamesh-core/contract` 导出，schema `$defs.ConsentPrompt`）；同源 `POST /api/hanamesh/core/consent/prompt-shown` 无正文，幂等返回 `{shownAt:ISO}`。可选 storage 字段 `usageConsentPromptShownAt` 保留旧快照兼容。首次仅默认 withheld/changedAt=null/无 marker 提示；明确拒绝或撤回以及原 granted 不提示。客户端实际显示后记录；稍后、ESC、卸载不授权，只有本人开启调用原同意写屏障。详情及多窗口范围见 `API.md`。


Binding deadline handoff (0.3.19): both controller bind-link and portable agent bindLink return the same `{url,expiresAt}` shape and add `expiresAt=<the original Identity challenge response>` plus `expiryClock=identity-server` to `/me/bind`. The deadline must be canonical UTC millisecond ISO; invalid/missing data is CORE_UPSTREAM_RESPONSE_INVALID/502, with no local TTL or replacement challenge. Identity nonce signature and three-field bind submission remain unchanged.

These URL values are editable, unsigned display hints. They are not a fresh challenge-status check, serverNow or a grant to enable Confirm; they cannot extend Identity's stored deadline or single-use acceptance. The clock domain is Identity's authoritative server storage (currently PostgreSQL now), not Core/browser/chain time. No exact countdown or used/revoked status is supplied; Identity must define a trustworthy status/time contract before a website can claim that verification. OAuth must preserve the same original query, never silently refresh or submit it. The website sends only deviceId/nonce/signature to Identity, never these metadata fields.

### 0.3.20 · Core 面板的宿主模态所有权

设置、本机使用记录、首次同意与积分提示统一使用 DSH 公开 ui-primitives Modal，Core 提供 open/onClose/title/headless/className/内容，不进入浏览器原生 top layer。宿主拥有 body portal、层级、Escape/Tab、焦点恢复；宿主 onboarding 晚于 Core 出现时应处于前景并可正常点击，关闭后 Core 保持，子面板关闭只释放子层。Core 不读取/修改宿主 root/inert 或其它 dialog，不改客户端。新增明确宿主 peer/client inject ui-primitives；其版本范围与现有0.2.x宿主范围一致。后台层通过公开 isBehindModal 与 portal 变更事件等待宿主释放前景，无定时器/重试；可见提示标记仅在 portal 连接并处于前景后提交，覆盖入场与提交之间宿主再获前景的竞争。业务API、身份、签名、默认关闭与本人授权写屏障不变。

积分绑定提示同样仅在Core Modal实际入场且位于前景后记录原points/prompt-shown标记；宿主等待中卸载不记为已显示。标记写失败保留提示并说明检查设置，不自动重试/绑定。

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
| `getServerOrigin()` | `() => string \| null` | 配置的 Server origin；null = 离线 | 是 |
| `getHealth()` | `() => HealthSnapshot` | 组件健康快照 | 否 |

契约明确不暴露私钥、PKCS8、token、cookie、nonce、传输实例或 storage-domain 写接口。

## 发布形态（rc.55 起，只加不改）

协议仍是 `'1'`，上表方法、字段与拒绝语义不变。rc.55 在同一个 `./contract` 导出下增加可选的机器可读部分，供提供方与消费方跑同一套检查：

| 导出 | 内容 |
|---|---|
| `hanamesh-core/contract` | 上述类型；新增 `CORE_SERVICE_NAME`、`CORE_PROTOCOL_VERSION`、`CORE_SUPPORTED_PROTOCOL_VERSIONS`、`CORE_REQUIRED_METHODS`（7 个）、`CORE_OPTIONAL_METHODS`（`getPublicKey`、`getHealth`）与握手 `checkCoreService(value, accept?)` |
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

不做静默兼容：版本不符或缺方法一律 `incompatible`。`absent / incompatible / present` 三态与 Usage 现有 `duckCore` 一致。

### 提供方套件检查项

`handshake.present`、`handshake.rejects-other-version`、`surface.closed`（不多暴露成员）、`identity.deviceId`、`identity.publicKey`、`sign.ed25519`（64 字节且可用 `getPublicKey` 验签、不改输入）、`signRequest.canonical`（四个头；`METHOD|pathname|unixMilliseconds|nonce|hex(sha256(body))` 验签；去掉 query/fragment）、`signRequest.rejects-invalid`、`consent.state`、`consent.subscribe`（订阅不回放、经提供方自己的写路径改一次只通知一次、取消后不再通知、结束恢复原值）、`session.schema`、`serverOrigin`、`health.schema`。

### 消费方套件

消费方给出接受函数 `accept(value) → {status, reason?}`，对 13 项握手矩阵逐项给出与 `checkCoreService` 相同的 `status`（给了 `reason` 时也要相同）。

### 版本规则

只加可选成员 = 小版本，仍是 `'1'`，加进 `CORE_OPTIONAL_METHODS` 与 schema；删除、改名、改语义 = `'2'`，按合约卡批次同步所有消费方后发布。

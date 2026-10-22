# HanaMesh Core API

所有路由由 DSH Connection fetch carrier 注册，前缀为 `/api/hanamesh/core/`。写路由要求同载体 `Origin` 且拒绝 cross-site Fetch Metadata；JSON 请求体上限 4096 字节。错误统一为 `{error:{code,message}}`。

| 方法 | 路径 | 返回 / 语义 |
|---|---|---|
| `GET` | `state` | 设备 id、公钥（本机共享身份不可用时两者为 `null`、`session` 为 `null`）、`identity`（见下文「本机共享设备身份」）、注册观察、同意状态、会话观察、`account`（rc.26 起：已绑定且 usage ≥rc.3 时为 `{provider:'github', displayName}`，否则 `null`）、两个组件健康投影、贡献累计或明确 unavailable；不含私钥。0.3.4 起另有 `serverOrigin`（**生效**地址）、`serverOriginSource: 'setting'|'config'`、`configuredServerOrigin`（插件配置的出厂默认）、`serverOriginFault`（已存地址不再合法时为 `CORE_ORIGIN_REJECTED`，此时出厂默认生效，否则 `null`）；`contributions` 为 `{status:'ready', windowDays, availability:'available'|'unavailable'|null, actions}` 或 `{status:'unavailable', reason}`（`reason` 含 `CONSENT_WITHHELD`）|
| `POST` | `client-peer-lease` | 0.3.17。自有客户端当前页面的 React 观察：精确五字段、Connection 准入/同载体 Origin/JSON4096；立即返回200 application/octet-stream与固定首帧，持有响应体至取消/关闭；request signal、body.cancel或Core释放均撤租，不记录使用或修改同意。无效观察400、不活动409、缺能力503；详见 [套件声明](SUITE_DECLARATION.md)。不占 Gateway RPC interceptor。 |
| `POST` | `consent/prompt-shown` | 0.3.15。无 body，同源写准入与其它 POST 相同；仅在 DSH Modal 获准显示、内容 portal 实际连接且其拥有前景后调用。将可选字段 `usageConsentPromptShownAt` 持久化，返回 `{shownAt:ISO}`；并发调用共用首次写入，已有值原样返回。只记实际显示，不授权、不注册、不上报。 |
| `POST` | `consent` | 请求 `{state:'granted'|'withheld'}`；完整镜像发布成功后广播。0.3.4 起：改为 `granted` 时，未注册则立即注册并启动贡献刷新，已注册则只启动贡献刷新；改为 `withheld` 时停止贡献刷新但**不注销**（Usage 需要已注册的设备去发服务端删除）|
| `POST` | `server` | 0.3.4。请求恰好一个键 `{serverOrigin:'<origin>'}` 设置、`{serverOrigin:null}` 清除（回到插件配置的出厂默认）。约定同 `consent`：同源 POST、`content-type: application/json`、≤4096 字节；形状不对 400 `CORE_INPUT_INVALID`，415/413 同为 `CORE_INPUT_INVALID`；地址校验与配置 `serverOrigin` 相同（HTTPS，或 loopback HTTP `127.0.0.1`/`localhost`/`[::1]`，可带端口；不能带路径、query、fragment、账号密码），不合法 400 `CORE_ORIGIN_REJECTED`。设置持久化在 `hanamesh_core` 快照的可选字段 `serverOriginOverride`（旧快照无此字段仍可加载）。生效地址 = 设置 ?? 配置，立即生效：重建服务端传输，`getServerOrigin()` 返回新地址（Usage 每次上传都读它）。生效地址改变时：注册重置为 `unregistered`（注册属于某个服务端），清空贡献/分/名称缓存与 `bound`/`account`，停止贡献刷新，已授权则立即向新服务端注册；仍在飞往旧服务端的请求结果一律不记录。返回新的 `state` |
| `POST` | `device/register` | 手动重试挑战→注册；失败仍保留本地设备能力。0.3.4 起数据授权未开启 → 409 `CORE_CONSENT_REQUIRED`（不计入 `attempts`、不发任何请求）；激活时也只有已授权才自动注册 |
| `GET` | `health` | 当前 `hanamesh_core_health` 快照 |
| `POST` | `health/recheck` | 重新读取 Loader 与包元数据并发布一个完整快照 |
| `POST` | `open-external` | 请求 `{url}`；只允许 `url.origin === websiteOrigin`；系统打开器默认关闭 |
| `POST` | `bind-link` | 无 body；向 Server 取 `bind` 挑战并用设备私钥签 `utf8(nonce)`，返回 `{url, expiresAt}`，`url` = `websiteOrigin` + `/me/bind?deviceId&nonce&signature&expiresAt&expiryClock`（O2 绑定落地页；identity `POST /v1/identity/me/devices/bind` 验签 nonce）；未配置 `serverOrigin` 或 `websiteOrigin` → 409 `CORE_URL_NOT_ALLOWED`；0.3.4 起数据授权未开启 → 409 `CORE_CONSENT_REQUIRED` |
| `GET` | `points` | rc.42：宿主用设备签名读服务端 `GET /v1/custody/me/points`，并以公开 Registry profile 补充可读的 `displayName`（不存在则 `not-found`，读取失败则 `failed` 与原因，客户端保留积分并显示故障）。返回 `{status:'ready'|'unavailable', reason, totalPoints, pendingTotal, hanas:[{hanaId,displayName,points,pending,breakdown:{install,open,use,claimBonus,creatorMirror,launchInitiator}}], bound, deviceId, prompt:{show, shownAt}}`。六类是**按类型汇总**，不是逐笔历史；所有数值单位是**分**，不是代币。`status:'unavailable'` 的 `reason`：`NOT_CONNECTED`、`CONSENT_WITHHELD`、`NOT_REGISTERED`、`CORE_UPSTREAM_UNAVAILABLE`。「已绑定」只有一个来源：Usage `GET /v1/usage/me/contributions` 的 `bound`（及 `account`），即本结果的 `bound` 与 `state.session.bound`（`null` 表示未知）。custody 返回的 C-POINTS 必填 `bindingStatus: UNBOUND | BOUND` 仍按服务端合约校验（缺失或非法时返回 `CORE_UPSTREAM_UNAVAILABLE`），但不输出、不使用。设置页仅在积分 `ready` 且 `bound === false` 时显示「未绑定：只累计、暂不可领」（包括零积分空态）；`bound === null` 时不显示该行。`bound: true` 只表示账号已绑定，不表示钱包或领取资格。成功结果默认缓存 60 秒（`pointsRefreshMs`），`refresh` 与同意开关会清缓存。`prompt.show` 由宿主判定：`pendingTotal > 0 && bound !== true && shownAt === null` |
| `GET` | `activity[?from=<ISO>&to=<ISO>&after=<opaque>]` | rc.42：宿主用**本设备签名**读现有 Usage `GET /v1/usage/me/devices/:deviceId/events`；返回 `{status,reason,items:[{hanaRef,action,occurredAt}],nextAfter,window}`。缺省近 `contributionWindowDays` 天（默认 90）、显式窗口最长 90 天（C-USAGE 上限）、每页最多 200、服务端原有升序游标；后续页必须原样带 `window.from/to` 与 opaque `after`，不接受任意设备 ID。宿主只投影这三个字段，不把原始事件的签名、nonce、主体或回执给浏览器。它仅是本设备未撤回且未过保留期的**事件历史**，无逐事件获分；客户端到尾后才将最新 25 项倒序展示，未到尾必须告知不完整。|
| `POST` | `points/prompt-shown` | rc.31（T2）。无 body；把一次性绑定引导标记 `pointsBindPromptShownAt` 落到 `hanamesh_core` storage-domain 并返回 `{shownAt}`。幂等：已有标记时原样返回，不覆盖。该字段在 schema 里是 optional，rc.30 及更早的快照仍能加载 |
| `POST` | `refresh` | 无 body；共享设备身份处于 `failed` 时先重新解析，再刷新贡献与分，返回 `state` |
| `GET` | `diagnostics` | 生命周期与 origin 诊断；再次经过秘密字段过滤 |

设备注册签名是 Ed25519 `utf8(nonce ‖ publicKey字符串)`；rc.26 起注册体多一个可选 `label {hostname, os, shell}`（`os.hostname()` ≤64、`${platform}-${arch}` ≤32、`HANAMESH_SHELL ?? 'dsh'` ≤48；桌面壳设 `HANAMESH_SHELL=hanamesh-desktop/<version>`），identity ≥0.2.0-rc.3 存下并在网站设备列表显示；identity rc.2 对未知键返回 400 且不消费 nonce，core 随即取新挑战、不带 label 重注册；`signRequest` 的 canonical bytes 是 `METHOD + '|' + pathname + '|' + unixMilliseconds + '|' + nonce + '|' + hex(sha256(body || ''))`（rc.9 起，见文末「与 O1 identity 的线上格式」），输出四个 `x-hm-*` 头；默认客户端随机 nonce，配置可切服务端 auth challenge（identity 0.2.0-rc.1 的 challenge 只接受 `register|bind`，`authNonceSource:'server'` 在该版本会被拒绝，保持默认 `'client'`）。

## 本机共享设备身份（J1.S4）

同一 OS 用户下的 DSH 与 HanaMesh 桌面客户端各有自己的 storage-domain，但签名用的设备身份只有一份：
`<root>/identity/device.json`（目录 0700、文件 0600，内容 `{schemaVersion:1, deviceId, publicKey, privateKeyPkcs8, createdAt}`）。
`<root>` 依次取插件配置 `sharedIdentityDir`（绝对路径）、环境变量 `HANAMESH_SHARED_HOME`（绝对路径）、`~/.hanamesh-shared`。
默认值刻意不放在任何一个客户端自己的 home（`~/.dsh`、`~/.hanamesh`）里。两个客户端必须解析到同一个 `<root>`；
设置段会显示实际路径，配置不一致时两边显示的路径不同、设备 id 也不同，可据此发现。

文件是一次写入：先用 `wx` 写临时文件再 `link(2)` 到最终名，已存在则失败，因此并发的首次启动不会互相覆盖，所有进程读回同一个赢家。
每次启动按下表决定本客户端用哪个身份，`state().identity.source` 记录结果：

| 共享文件 | 本客户端 `hanamesh_core.device` | 结果 `source` | 本客户端存储的变化 |
|---|---|---|---|
| 有、与本地相同 | 同一 id | `existing` | 无 |
| 有 | 无 | `adopted` | `device` 写为共享身份 |
| 有、与本地不同 | 另一 id | `conflict` | `device` 改为共享身份；原身份（含私钥）追加到 `replacedDevices[]`，不删除；`registration` 复位为 `unregistered`（原注册属于旧密钥），随后按正常流程注册共享身份 |
| 无 | 有（J1.S4 之前的旧客户端） | `migrated` | 无；本地身份原样成为共享身份 |
| 无 | 无 | `created` | 新建密钥写入共享文件，`device` 镜像之 |

冲突规则是「先写入共享文件者为准」。被替换身份在服务端仍是一台独立设备；它未绑定时的待绑定分**不会**自动转入共享身份，
设置段会列出被替换的设备 id 并说明这一点（当前合约没有设备合并接口）。

共享文件不可读（`CORE_DEVICE_STORE_UNAVAILABLE`，`identity.detail` 带 errno）或损坏（`CORE_DEVICE_CORRUPT`：JSON 无法解析、字段缺失、
私钥/公钥/deviceId 不一致）时：**不新建身份、不覆盖共享文件、不改本客户端存储**，`identity.status='failed'`；
`getDeviceId` / `getSession` / `signRequest` 抛 `CORE_NOT_READY`，不注册、不签名。设置段显示原因与文件路径，
用户修复或移走文件后点「重新读取设备身份」（`POST refresh`）即重新解析，无需重启。

`identity` 字段：`{status:'shared'|'local-only'|'failed', location, source, reason, detail, replacedDeviceIds[]}`。
`local-only` 只出现在未传入共享存储的直接调用（测试替身）；产品入口 `dsh.mjs` 总是接入共享存储。

## 客户端席位

浏览器 bundle 只注册原生 `settings.section` 与 `sidebar.footer.action` 两个席位，不使用 webserver index 注入或自有 fixed 覆盖层。0.3.20 起，侧栏设置、本机使用记录子面板、首次同意及积分提示统一使用公开 `@deepseek-ai/dsh-client-ui-primitives` 的 `Modal`（显式 client inject 与宿主 peer）；Core 只提供完整内容和本地 onClose，body portal、模态层级、Escape/Tab 与焦点返回均归 DSH。不能在这些入口调用浏览器 showModal：浏览器 top layer 会逃逸宿主 root inert，覆盖后来出现的 API key onboarding。Core 不查询/修改宿主 DOM、inert、z-index 或 pointer-events，也不主动关闭宿主 dialog。同一 HanaMesh 段仍注册在官方 settings.section；绑定返回仍通过 focus/visibility 刷新。后台 Core 模态在 DSH 的公开 isBehindModal 判定允许前通过 portal 插入/移除事件等待，不用计时器/重试；已打开后由 DSH 管理后来的宿主前景。首次同意只有内容 portal 实际连接且处于前景才记提示标记，本人点击才授权；已有 API/存储字段与写屏障不变。

客户端每 10 秒读取 `state`，同一轮再读 `points`。同意开关、注册重试、健康重查都在成功后重新读取；失败显示错误码并保留服务端真值。贡献与分的 unavailable 都不显示为 0。

rc.31 的一次性绑定引导挂在 `sidebar.footer.action`（始终挂载），每 60 秒读一次 `points`；`prompt.show` 为真时先 `POST points/prompt-shown` 落标记、再用上述 DSH Modal 弹出（不使用自有 fixed/top-layer 覆盖层）。绑定按钮走既有 `bind-link` + `open-external`。「账号」行的「邮箱绑定」只打开 `websiteOrigin + /me`，邮箱表单与验证在网站侧（T8/T9）。

## 主要错误码

- `CORE_INPUT_INVALID`：请求体、方法或同源围栏不满足。
- `CORE_ORIGIN_REJECTED`：配置或设置页填写的 Server/Website origin 非允许的 HTTPS 或 loopback HTTP 根 origin。
- `CORE_DEVICE_CORRUPT`：公钥、私钥和 device id 不自洽，签名关闭。
- `CORE_DEVICE_ID_MISMATCH`：注册响应 device id 与本机派生值不一致。
- `CORE_UPSTREAM_UNAVAILABLE`：Server 未配置、网络失败或响应不合法。
- `CORE_URL_NOT_ALLOWED`：外链不是配置的 Website origin。
- `CORE_CONSENT_REQUIRED`（409，0.3.4）：该操作会把本设备公钥与标签发给服务端（注册、绑定链接），需先打开数据授权。设置页显示「打开数据授权后才会向服务端注册设备」；未注册且未授权时注册行显示「未注册：打开数据授权后注册」。
- `CORE_NOT_READY` / `CORE_DISPOSED`：服务尚未准备或已释放。

## 与 O1 identity 的线上格式（rc.9 定稿，以 identity `docs/API.md` 为准）

- 注册：`signature = base64url(ed25519(utf8(nonce ‖ publicKey)))`，`publicKey` 是发送的 base64url 字符串本身，不是原始 32 字节。
- 请求头：`x-hm-timestamp` 为 Unix **毫秒**；签名串 `METHOD|PATH|TIMESTAMP|NONCE|hex(sha256(body))`，`PATH` = 路径名（不含 query/fragment，O1 usage/identity 均按路由路径验签），含 `|` 的路径拒绝。
- 所有请求带 `Origin = serverOrigin`（identity 对 POST/PATCH 强制精确 Origin）。
- 证据：`docs/acceptance/recovery-20260919/real-server.log`（真实 `hanamesh-server@0.2.0-rc.1` + PostgreSQL 17.6：注册 201/幂等 200、`/v1/identity/me` 200、贡献 200 含 `bound`、篡改与 rc.8 旧格式均 401）。

### Q61 配置与可见故障

`timeoutMs` 默认10000、范围10..60000；`checkIntervalMs` 默认3000、范围250..60000。新增 `profileTimeoutMs` 默认1500（正安全整数，实际不超过timeoutMs）、`maxHanaRows` 默认200（正安全整数，本地响应行预算，不是服务分页限制）、`maxResponseBytes` 默认1048576（正安全整数，每个响应的内存预算）。插件配置可修改，state/diagnostics及设置展示当前值。超行预算返回CORE_POINTS_LIMIT_EXCEEDED，超响应预算返回CORE_RESPONSE_LIMIT_EXCEEDED；不截断积分或金额。

名称结果包含displayNameStatus ready/not-found/failed与displayNameReason：404且响应码为REGISTRY_NOT_FOUND才判不存在；其他404仍为故障，传输/非法响应失败保留权威积分且显示故障，失败不缓存为不存在。显式refresh清名称缓存；窗口focus/visibility返回沿既有refresh更新。注册失败不安排后台指数重试，错误保留在registration.lastError及registrationFailure；失败状态无法保存时另外显示CORE_STORAGE_UNAVAILABLE，通过设置中重试注册重新发起。dispose中止本模块活动请求，不改变设备/同意/签名和持久化schema身份。

客户端与读取调度配置：`clientPollIntervalMs=10000`、`pointsRefreshMs=60000`、`contributionIntervalMs=60000`、`activityPageBudget=5`、`activityDisplayRows=25`、`catalogConcurrency=4`。它们是本地展示、缓存或资源预算，不是签名/权限安全常量；均可在插件配置设置正安全整数，定时器上限为 JavaScript 有符号 32 位毫秒值。活动游标保持不透明，达到扫描预算仍明确显示未到末尾并支持继续加载。上游单页 200 条、金额与签名约束保持。

`contributionWindowDays`（0.3.4）：贡献累计与活动缺省窗口的天数，默认 90，整数 1..90（C-USAGE 规定原始事件窗口最长 90 天；服务端自己的原始事件保留天数 `retentionDays` 是服务端设置，服务端不公布）。state/diagnostics 的 `configuration` 与设置页「运行配置」行展示当前值，所有「近 N 天」文案随它变化。贡献响应 `availability:'unavailable'`（窗口有一部分超出服务端保留或无法精确恢复）时保留数字并在设置页注明「服务端只保留了这个窗口的一部分记录，数字不完整」；服务端未给 `availability` 时为 `null`，设置页注明未说明是否完整；其他取值视为非法响应 `CORE_UPSTREAM_UNAVAILABLE`。

服务端地址（0.3.4）：设置页「服务端」行显示生效地址及其来源（「出厂默认」/「你设置的」，后者同时显示出厂默认），可填写并「保存」、或「恢复默认」，不合法时显示原因；经 `POST server` 写入，立即生效，不需要改 profile 的 `cordis.patch.yml`。

D7 原生 Desktop 会先校验 `dsh-app://app` 来源，再去掉 Origin 转发到带自身认证 cookie 的宿主 Connection。Core 产品入口调用官方 `connection.requestRejection` 认证，只有被它接纳的原生请求可缺少 Origin；独立路由仍要求原同源 Origin，有 Origin 的产品写入仍核对同源。未取消认证或扩大来源白名单。


## 正常安装前配置与公开契约（D-77）

固定官方目标是 Desktop/DSH 0.2.1-alpha.2、Cordis 4.0.5-alpha.1（D7源d743267388641bc76f17c45ce8b4c231aed1d32c），安装操作使用官方 bundled pnpm11.28.5的正常策略；源声明不是实际resolved证据。Desktop公开管理流程要求先初始化profile、完全退出，再通过其官方CLI `dsh plugin --profile desktop add <本候选tgz>`安装，然后重开。此操作由管理该Desktop生命周期的程序执行，Core测试不启停服务。本文不宣称当前机制已有准备/安装步骤或该版本已发布至npm。

根入口导出PluginConfig；Core正常apply通过configOf校验。serverOrigin/websiteOrigin必填string|null，合法HTTPS或现行127.0.0.1/localhost/[::1] HTTP根origin（0.3.4 修正：WHATWG URL 的 IPv6 hostname 带方括号，此前 `[::1]` 实际被拒），无凭据/路径/query/fragment；共享身份sharedIdentityDir为绝对路径或null/未给。profile.schema.json是套件画像，不是插件配置schema，当前无导出的DSH config schema对象。

隔离运行必须在Core首次激活前由管理程序将本轮配置应用到正常profile配置层；仅给本轮loopback服务或明确null，sharedIdentityDir明确指向环境内路径，清继承凭据并隔离HOME/DSH_HOME/用户数据。生产默认值不改，不能先激活默认生产origin再事后检查。

```yaml
# 路径示例须由管理程序替换为其当轮环境内绝对路径；不是用户手填的验收步骤。
- id: hanamesh-core
  config:
    serverOrigin: null
    websiteOrigin: null
    sharedIdentityDir: /OWNED_CURRENT_ENVIRONMENT/core-shared
    allowSystemBrowser: false
```

配置null是明确离线，不自动推断网络/身份失败。共享身份回退仍按原产品规则；隔离测试不得依靠回退。具名预算默认/合法范围沿上文；设置中的预算span只展示对应标签和值，origin应通过正式state/diagnostics读取，身份路径在设备身份行可见。

完整C-CORE九调用/事件、错误分组、原字节与请求覆盖、SessionSnapshot与退订参见CORE_CONTRACT.md。getServerOrigin无条件string|null，不增加就绪抛错；onConsentChange真实回调为(state,changedAt)两个位置参数，旧对象摘要描述事件事实，changedAt取成功持久写入。六事实签名向量只作FIXTURE，不代替当前C-USAGE规范。发布包不包含原生测试观察插件或测试输入生成器。


## Core 0.3.12 optional Cordis suite declaration

`hanameshCore.getSuiteDeclaration(request?)` is a read-only optional protocol1 port. No HTTP route is added. See [C-CORE delivery draft](SUITE_DECLARATION.md) for the DTO, registry configuration, compatibility ownership and I adaptation.

## 首次使用记录提示（0.3.15）

`state.consentPrompt: ConsentPrompt` = `{show:boolean, shownAt:ISO|null}`；仅当 consent=withheld、changedAt=null 且从未显示时 show=true。旧快照无 marker 仍可加载，granted 或 changedAt 非 null 的明确拒绝/撤回均不提示。marker 存在时重启/同 profile 重装不再提示；稍后和 ESC 只关闭。显示失败不写 marker，持久化失败返回 503 `CORE_STORAGE_UNAVAILABLE`，显示错误和设置入口，不隐藏重试。只有本人点击「开启」才使用原 `POST consent`、通知/注册屏障并重新读取确认；未答复不记录，设置随时可关。

客户端模块内 queue 串行 StrictMode/多挂载，实际打开才 stamp，并等待写入结束再释放；Web Locks 可用时同时串行同 origin 的多页。无 Web Locks 时独立窗口首次同时打开可能各显示一次；两者均必须本人明确开启，不改变 consent 默认值。首次提示披露目标服务端，未配置时给 `CORE_SERVER_NOT_CONFIGURED` 和设置入口。绑定另行确认，积分与作者收入按服务端规则处理。

文案：「开启后，符合规则的插件使用可计贡献积分并支持作者收入；仅记录时间、插件、功能、成败和渠道，不保存/上传对话、工具内容、文件或凭据；设置可随时关闭。」同意仍沿用现有范围，不为未上报元数据新增采集器。

## B17 local source lifecycle (candidate)

`hanamesh-core/suite/source` additionally exports createManagedSuitePackageSource, suiteSourceOptions/suiteSourceSnapshot validators and their read-only types. The manager takes explicit configured options/null and its owned source store, exposes service.getState, getConfiguration, configure and close. Ordinary Core apply owns the actual domain and read-only Cordis discovery service `hanameshSuiteSource`; consumers should use that service, not create another lifecycle owner. See SUITE_DECLARATION.md for options, selection/error semantics and own admitted source settings route. The existing v1 Core required methods/consent/signing/identity/authorities and health defaults are unchanged.


Binding deadline handoff (0.3.19): both controller bind-link and portable agent bindLink return the same `{url,expiresAt}` shape and add `expiresAt=<the original Identity challenge response>` plus `expiryClock=identity-server` to `/me/bind`. The deadline must be canonical UTC millisecond ISO; invalid/missing data is CORE_UPSTREAM_RESPONSE_INVALID/502, with no local TTL or replacement challenge. Identity nonce signature and three-field bind submission remain unchanged.

These URL values are editable, unsigned display hints. They are not a fresh challenge-status check, serverNow or a grant to enable Confirm; they cannot extend Identity's stored deadline or single-use acceptance. The clock domain is Identity's authoritative server storage (currently PostgreSQL now), not Core/browser/chain time. No exact countdown or used/revoked status is supplied; Identity must define a trustworthy status/time contract before a website can claim that verification. OAuth must preserve the same original query, never silently refresh or submit it. The website sends only deviceId/nonce/signature to Identity, never these metadata fields.

积分绑定提示同样仅在Core Modal实际入场且位于前景后记录原points/prompt-shown标记；宿主等待中卸载不记为已显示。标记写失败保留提示并说明检查设置，不自动重试/绑定。

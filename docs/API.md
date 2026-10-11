# HanaMesh Core API

所有路由由 DSH Connection fetch carrier 注册，前缀为 `/api/hanamesh/core/`。写路由要求同载体 `Origin` 且拒绝 cross-site Fetch Metadata；JSON 请求体上限 4096 字节。错误统一为 `{error:{code,message}}`。

| 方法 | 路径 | 返回 / 语义 |
|---|---|---|
| `GET` | `state` | 设备 id、公钥（本机共享身份不可用时两者为 `null`、`session` 为 `null`）、`identity`（见下文「本机共享设备身份」）、注册观察、同意状态、会话观察、`account`（rc.26 起：已绑定且 usage ≥rc.3 时为 `{provider:'github', displayName}`，否则 `null`）、两个组件健康投影、贡献累计或明确 unavailable；不含私钥 |
| `POST` | `consent` | 请求 `{state:'granted'|'withheld'}`；完整镜像发布成功后广播 |
| `POST` | `device/register` | 手动重试挑战→注册；失败仍保留本地设备能力 |
| `GET` | `health` | 当前 `hanamesh_core_health` 快照 |
| `POST` | `health/recheck` | 重新读取 Loader 与包元数据并发布一个完整快照 |
| `POST` | `open-external` | 请求 `{url}`；只允许 `url.origin === websiteOrigin`；系统打开器默认关闭 |
| `POST` | `bind-link` | 无 body；向 Server 取 `bind` 挑战并用设备私钥签 `utf8(nonce)`，返回 `{url, expiresAt}`，`url` = `websiteOrigin` + `/me/bind?deviceId&nonce&signature`（O2 绑定落地页；identity `POST /v1/identity/me/devices/bind` 验签 nonce）；未配置 `serverOrigin` 或 `websiteOrigin` → 409 `CORE_URL_NOT_ALLOWED` |
| `GET` | `points` | rc.42：宿主用设备签名读服务端 `GET /v1/custody/me/points`，并以公开 Registry profile 补充可读的 `displayName`（不存在则 `not-found`，读取失败则 `failed` 与原因，客户端保留积分并显示故障）。返回 `{status:'ready'|'unavailable', reason, bindingStatus, totalPoints, pendingTotal, hanas:[{hanaId,displayName,points,pending,breakdown:{install,open,use,claimBonus,creatorMirror,launchInitiator}}], bound, deviceId, prompt:{show, shownAt}}`。六类是**按类型汇总**，不是逐笔历史；所有数值单位是**分**，不是代币。`status:'unavailable'` 的 `reason`：`NOT_CONNECTED`、`CONSENT_WITHHELD`、`NOT_REGISTERED`、`CORE_UPSTREAM_UNAVAILABLE`。`ready` 返回 C-POINTS v0.10.0 的必填 `bindingStatus: UNBOUND | BOUND`；`bindingStatus` 缺失或非法时返回 `CORE_UPSTREAM_UNAVAILABLE`，不从余额或 Usage 的绑定状态推断；设置页在 `UNBOUND` 时显示「未绑定：只累计、暂不可领」，包括零积分空态。`BOUND` 只表示账号已绑定，不表示钱包或领取资格。成功结果默认缓存 60 秒（`pointsRefreshMs`），`refresh` 与同意开关会清缓存。`prompt.show` 由宿主判定：`pendingTotal > 0 && bound !== true && shownAt === null` |
| `GET` | `activity[?from=<ISO>&to=<ISO>&after=<opaque>]` | rc.42：宿主用**本设备签名**读现有 Usage `GET /v1/usage/me/devices/:deviceId/events`；返回 `{status,reason,items:[{hanaRef,action,occurredAt}],nextAfter,window}`。缺省近 90 天、每页最多 200、服务端原有升序游标；后续页必须原样带 `window.from/to` 与 opaque `after`，不接受任意设备 ID。宿主只投影这三个字段，不把原始事件的签名、nonce、主体或回执给浏览器。它仅是本设备未撤回且未过保留期的**事件历史**，无逐事件获分；客户端到尾后才将最新 25 项倒序展示，未到尾必须告知不完整。|
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

浏览器 bundle 只注册原生 `settings.section` 与 `sidebar.footer.action` 两个席位，不使用 webserver index 注入，也不画 fixed 覆盖层。固定 D7 DSH `0.2.1-alpha.2` 上，侧栏按钮打开 Core 自有的原生 `<dialog>` 设置页；同一 HanaMesh 段仍注册在官方 `settings.section`，关闭时释放页面并恢复焦点。绑定返回通过窗口 focus/visibility 刷新，不依赖深链。

客户端每 10 秒读取 `state`，同一轮再读 `points`。同意开关、注册重试、健康重查都在成功后重新读取；失败显示错误码并保留服务端真值。贡献与分的 unavailable 都不显示为 0。

rc.31 的一次性绑定引导挂在 `sidebar.footer.action`（始终挂载），每 60 秒读一次 `points`；`prompt.show` 为真时先 `POST points/prompt-shown` 落标记、再用原生 `<dialog>` 的 top layer 弹出（不使用 fixed 覆盖层）。绑定按钮走既有 `bind-link` + `open-external`。「账号」行的「邮箱绑定」只打开 `websiteOrigin + /me`，邮箱表单与验证在网站侧（T8/T9）。

## 主要错误码

- `CORE_INPUT_INVALID`：请求体、方法或同源围栏不满足。
- `CORE_ORIGIN_REJECTED`：配置的 Server/Website origin 非允许的 HTTPS 或 loopback HTTP 根 origin。
- `CORE_DEVICE_CORRUPT`：公钥、私钥和 device id 不自洽，签名关闭。
- `CORE_DEVICE_ID_MISMATCH`：注册响应 device id 与本机派生值不一致。
- `CORE_UPSTREAM_UNAVAILABLE`：Server 未配置、网络失败或响应不合法。
- `CORE_URL_NOT_ALLOWED`：外链不是配置的 Website origin。
- `CORE_NOT_READY` / `CORE_DISPOSED`：服务尚未准备或已释放。

## 与 O1 identity 的线上格式（rc.9 定稿，以 identity `docs/API.md` 为准）

- 注册：`signature = base64url(ed25519(utf8(nonce ‖ publicKey)))`，`publicKey` 是发送的 base64url 字符串本身，不是原始 32 字节。
- 请求头：`x-hm-timestamp` 为 Unix **毫秒**；签名串 `METHOD|PATH|TIMESTAMP|NONCE|hex(sha256(body))`，`PATH` = 路径名（不含 query/fragment，O1 usage/identity 均按路由路径验签），含 `|` 的路径拒绝。
- 所有请求带 `Origin = serverOrigin`（identity 对 POST/PATCH 强制精确 Origin）。
- 证据：`docs/acceptance/recovery-20260919/real-server.log`（真实 `hanamesh-server@0.2.0-rc.1` + PostgreSQL 17.6：注册 201/幂等 200、`/v1/identity/me` 200、贡献 200 含 `bound`、篡改与 rc.8 旧格式均 401）。

### Q61 配置与可见故障

`timeoutMs` 默认10000、范围10..60000；`checkIntervalMs` 默认3000、范围250..60000。新增 `profileTimeoutMs` 默认1500（正安全整数，实际不超过timeoutMs）、`maxHanaRows` 默认200（正安全整数，本地响应行预算，不是服务分页限制）、`maxResponseBytes` 默认1048576（正安全整数，每个响应的内存预算）。插件配置可修改，state/diagnostics及设置展示当前值。超行预算返回CORE_POINTS_LIMIT_EXCEEDED，超响应预算返回CORE_RESPONSE_LIMIT_EXCEEDED；不截断积分或金额。

名称结果包含displayNameStatus ready/not-found/failed与displayNameReason：404且响应码为REGISTRY_NOT_FOUND才判不存在；其他404仍为故障，传输/非法响应失败保留权威积分且显示故障，失败不缓存为不存在。显式refresh清名称缓存；窗口focus/visibility返回沿既有refresh更新。注册失败不安排后台指数重试，错误保留在registration.lastError及registrationFailure；失败状态无法保存时另外显示CORE_STORAGE_UNAVAILABLE，通过设置中重试注册重新发起。dispose中止本模块活动请求，不改变设备/同意/签名和持久化schema身份。

客户端与读取调度配置：`clientPollIntervalMs=10000`、`pointsRefreshMs=60000`、`contributionIntervalMs=60000`、`activityPageBudget=5`、`activityDisplayRows=25`、`catalogConcurrency=4`。它们是本地展示、缓存或资源预算，不是签名/权限安全常量；均可在插件配置设置正安全整数，定时器上限为 JavaScript 有符号 32 位毫秒值。活动游标保持不透明，达到扫描预算仍明确显示未到末尾并支持继续加载。原 90 天业务窗口、上游单页 200 条、金额与签名约束保持。

D7 原生 Desktop 会先校验 `dsh-app://app` 来源，再去掉 Origin 转发到带自身认证 cookie 的宿主 Connection。Core 产品入口调用官方 `connection.requestRejection` 认证，只有被它接纳的原生请求可缺少 Origin；独立路由仍要求原同源 Origin，有 Origin 的产品写入仍核对同源。未取消认证或扩大来源白名单。

# HanaMesh Core API

所有路由由 DSH Connection fetch carrier 注册，前缀为 `/api/hanamesh/core/`。写路由要求同载体 `Origin` 且拒绝 cross-site Fetch Metadata；JSON 请求体上限 4096 字节。错误统一为 `{error:{code,message}}`。

| 方法 | 路径 | 返回 / 语义 |
|---|---|---|
| `GET` | `state` | 设备 id、公钥、注册观察、同意状态、会话观察、`account`（rc.26 起：已绑定且 usage ≥rc.3 时为 `{provider:'github', displayName}`，否则 `null`）、两个组件健康投影、贡献累计或明确 unavailable；不含私钥 |
| `POST` | `consent` | 请求 `{state:'granted'|'withheld'}`；完整镜像发布成功后广播 |
| `POST` | `device/register` | 手动重试挑战→注册；失败仍保留本地设备能力 |
| `GET` | `health` | 当前 `hanamesh_core_health` 快照 |
| `POST` | `health/recheck` | 重新读取 Loader 与包元数据并发布一个完整快照 |
| `POST` | `open-external` | 请求 `{url}`；只允许 `url.origin === websiteOrigin`；系统打开器默认关闭 |
| `POST` | `bind-link` | 无 body；向 Server 取 `bind` 挑战并用设备私钥签 `utf8(nonce)`，返回 `{url, expiresAt}`，`url` = `websiteOrigin` + `/me/bind?deviceId&nonce&signature`（O2 绑定落地页；identity `POST /v1/identity/me/devices/bind` 验签 nonce）；未配置 `serverOrigin` 或 `websiteOrigin` → 409 `CORE_URL_NOT_ALLOWED` |
| `GET` | `points` | rc.42：宿主用设备签名读服务端 `GET /v1/custody/me/points`，并以公开 Registry profile 补充可读的 `displayName`（不可用则 `null`，客户端回退短 ID）。返回 `{status:'ready'|'unavailable', reason, totalPoints, pendingTotal, hanas:[{hanaId,displayName,points,pending,breakdown:{install,open,use,claimBonus,creatorMirror,launchInitiator}}], bound, deviceId, prompt:{show, shownAt}}`。六类是**按类型汇总**，不是逐笔历史；所有数值单位是**分**，不是代币。`status:'unavailable'` 的 `reason`：`NOT_CONNECTED`、`CONSENT_WITHHELD`、`NOT_REGISTERED`、`CORE_UPSTREAM_UNAVAILABLE`。成功结果缓存 60 秒，`refresh` 与同意开关会清缓存。`prompt.show` 由宿主判定：`pendingTotal > 0 && bound !== true && shownAt === null` |
| `GET` | `activity[?from=<ISO>&to=<ISO>&after=<opaque>]` | rc.42：宿主用**本设备签名**读现有 Usage `GET /v1/usage/me/devices/:deviceId/events`；返回 `{status,reason,items:[{hanaRef,action,occurredAt}],nextAfter,window}`。缺省近 90 天、每页最多 200、服务端原有升序游标；后续页必须原样带 `window.from/to` 与 opaque `after`，不接受任意设备 ID。宿主只投影这三个字段，不把原始事件的签名、nonce、主体或回执给浏览器。它仅是本设备未撤回且未过保留期的**事件历史**，无逐事件获分；客户端到尾后才将最新 25 项倒序展示，未到尾必须告知不完整。|
| `POST` | `points/prompt-shown` | rc.31（T2）。无 body；把一次性绑定引导标记 `pointsBindPromptShownAt` 落到 `hanamesh_core` storage-domain 并返回 `{shownAt}`。幂等：已有标记时原样返回，不覆盖。该字段在 schema 里是 optional，rc.30 及更早的快照仍能加载 |
| `GET` | `diagnostics` | 生命周期与 origin 诊断；再次经过秘密字段过滤 |

设备注册签名是 Ed25519 `utf8(nonce ‖ publicKey字符串)`；rc.26 起注册体多一个可选 `label {hostname, os, shell}`（`os.hostname()` ≤64、`${platform}-${arch}` ≤32、`HANAMESH_SHELL ?? 'dsh'` ≤48；桌面壳设 `HANAMESH_SHELL=hanamesh-desktop/<version>`），identity ≥0.2.0-rc.3 存下并在网站设备列表显示；identity rc.2 对未知键返回 400 且不消费 nonce，core 随即取新挑战、不带 label 重注册；`signRequest` 的 canonical bytes 是 `METHOD + '|' + pathname + '|' + unixMilliseconds + '|' + nonce + '|' + hex(sha256(body || ''))`（rc.9 起，见文末「与 O1 identity 的线上格式」），输出四个 `x-hm-*` 头；默认客户端随机 nonce，配置可切服务端 auth challenge（identity 0.2.0-rc.1 的 challenge 只接受 `register|bind`，`authNonceSource:'server'` 在该版本会被拒绝，保持默认 `'client'`）。

## 客户端席位

浏览器 bundle 只注册原生 `settings.section` 与 `sidebar.footer.action` 两个席位，不使用 webserver index 注入，也不画 fixed 覆盖层。固定 DSH `0.1.5-alpha.1` 没有公开的 `settings.open(section)` 服务，因此侧栏动作点击原生 Settings trigger，再选择名为 `HanaMesh` 的原生 section nav；页面本身仍由 `settings.section` 所有者渲染。

客户端每 10 秒读取 `state`，同一轮再读 `points`。同意开关、注册重试、健康重查都在成功后重新读取；失败显示错误码并保留服务端真值。贡献与分的 unavailable 都不显示为 0。

rc.31 的一次性绑定引导由 `sidebar.footer.action`（始终挂载）驱动，每 60 秒（及窗口变为可见时）读一次 `points`。rc.47 起（P05-CORE-01）：`prompt.show` 为真且窗口可见时，原生 `<dialog>` 挂到 `document.body`（不放进宿主可能隐藏的侧栏槽位）并以 top layer 打开；**只有确认已打开且在屏幕上可见后**才 `POST points/prompt-shown` 落标记。打不开、不可见或窗口隐藏时立即关回、不落标记，等下一次轮询或窗口可见；组件卸载时一并移除。不使用 fixed 覆盖层。`prompt.show/shownAt` 与 `pointsBindPromptShownAt` 语义不变。绑定按钮走既有 `bind-link` + `open-external`。「账号」行的「邮箱绑定」只打开 `websiteOrigin + /me`，邮箱表单与验证在网站侧（T8/T9）。

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

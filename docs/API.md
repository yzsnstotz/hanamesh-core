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
| `GET` | `diagnostics` | 生命周期与 origin 诊断；再次经过秘密字段过滤 |

设备注册签名是 Ed25519 `utf8(nonce ‖ publicKey字符串)`；rc.26 起注册体多一个可选 `label {hostname, os, shell}`（`os.hostname()` ≤64、`${platform}-${arch}` ≤32、`HANAMESH_SHELL ?? 'dsh'` ≤48；桌面壳设 `HANAMESH_SHELL=hanamesh-desktop/<version>`），identity ≥0.2.0-rc.3 存下并在网站设备列表显示；identity rc.2 对未知键返回 400 且不消费 nonce，core 随即取新挑战、不带 label 重注册；`signRequest` 的 canonical bytes 是 `METHOD + '|' + pathname + '|' + unixMilliseconds + '|' + nonce + '|' + hex(sha256(body || ''))`（rc.9 起，见文末「与 O1 identity 的线上格式」），输出四个 `x-hm-*` 头；默认客户端随机 nonce，配置可切服务端 auth challenge（identity 0.2.0-rc.1 的 challenge 只接受 `register|bind`，`authNonceSource:'server'` 在该版本会被拒绝，保持默认 `'client'`）。

## 客户端席位

浏览器 bundle 只注册原生 `settings.section` 与 `sidebar.footer.action` 两个席位，不使用 webserver index 注入，也不画 fixed 覆盖层。固定 DSH `0.1.5-alpha.1` 没有公开的 `settings.open(section)` 服务，因此侧栏动作点击原生 Settings trigger，再选择名为 `HanaMesh` 的原生 section nav；页面本身仍由 `settings.section` 所有者渲染。

客户端每 10 秒读取 `state`。同意开关、注册重试、健康重查都在成功后重新读取；失败显示错误码并保留服务端真值。贡献 unavailable 不显示为 0。

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

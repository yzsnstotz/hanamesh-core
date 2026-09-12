# MOD-02 公共契约 · v0.1.0-rc.1 / protocolVersion 1

## 消费方式

其他模块消费锁定 npm tarball，不导入 `src/`、`lib/controller.js`、transport 或宿主私有实现。仓内保留 SRV-01 原公开 `PrincipalDTO` 声明，不另定义账户真相。

```ts
import type { IdentityClientService, SessionSnapshot } from 'hanamesh-plugin-identity/contracts';
import { BrowserIdentityClient } from 'hanamesh-plugin-identity/client';

// 普通宿主插件：ctx.hanameshIdentity 的结构为 IdentityClientService。
export async function readOwnData(identity: IdentityClientService) {
  const check = await identity.checkIdentity();
  if (!check.serviceReady || !check.authenticated) return null;
  // check 不包含任何资源授权结论；最终返回仍可能是 401 / 403。
  return identity.request({path: '/v1/identity/me'});
}

// 仅在已经通过 DSH 宿主认证的同源浏览器页面使用。
const client = new BrowserIdentityClient();
const observed: SessionSnapshot = await client.state();
```

`ctx.hanameshIdentity` 方法：`getState()`、`subscribe(listener)`（返回取消订阅函数）、`checkIdentity()`、`request(ScopedRequest)`、`checkLocalAccess('local'|'protected')`。Browser SDK 只有 `state()`、`checkIdentity()`、`request()`；无登录凭据 API、token getter、auth 实例或权限签发器。

`checkLocalAccess` 是当前观察下的本地 UX 门，不替代 `request` 的重新认证，更不是远端权限。订阅通知只是状态通知；任务取消由业务 owner 根据自己的既定策略执行。

## 状态与错误

| status | 呈现 | 受保护操作 |
|---|---|---|
| signed_out | 未登录 | 拒绝 |
| signing_in | 登录中 | 拒绝；等待远端确认及本地镜像发布 |
| signed_in | 已登录 | 重新认证，再交给资源端逐次授权 |
| expired | 已过期 | 拒绝；覆盖登出、401、重启后过期观察 |
| unavailable | 身份服务不可达／身份通道不可用 | 拒绝；reason 区分网络、协议、存储、停用原因 |

快照还包含 `serviceReady: boolean|null`、`principal`、`checkedAt`、`reason`、`requiredLogin`、`protectedOperations`、`privateWork:'preserved'`、`logoutPending`、`persistence`。快照不可写；`getState` 不访问远端，因此它可能已陈旧，不能作授权证明。`checkedAt` 只给已验证的当前主体。

`checkIdentity()` 返回 `{serviceReady, authenticated, resourceAuthorization:'not-evaluated'}`。401 可以表示身份服务可达但用户未认证；不能把这种情况显示成网络故障。403 资源拒绝不自动抹掉一个有效主体。

错误都是固定 `IdentityClientError`，含 `code`、HTTP `status` 和中文说明；不保留上游 body、cause、Cookie、密码或请求 URL。常用 code：`AUTH_REQUIRED`、`AUTH_FORBIDDEN`、`AUTH_UNAVAILABLE`、`STORAGE_UNAVAILABLE`、`REVOCATION_UNCONFIRMED`、`REQUEST_NOT_ALLOWED`、`OPERATION_SUPERSEDED`。

## 资源请求

`ScopedRequest` 只接受 `{path, method?, body?}`；无 URL origin、任意 header、authorization、principalId 注入参数。默认只允许 `/v1/identity` 下的公开契约：GET me / principals/:UUID、PATCH me displayName。额外资源前缀需由 profile 显式配置在同一固定 origin，且对应服务必须自己逐次鉴权；增加前缀不授予用户权限。

每次 `request()`：校验路径／方法 → 本地立即拒绝无身份／不可用 → GET `/v1/identity/me` 重新认证 → 将私有内存 cookie 交给同 origin 资源端 → 保留 401/403 拒绝语义。不会伪造 Authorization 或 `x-principal-id`，不按客户端 scopes 自行准许跨主体访问。

拒绝跨 origin、重定向、URL userinfo、穿越、含混百分号编码、凭据 query 参数、未知 header 输入和通用 `/api/auth/*` 代理。JSON 请求体上限 16 KiB；远端 JSON 响应上限 1 MiB；字段名类似 token／cookie／password 的响应字段及回显的内存 cookie 字节被过滤。这不是任意第三方敏感数据的通用脱敏器。

## 本机同源路由

所有 `/api/hanamesh/identity/*` 注册在 DSH 已认证的 Connection fetch carrier，不能直接挂到无认证 HTTP 服务器。写操作额外检查精确浏览器 Origin、Fetch Metadata 和 JSON content type。

| 方法 | 路径后缀 | 输入／输出 |
|---|---|---|
| GET | state | 观察快照 |
| GET | diagnostics | 不含主体标识的状态／存储／撤销诊断 |
| POST | refresh | `{}` → 两步检查 |
| POST | sign-in | 仅所有者登录 UI 使用 `{email,password}` → 快照 |
| POST | sign-out | `{}` → 退出／撤销结果快照 |
| POST | request | ScopedRequest → `{status,data}` |

页面与脚本 `/hanamesh/identity`、`/hanamesh/identity/ui.js` 同样先调用宿主 `requestRejection`，不处理 launch token。页面禁止被 frame 嵌入，使用受限 CSP、no-store、nosniff 和纯 textContent 渲染主体文字。未认证宿主请求的拒绝由 DSH carrier 负责，本轮仅有装配替身验证。

## 配置与 sidecar

`PluginConfig`：必填 `identityOrigin`（精确 HTTPS origin）、`deploymentId`；可选 `requiredLogin=false`、`timeoutMs=10000`（10–60000）、`protectedPrefixes=['/v1/identity']`、`allowInsecureLoopback=false`。最后一项只允许 localhost / loopback 的 HTTP 开发服务，不开放任意明文远端。

sidecar 单元 `hanamesh_identity`，schemaVersion 1，single 布局，只有 global：`schemaVersion,revision,status,observedAt,logoutPending`。没有密码、邮箱、主体、token 或权限。旧 signed_in 记录仅产生 expired，不产生已认证身份；格式损坏不静默删除，进入不可用。实际打开损坏 domain 可能由宿主直接拒绝插件激活，产品修复入口由 MOD-01 负责。

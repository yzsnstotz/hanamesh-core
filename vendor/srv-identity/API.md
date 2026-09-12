# SRV-01 API · v0.1.0-rc.1

## HTTP（宿主同源、cookie 会话）

所有认证／身份响应 `Cache-Control: no-store`。不暴露 Better Auth 原始 token、session 或 user 响应。错误只有 `{ "error": { "code": "…", "message": "固定文案" } }`。

| 方法与路由 | 输入 | 成功 | 身份边界 |
|---|---|---|---|
| POST `/api/auth/sign-up/email` | `{email,password,name}` | `200 {ok:true}` + HttpOnly cookie | 只有显式打开注册；技术 slice 不证明邮箱所有权 |
| POST `/api/auth/sign-in/email` | `{email,password}` | `200 {ok:true}` + cookie | 交给 Better Auth 验证密码 |
| POST `/api/auth/sign-out` | `{}` + cookie | `200 {ok:true}` + 失效 cookie | 等待数据库撤销完成才返回成功 |
| GET `/v1/identity/me` | cookie | `{principal: PrincipalDTO}` | 每次重新查实际数据库会话并映射稳定主体 |
| GET `/v1/identity/principals/:principalId` | UUID 参数 + cookie | 本人 DTO | 非本人 403，不做他人存在性探测 |
| PATCH `/v1/identity/me` | `{displayName}` + cookie | 更新后本人 DTO | 不允许写 principalId、role、emailVerified 等字段 |

所有 POST/PATCH 要求精确的 `Origin` 和 `Content-Type: application/json`，包括本地 CLI。POST body 上限 8192 bytes，PATCH 上限 1024 bytes。名称 1–120 个 JavaScript 字符单元，密码 12–128，邮箱最长254；成熟认证库继续负责自身邮箱验证与密码强度／散列规则。**没有泛用 `/api/auth/*` 代理**，无 `/get-session` 原始输出、社交账号绑定、SIWE 或管理员端点。

运行入口不提供 CORS 跨站 cookie 策略；建议前端经过宿主同源代理。Tauri 原生 Origin／跨域部署要在客户端模块与薄宿主联合决定，不用通配 Origin 解决。

## DTO

```ts
interface PrincipalDTO {
  readonly principalId: string; // 本地业务 UUID，与 auth user.id 不同
  readonly deploymentId: string;
  readonly displayName: string;
  readonly scopes: readonly ('identity:read:self' | 'identity:update:self')[];
}
```

没有邮箱、钱包地址、session id、token、密码散列或数据库连接信息。作用域只说明本身份模块自己的自助操作，不等于 paid/publisher/admin/资产签名权限。`@hanamesh/server-identity/contracts` 不依赖 Fastify、Drizzle、DSH 或 Node。

## 服务契约

`authenticate({cookie}) -> VerifiedActor`：验证本次会话，返回不可伪造的进程内短期 actor。无 cookie/过期/撤销返回401，组件/数据库问题503，业务主体停用403。

`authorize(credentials, {action,loadResource,policy})`：每次 authenticate，加载资源，校验动作与资源策略；只有严格 `true` 允许，异常／truthy字符串／缺返回值拒绝。资源 null 为404。异步 load/policy 超过 actor 有效期也拒绝。

`updateOwnProfile(actor,input,{executor}?)`：只写 actor 本人的名称；actor 必须由同一服务当前请求创建。传入外部事务执行器时不接管事务；不传时模块自己借连接并事务提交。不要返回给客户端外部事务尚未提交的成功。

`identityPreHandler(services,options)`：Fastify消费者安装guard。身份依赖缺失时同步抛错；`onAuthorized` 可为 async，其异常同样导致拒绝。Fastify封装不是不可信插件沙箱。

## 状态码

401：`AUTH_REQUIRED`、`IDENTITY_AUTH_FAILED`。
403：`AUTH_FORBIDDEN`、`IDENTITY_ORIGIN_REJECTED`。
400：`IDENTITY_INPUT_INVALID`；宿主解析器也可能返回413/415。
404：`IDENTITY_NOT_FOUND`。
429：`IDENTITY_RATE_LIMITED`，Retry-After60秒。
503：`AUTH_UNAVAILABLE`、`IDENTITY_NOT_READY`、`DB_SCHEMA_MISSING`、`DB_ROLE_UNSAFE`、`IDENTITY_DEPLOYMENT_MISMATCH`。
500：`IDENTITY_CONFIG_INVALID`（启动时配置失败，不对外泄露具体密钥/URL）。

错误体不转发认证库错误（防用户存在性信息泄漏）或数据库异常。访问日志必须由宿主脱敏；本模块不能保证宿主自定义日志插件不会额外记录秘密。

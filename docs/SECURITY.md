# 安全与一致性边界

## 不作的保证

本机是客户端信任范围。Node 进程内的恶意插件、同源恶意脚本、拥有机器权限的用户或被替换的 fetch 均不在本插件能防篡改的边界内。本插件不把 Rust、DSH core、本地文件、scopes 或“已登录”标记当运营方权威，不宣称恶意本机代码绝对拿不到内存凭据。

一份 DSH profile 对应单所有者会话；多个浏览器连接同一 profile 会观察同一主体。本模块不支持以连接 cookie 作多租户隔离，不应部署成给互不信任用户共享的登录网关。

## 唯一身份来源与资源端授权

固定 SRV-01 公开契约：邮箱／密码 POST `/api/auth/sign-in/email`，主体 GET `/v1/identity/me`，撤销 POST `/api/auth/sign-out`。禁止引入第二个 Better Auth 实例、权限签发器、钱包签名器或本地授权账本。不消费原始 get-session/auth 对象。

服务端必须每次验证会话、主体及具体资源权限。删除客户端 guard 后资源端仍须拒绝——本轮只有 contract fixture，D05/D07 的真实服务负测未完成，不能据本轮单测宣布远端安全验收通过。

## 凭据与请求约束

密码只保留在登录 UI 的临时变量／请求中；提交、完成、pagehide 时清空密码输入，宿主 action 完成后释放引用。不记录输入或错误 cause；不声称能抹除 JavaScript 引擎、浏览器密码管理器、操作系统或抓包软件的所有内存副本。

Cookie jar 使用宿主对象私有字段，不落盘。只从精确成功的 SRV-01 auth JSON 响应接受 Set-Cookie；校验 HttpOnly、HTTPS Secure、匹配 domain、path、过期和特殊前缀。普通响应的 Set-Cookie 不建立身份。Jar 不暴露在服务、SDK、DTO、日志或 diagnostics 中。浏览器只向已认证同源 DSH 发请求，不接触远端 cookie。

所有远端请求固定 origin；写请求 Origin 由配置得出，不透传浏览器／调用插件 header。拒绝重定向，不跟随到第三方，响应体有大小上限。并发 operation generation 与 AbortController 一起使用：迟到登录／资源结果不能越过后来的退出；timeout 后迟到 cookie 也不被接受。

## 登出、重启与剩余远端会话

退出先在内存拒绝新保护操作，再用一次完整 sidecar 发布记录待撤销；随后联系远端。即使 sidecar 已关闭，仍尝试远端撤销。成功且确实持有本次 session cookie，才允许记录这次撤销完成。

远端不可达时不能说“服务器已退出”。Cookie 只留作撤销重试，禁止业务请求重新使用。停止进程或 SIGKILL 后 cookie 不保留，所以无法凭本机观察重建撤销请求。没有 cookie 的 sign-out 即使返回 200，也不证明过去的会话已撤销；新登录／新会话登出不能清掉更早的未确认记录。此限制需要服务器原有过期或获授权的服务端撤销流程处理；本插件没有该管理契约，不能伪造接口。

在远端完成登录但本机尚未发布观察时崩溃，可能留下远端有效、本机不再持有凭据的 session。`consistency.json` 明确允许这一安全侧残留；它不恢复本机授权、不等于服务器 session 被自动回收。SIGKILL、进程重启不等于整机物理断电或磁盘故障证明。

## 数据与生命周期

sidecar 保存非授权观察，不写 DSH session 事件。每次转移只调用一次 `global.set`，不是通过“同一个 domain 的多次写”冒充事务。存储错误时不删除文件，不把未经持久确认的已登录观察发给消费者。宿主开 domain 失败时激活失败，不能静默提供一个无鉴权替代服务。

本模块不管理业务数据库、任务进程或会话文档；不会删除私有工作。`subscribe` 通知用于业务 owner 的任务收敛，observer 抛异常不能回滚已经发布的状态。dispose 尽早中断请求和清除 cookie，只关闭自己持有的 domain，并注销自己注册的路由／服务／事件。

## 验证边界

离线源码扫描、合成 Cookie/密码的泄漏测试、输入验证、跨主体 403、重放 401、超时与并发负测、变异和实际 SIGKILL 已执行。真实服务器、PostgreSQL、DSH storage-domain backend、宿主浏览器认证链路和 ui-kit 视觉还没有验收；参见 AC-24 的 BLOCKED 项，禁止用测试替身关闭这些门。

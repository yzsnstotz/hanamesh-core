# 安全边界

本插件不持有账号 cookie，不做邮箱或密码登录；账号绑定、认领与资产动作在网站完成。

设备私钥存放在本机共享身份文件 `<root>/identity/device.json`（目录 0700、文件 0600，见 API.md「本机共享设备身份」），由同一 OS 用户下的各客户端共用，并镜像在各客户端自己的 `hanamesh_core` storage-domain；冲突时被替换的旧私钥保留在本客户端存储的 `replacedDevices`，不删除。共享文件不可读或损坏时不新建、不覆盖，签名失败关闭（`CORE_NOT_READY`）。设备私钥只在插件进程内用于 `sign` / `signRequest`，不会进入契约响应、HTTP、日志或 diagnostics。远端 origin 固定，不跟随重定向；外链只允许与配置的 website origin 完全相同。

Core 的同意状态是本机真相。安装不等于同意，默认 `withheld`；事件采集、缓冲删除与远端撤回由 Usage 插件负责。

组件健康只读 Loader 公共观察与包元数据，不 import 或执行被检查包。健康快照是诊断投影，不是授权；`notice` 组件缺失不会禁用设备身份或同意开关，损坏/不可读/Loader 失败仍进入 `repair`。

浏览器实现仅占用 DSH 原生 `settings.section` 与 `sidebar.footer.action`，不注入 index、不创建 fixed UI。所有设置数据都来自本插件路由。系统浏览器调用只有 `allowSystemBrowser:true` 且完整 origin 匹配时才执行；网页仍用 `window.open(..., 'noopener,noreferrer')` 打开新标签。


Binding deadline handoff (0.3.19): both controller bind-link and portable agent bindLink return the same `{url,expiresAt}` shape and add `expiresAt=<the original Identity challenge response>` plus `expiryClock=identity-server` to `/me/bind`. The deadline must be canonical UTC millisecond ISO; invalid/missing data is CORE_UPSTREAM_RESPONSE_INVALID/502, with no local TTL or replacement challenge. Identity nonce signature and three-field bind submission remain unchanged.

These URL values are editable, unsigned display hints. They are not a fresh challenge-status check, serverNow or a grant to enable Confirm; they cannot extend Identity's stored deadline or single-use acceptance. The clock domain is Identity's authoritative server storage (currently PostgreSQL now), not Core/browser/chain time. No exact countdown or used/revoked status is supplied; Identity must define a trustworthy status/time contract before a website can claim that verification. OAuth must preserve the same original query, never silently refresh or submit it. The website sends only deviceId/nonce/signature to Identity, never these metadata fields.

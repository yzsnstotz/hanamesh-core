# 安全边界

本插件不持有账号 cookie，不做邮箱或密码登录；账号绑定、认领与资产动作在网站完成。

设备私钥只在插件进程内用于 `sign` / `signRequest`，不会进入契约响应、HTTP、日志或 diagnostics。远端 origin 固定，不跟随重定向；外链只允许与配置的 website origin 完全相同。

Core 的同意状态是本机真相。安装不等于同意，默认 `withheld`；事件采集、缓冲删除与远端撤回由 Usage 插件负责。

组件健康只读 Loader 公共观察与包元数据，不 import 或执行被检查包。健康快照是诊断投影，不是授权；`notice` 组件缺失不会禁用设备身份或同意开关，损坏/不可读/Loader 失败仍进入 `repair`。

浏览器实现仅占用 DSH 原生 `settings.section` 与 `sidebar.footer.action`，不注入 index、不创建 fixed UI。所有设置数据都来自本插件路由。系统浏览器调用只有 `allowSystemBrowser:true` 且完整 origin 匹配时才执行；网页仍用 `window.open(..., 'noopener,noreferrer')` 打开新标签。

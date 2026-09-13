# DSH 桥接 Request.url 是内部地址，Origin 应与已认证载体 Host 比较

ID: `plugin-identity-dsh-bridge-origin-20260913`
模块：MOD-02 plugin-identity；适用 DSH 0.1.5-alpha.1、SRV-01 0.1.0-rc.1、插件 0.1.0-rc.3。
证据类型：SOURCE + TDD_RED_GREEN + REAL_HOST + REAL_API；原始输出见 `docs/acceptance/recovery-20260913/plugin-identity-wave2/`。

隔离 DSH 里 GET 页面与状态正常，全部同源 POST 却是 `IDENTITY_ORIGIN_REJECTED` 403。真实 DSH 的 `dsh-client-connection` 把传给插件的 WHATWG `Request.url` 构造成 `http://dsh.internal`，同时保存已通过 DSH browser/Host/Origin 门的外部 `Host` 与 `Origin`。旧插件拿外部 Origin 与内部 URL origin 比较，合法请求必失败；只跑未设置 Host 的直接 Request fixture 无法发现。

先加模拟真实桥接输入的失败测试，保持跨站、错端口、`null` Origin 负测；再在有 Host 的 DSH 请求中要求 Origin 是规范化的 http(s) origin 且其 host 与 Host 相等。无 Host 的直调保留旧 `Request.url.origin` 门。`skipLibCheck:false` 和 DSH 自身认证没有被关闭。rc.3 真宿主 + 真 SRV-01 回归：登录 200、本人资源 200、跨主体 403、退出后保护请求 401。独立 Chrome 页表单再验证同一链路。

复用时先查载体如何构造插件 Request；不要假设 `Request.url` 一定是用户浏览器地址，也不要为了通过测试去掉 Origin 校验。新的宿主版本若改变桥接行为，应先跑 red/green 路由测试和真实宿主负测，再决定是否调整校验。rc.3 的 README/API 改动随包内容升版，未覆写 rc.2 原字节。

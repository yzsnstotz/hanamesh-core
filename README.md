# hanamesh-core

> 🧪 O3 集成验证候选 `0.2.0-rc.10`（= rc.9 + `dependencies` 重钉 `@hanamesh/dsh-app-host@0.1.0-rc.14`，代码相同；耦合审计 2026-09-20），固定 Node `24.13.1`、pnpm `10.33.0`、DSH `0.1.5-alpha.1`。**rc.9（本机回收 2026-09-19）：设备签名线上格式对齐 O1 identity `0.2.0-rc.1`（注册签 `utf8(nonce ‖ publicKey字符串)`；请求头 `METHOD|PATH|TIMESTAMP(ms)|NONCE|sha256(body)`，PATH 不含 query；所有请求带 `Origin = serverOrigin`）并在真实 `hanamesh-server@0.2.0-rc.1` + PostgreSQL 17.6 上过门；`dependencies` 改钉真件 `hanamesh-usage@0.2.0-rc.4` / `@hanamesh/dsh-app-host@0.1.0-rc.13`（patch 第三条 name 改为包根 `@hanamesh/dsh-app-host`，见 P3-DIFF）；新增 `POST /api/hanamesh/core/bind-link`（网站 `/me/bind?deviceId&nonce&signature`）；`getSession().bound` 取自贡献响应；设置段顶部加套件/单包互斥提示。** rc.8 在真实 DSH 装载闭环上补齐状态写入串行化、注册后贡献读取、干净宿主环境、Cordis 可选服务探测、健康投影与 1 MiB 上游响应上限；状态与验收结论只看 HanaMesh 文档仓 `STATUS.md`。

收录不代表审核或推荐。

`hanamesh-core` 是 HanaMesh 三件套入口：精确依赖 `hanamesh-usage` 与 `@hanamesh/dsh-app-host`，并由 `profile/cordis.patch.yml` 一次插入三个同名 loader id。已单独安装 `hanamesh-usage` 或 `@hanamesh/dsh-app-host` 的用户，安装 Core 前必须先 `dsh plugin remove` 它们；否则 DSH 会以 `duplicate loader entry id` 明确失败。

Core 本身只拥有：本机设备密钥和设备 id、注册观察、同意状态、组件健康快照、DSH 设置/侧栏入口。它不采集事件、不实现应用容器、不做钱包、认领或奖励计算。

开发环境用 `vendor/siblings/` 里 STATUS §5 登记的真件 tgz（`hanamesh-usage-0.2.0-rc.4`、`hanamesh-dsh-app-host-0.1.0-rc.15`，以及 app-host 的私有 peer `hanamesh-lib-provision-0.1.0-rc.1`）让 pnpm 离线解析依赖，`vendor/siblings/SHA256SUMS` 由 `verify:inputs` 校验；rc.8 之前的 `vendor/standin/` 空壳已删除。

当前套件模式为 `REAL_SIBLINGS`（依赖解析层面）：三件真实互动（一次安装、互斥、生命周期）仍归 O3 验证，本仓只证明 Core 自身、三条 Loader insert 与真实 Server 往返。

**Server 侧前提（O1/O2 部署要记）：** 设备端所有 POST 带 `Origin = serverOrigin`，因此 `IDENTITY_TRUSTED_ORIGINS` 必须包含 Server 自身的 `IDENTITY_BASE_URL` origin（O1 验收环境已如此配置）。

私钥以 PKCS8 base64url 保存在 DSH storage-domain 的 JSON 文件中，文件权限由 DSH 决定；本版没有可用的宿主级密钥，因此不做二次加密。私钥不会通过 Core 契约、HTTP、日志或诊断输出。

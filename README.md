# hanamesh-core

> 🧪 `0.2.0-rc.16`（2026-09-20：新增冻结 O4 回跳所需的 `POST /api/hanamesh/core/refresh`，显式刷新会绕过 60 秒贡献缓存并返回最新公开状态）。rc.15 让出厂 `serverOrigin`/`websiteOrigin` 指向生产 `api.hanamesh.com` / `market.hanamesh.com`、`allowSystemBrowser: true`；此前 rc.14 出厂为空，全新安装点「去网站绑定」必报 `CORE_URL_NOT_ALLOWED`。隔离测试用 profile `cordis.patch.yml` 的 `- id: hanamesh-core` 覆盖。固定 Node `24.13.1`、pnpm `10.33.0`、DSH `0.1.5-alpha.1`；状态与验收结论只看 HanaMesh 文档仓 `STATUS.md`。

收录不代表审核或推荐。

`hanamesh-core` 是 HanaMesh 三件套入口：精确依赖 `hanamesh-usage` 与 `@hanamesh/dsh-app-host`，并由 `profile/cordis.patch.yml` 一次插入三个同名 loader id。已单独安装 `hanamesh-usage` 或 `@hanamesh/dsh-app-host` 的用户，安装 Core 前必须先 `dsh plugin remove` 它们；否则 DSH 会以 `duplicate loader entry id` 明确失败。

Core 本身只拥有：本机设备密钥和设备 id、注册观察、同意状态、组件健康快照、DSH 设置/侧栏入口。它不采集事件、不实现应用容器、不做钱包、认领或奖励计算。

开发环境用 `vendor/siblings/` 里 STATUS §5 登记的真件 tgz（`hanamesh-usage-0.2.0-rc.4`、`hanamesh-dsh-app-host-0.1.0-rc.16`，以及 app-host 的私有 peer `hanamesh-lib-provision-0.1.0-rc.1`）让 pnpm 离线解析依赖，`vendor/siblings/SHA256SUMS` 由 `verify:inputs` 校验；rc.8 之前的 `vendor/standin/` 空壳已删除。

当前套件模式为 `REAL_SIBLINGS`（依赖解析层面）：三件真实互动（一次安装、互斥、生命周期）仍归 O3 验证，本仓只证明 Core 自身、三条 Loader insert 与真实 Server 往返。

**Server 侧前提（O1/O2 部署要记）：** 设备端所有 POST 带 `Origin = serverOrigin`，因此 `IDENTITY_TRUSTED_ORIGINS` 必须包含 Server 自身的 `IDENTITY_BASE_URL` origin（O1 验收环境已如此配置）。

私钥以 PKCS8 base64url 保存在 DSH storage-domain 的 JSON 文件中，文件权限由 DSH 决定；本版没有可用的宿主级密钥，因此不做二次加密。私钥不会通过 Core 契约、HTTP、日志或诊断输出。

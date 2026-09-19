# hanamesh-core

> 本地回收候选 `0.2.0-rc.8`，固定 Node `24.13.1`、pnpm `10.33.0`、DSH `0.1.5-alpha.1`。rc.8 在真实 DSH 装载闭环上补齐状态写入串行化、注册后贡献读取、干净宿主环境、Cordis 可选服务探测、健康投影与 1 MiB 上游响应上限；状态与验收结论只看 HanaMesh 文档仓 `STATUS.md`。

收录不代表审核或推荐。

`hanamesh-core` 是 HanaMesh 三件套入口：精确依赖 `hanamesh-usage` 与 `@hanamesh/dsh-app-host`，并由 `profile/cordis.patch.yml` 一次插入三个同名 loader id。已单独安装 `hanamesh-usage` 或 `@hanamesh/dsh-app-host` 的用户，安装 Core 前必须先 `dsh plugin remove` 它们；否则 DSH 会以 `duplicate loader entry id` 明确失败。

Core 本身只拥有：本机设备密钥和设备 id、注册观察、同意状态、组件健康快照、DSH 设置/侧栏入口。它不采集事件、不实现应用容器、不做钱包、认领或奖励计算。

开发环境使用 `vendor/standin/` 的两个空壳包让 pnpm 离线解析依赖。它们标为 `STANDIN`，不是产品产物，也不能证明三件真实互动。

当前套件真实门模式为 `STANDIN`：P2/P3 真包是否可替换，以文档仓 `STATUS.md` §5 为准。Core 自身的设备、同意、健康、路由和客户端席位可以分别验证；空壳只证明依赖解析、三条 Loader insert 与缺席服务文案，不证明 Usage/App Host 的真实行为。

私钥以 PKCS8 base64url 保存在 DSH storage-domain 的 JSON 文件中，文件权限由 DSH 决定；本版没有可用的宿主级密钥，因此不做二次加密。私钥不会通过 Core 契约、HTTP、日志或诊断输出。

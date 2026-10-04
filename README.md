# hanamesh-core · 0.2.0-rc.49

Core 可独立从公开 npm 安装到官方 `@deepseek-ai/dsh@0.2.0-rc.2`。设备身份、同意、套件入口和组件健康观察由本包提供；Usage 与 AppHost 可分别安装，默认三件套装配归 Desktop seed。Core 不再自动安装或插入 sibling 插件，因此不要求卸载已独立安装的组件。

```sh
dsh plugin --profile web add hanamesh-core@0.2.0-rc.49
```

插件清单启用 Core 后，在设置页查看「HanaMesh 套件」「我的 Hana」和「数据授权」。缺少使用记录或应用容器时，组件健康区给出明确原因，设备身份和同意仍可使用。Core 不采集事件、不实现应用容器、不做钱包或奖励计算。

## 依赖与构建

Node `24.13.1`、pnpm `10.33.0`、TypeScript `5.9.3`。官方宿主 peer 精确钉 `@deepseek-ai/cordis@4.0.4` 和四项 `@deepseek-ai/dsh-*@0.2.0-rc.2`；React `18.3.1` 与 Zod `4.5.4` 由公开依赖闭包供给。Core 不 import Usage/AppHost。

`dsh-typert-protocol@0.2.0-rc.2` 是严格类型检查需要的 devDependency：官方 connection 的公开类型引用它，但只将其列为 devDependency。无运行时补丁，构建不跳过库类型检查。历史 `vendor/host-api` 只作可校验的旧类型快照，构建使用实际公开官方包；不随 npm 包分发。

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm check:contracts
pnpm verify:inputs
```

运行时必须使用隔离 `DSH_HOME`。公开包不含本机 sibling tgz、研发链接或私有 registry 依赖。私钥以 PKCS8 base64url 保存在 DSH storage-domain JSON 中；不通过 Core 契约、HTTP 或日志输出。

Server 注册 POST 的 Origin 为 serverOrigin；Server 的可信 Origin 须包括自己的公开地址。收录不代表审核或推荐。

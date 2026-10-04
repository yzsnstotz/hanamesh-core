# NPM-CORE-01 · REAL_RUNTIME UI 诊断观察

2026-10-05 JST，worker 通过 cua_repl 控制官方 CLI 自身打开的 Chrome 窗口（另一个 Chrome profile，浏览器 connector 的已有 profile 不包含此页，因此改用 native AX）。以下是可见 AX 输出摘录；完整工具输出与 rc48 截图留在本 worker App 线程。

最终入口 `http://127.0.0.1:55296/`，隔离 DSH_HOME `~/.cache/hanamesh-runs/NPM-CORE-01/home`。官方 `@deepseek-ai/dsh@0.2.0-rc.2`，本地 tarball `hanamesh-core@0.2.0-rc.49`，不是公开 npm 安装门。

动作：官方启动自动打开浏览器 → 首次预览说明继续 → API Key 稍后配置 → 插件 → 查看 hanamesh-core → 打开 HanaMesh 设置。没有发送对话，没有模型请求，没有开启数据授权。

插件详情可见：
- `启用 hanamesh-core, Value: on`
- `v0.2.0-rc.49`
- `共 1 个 · 1 运行中`
- `启用组件 hanamesh-core, Value: on`

设置可见：
- `HanaMesh` 设置入口
- `Core 只安装设备身份与同意设置。使用记录和应用容器可分别安装；缺少组件时，下方会显示原因，设备身份与同意开关仍可使用。`
- `设备身份`、设备 id（UI 缩写）、`注册：已注册`
- `允许 HanaMesh 记录并上报本设备的使用事件（安装/打开/使用/卸载；不含内容与对话）, Value: 0`
- `当前：已关闭`
- `我的 Hana` 的未授权空态
- `组件 使用记录：未安装 应用容器：未安装`
- `关于 hanamesh-core 0.2.0-rc.49 · DSH 0.2.0-rc.2`

rc47/48 因诊断后的文案/开发闭包字节变化已退为历史；最终检查为 rc49。公开发布、从公开 npm 安装、后续新版三个插件共存真实门均未运行；组件卡 PM 独立门尚待。

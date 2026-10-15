# Owner 验证三：已有历史数据的 DSH 原地升级

适用：官方 DeepSeek Harness 0.2.0-rc.2，已经装 Core0.3.7 / Usagerc.31 / AppHost0.6.2，注册和授权正常，但 Usage 加载失败、Core 显示 repair。

根因已经在隔离副本与真实官方桌面复现：旧事件的随机 nonce 可用 `_` / `-` 开头，后来严格的上传校验被复用于读取历史存储。173条 sent 正常，3条 rejected 因旧 nonce 被拒，连带阻止整个 Usage 启动；9月的11条 records 本身正常。此次修复不删除历史、不修改已有 nonce/签名、不重传已发送事件。

## 安装新包（owner 在自己的 DSH 上执行）

1. 用 DSH 菜单 **Quit 完全退出**。保留现有授权、设备身份、后端地址和 storage；不需要卸载、撤回授权或重新注册。
2. 同一终端执行下面命令。它明确操作你现有的 `~/.dsh`；这是 owner 手动升级步骤，工程测试没有执行这条命令。

```sh
HM_UPGRADE_PACKAGES='/Users/yzliu/.cache/hanamesh-runs/session-g-upgrade-20261016'
HM_OFFICIAL_DSH_CLI='/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh'
(cd "$HM_UPGRADE_PACKAGES" && shasum -a 256 -c SHA256SUMS)
DSH_HOME="$HOME/.dsh" "$HM_OFFICIAL_DSH_CLI" plugin --profile desktop add --save-exact \
  "$HM_UPGRADE_PACKAGES/hanamesh-core-0.3.8.tgz" \
  "$HM_UPGRADE_PACKAGES/hanamesh-usage-0.2.0-rc.32.tgz"
unset HM_UPGRADE_PACKAGES HM_OFFICIAL_DSH_CLI
```

这是 **0.3.7 → 0.3.8、rc.31 → rc.32** 的升级命令，会覆盖已安装的旧版本。AppHost0.6.2 本轮未改，不需要重装。无需 allow-version，也不要修改健康文件来伪造 normal。

| 新包 | SHA256 |
|---|---|
| hanamesh-core-0.3.8.tgz | ae0f64ff322017140cafdf11e4c7e218cadf17222a981846852c72a85df7f7b1 |
| hanamesh-usage-0.2.0-rc.32.tgz | 08a2be4d54f3497c7ce1534cc795fab9a35672ac705b37d24927d1aa05bbaa9a |

## 重开后应看到什么

1. 从应用程序目录重新打开官方 DSH。Plugins 中 Core 为0.3.8、Usage为rc.32，组件处于运行状态。
2. 左下 HanaMesh：保留原设备身份、原授权和原后端设置；使用记录不再 failed。等自动检查更新，或点一次“重新检查”，应回 normal。
3. Settings → HanaMesh 使用记录：历史记录可以读取。再关闭并打开这个插件设置页，应产生新的“打开”记录。保持已同意即可，无需再切一次授权开关。
4. 新记录先是“等待上报”；后续按后台共用发送间隔上报。若当前后端接收，显示已收到；若目录未收录等条件不满足，显示实际拒收原因。注册成功不代表每条记录都已上报或计分。

本机核验没有连接 owner 的34440后端，也没有验证这次升级后的线上/本机积分到账；上述后端结果由 owner 在原环境核对。不要为验证升级而撤回授权，撤回会按原有规则清理本机记录并请求删除服务端原始记录。

## repair / 拒绝受保护操作时如何恢复

Core0.3.8 会从宿主公开的失败状态取得安全诊断。此类错误应显示：`invalid-record（hanamesh_usage_events）`、存储格式校验失败，以及“保留数据，升级兼容此历史数据的组件后重开并重新检查”等操作说明。健康接口与设置页使用同一条原因和下一步；不会显示私钥、记录正文或任意原始异常内容。

repair 期间，身份与同意设置仍可查看，健康检查仍可运行；新受保护操作继续拒绝。插件安装走官方 CLI，不依赖故障组件，所以可以在完全退出后按上方命令修复。重新启动并确认 Usage 正常后，健康检查恢复 normal；资源端仍会执行它自己的权限检查，不是关闭保护。

若升级后仍 repair，先确认 Plugins 的实际版本和启用状态，再按 Core 显示的具体原因处理；点“重新检查”只重新观察，不会修复磁盘上的损坏数据。未知/其他格式错误不会被自动丢弃或重置；保留存储，在完全退出后由维护者诊断，勿用删除全部 storage 的办法消除报错。需要记录问题时提供组件版本、错误代码、显示的原因和下一步即可，不要发送含私钥的 storage 文件。

## 历史 pending 的兼容规则

本次 owner 副本只有173条 sent和3条 rejected，终态逐条保持不变。若其他旧配置还存在不能按当前格式上传的旧 pending，rc.32 会先持久化一个明确的本机拒绝状态 `LEGACY_NONCE_UNSUPPORTED`，保留事件身份与签名；界面说明“旧版记录无法按当前上传格式重传；已保留本机，请再次使用插件产生新记录”。它不会阻挡新事件，也不会冒充服务端拒绝或被悄悄重新签名。

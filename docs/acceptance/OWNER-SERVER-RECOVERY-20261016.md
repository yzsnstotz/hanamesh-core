> 2026-10-16 最新升级与本机绑定步骤：[网站地址与绑定](OWNER-WEBSITE-BINDING-20261016.md)（Core0.3.10 / Usagerc.33；网站设为 http://127.0.0.1:48606，再由网站确认绑定）。下文保留此前阶段说明。

# Owner 验证三：待上传提示与服务端设备恢复

适用：官方 DSH 0.2.0-rc.2，已装 Core0.3.8 / Usagerc.32（更早的rc.31也可直接升级）。本轮包只在本机交付，AppHost0.6.2不变。此前历史记录兼容修复保留在这两个新包里。

## 原地升级

用 DSH 菜单 **Quit 完全退出**，保留现有设备、授权、后端地址和记录。owner 在终端执行：

```sh
HM_RECOVERY_PACKAGES='/Users/yzliu/.cache/hanamesh-runs/session-g-owner-v3-recovery-20261016'
HM_OFFICIAL_DSH_CLI='/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh'
(cd "$HM_RECOVERY_PACKAGES" && shasum -a 256 -c SHA256SUMS)
DSH_HOME="$HOME/.dsh" "$HM_OFFICIAL_DSH_CLI" plugin --profile desktop add --save-exact \
  "$HM_RECOVERY_PACKAGES/hanamesh-core-0.3.9.tgz" \
  "$HM_RECOVERY_PACKAGES/hanamesh-usage-0.2.0-rc.33.tgz"
unset HM_RECOVERY_PACKAGES HM_OFFICIAL_DSH_CLI
```

这条命令由 owner 操作自己的配置；工程验证只用隔离配置，没有运行这条升级命令。不用卸载、allow-version、改JSON、手填设备编号或删storage；**不要为重试而关闭授权**，关闭授权会执行原有撤回规则。

| 文件 | SHA256 |
|---|---|
| hanamesh-core-0.3.9.tgz | 5ad34d53a1bb58acf64a29bc260197c22be43ede7dd4378c74628700f25b4e6a |
| hanamesh-usage-0.2.0-rc.33.tgz | 01df11729c8631c91a492acbe95b8499de5d3b64145258b4370520f6f7271634 |

## 重开后看什么

1. 打开官方 DSH，Plugins 确认 Core0.3.9 / Usagerc.33 / AppHost0.6.2。左下 **HanaMesh** 可看原授权与原服务端地址；不需要改地址触发注册。
2. 主分区新增 **本机使用记录**：例如“本机已保留7条记录 · 7条待上传”。点 **查看本机记录**，在 DSH 内打开详情；点 **返回 HanaMesh 设置** 回主分区。主分区会自动刷新计数，也可以点“刷新本机记录”。详情是打开时的快照；返回后再次查看可更新。
3. 若后端仍缺 `GET /v1/usage/settings`，详情明确显示 **“后端版本过旧，缺上报设置接口；升级后端后自动重试”**，并显示真实下次自动重试时间。此时 attempts0 是还没发上传请求，不是已经发了零次失败上报。其他404/4xx不会被误称为后端过旧。
4. 编排已升级后端；等待页面所示时间到达。上报前重新读取服务端设置；成功接收后待上传减少，记录显示“接收端已确认”。网络/鉴权/拒收则显示实际错误，不能把 pending 当成功。后台发送间隔仍为 DSH/Claude/Codex共用；客户端不会为兼容旧后端猜一个间隔并越过设置接口。
5. 若运行中服务端不再认识设备，Core 会先请求 Identity 核验，再用原设备密钥重新注册和核验。HanaMesh主分区显示“已用原设备密钥重新注册，服务端校验通过；请核对网站账号绑定……”；不需要反复切授权。暂时失败会显示核对原因与下次自动核对时间。检查间隔沿用页面“运行配置”的贡献刷新间隔，默认60秒；单次恢复合并并发请求，不会循环连发。
6. 一次性数据库换新后账号绑定和原积分也可能不在新库。用主分区现有 **去网站绑定** 按钮，在网站完成绑定，再看“我的积分”；客户端不伪造或重建旧积分。注册成功、上传接收和网站积分分别核对。本轮没有操作 owner 的验收后端或网站，owner环境的7条事件接收/积分结果仍由 owner 实测。

服务器明确撤销设备或拒绝重放时会显示原因，不自动重新注册；签名无效本身不能证明是设备丢失，也可能是时间/签名问题，所以界面写“无法验证”，且必须重注册后通过 Identity 核验才确认恢复。撤回授权会中止未发送的恢复请求和后续读取。

## repair 时

先看主 HanaMesh 的具体组件错误和下一步；新包保留0.3.8的安全诊断。完全退出后用上面的官方CLI覆盖升级，再重开并“重新检查”；Usage恢复运行后Core应回normal。若仍有错误，保留记录并提供可见错误代码与组件版本，不删storage、不手改健康结果。历史升级细节见[历史升级说明](OWNER-LEGACY-UPGRADE-20261016.md)。

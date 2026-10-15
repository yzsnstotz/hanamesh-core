# Owner 验证三：网站地址、真实错误与本机绑定

适用：官方 DSH **0.2.0-rc.2**；Core **0.3.10**、Usage **0.2.0-rc.33**、AppHost **0.6.2**。可直接覆盖已装的 Core0.3.8/0.3.9、Usagerc.31/32/33；保留设备、授权、历史记录和已设的服务端。仅本机包，尚未推送/部署；owner ACCEPTED 仍待本人验收。

本说明使用编排已经准备的验收环境：后端 **http://127.0.0.1:34440**，网站 **http://127.0.0.1:48606**。无需重建/重启它们，也无需启动第4段环境。

## 原地升级

在 DSH 菜单选 **Quit** 完全退出，然后由 owner 执行：

```sh
HM_BINDING_PACKAGES='/Users/yzliu/.cache/hanamesh-runs/session-g13-g15-20261016'
HM_OFFICIAL_DSH_CLI='/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh'
(cd "$HM_BINDING_PACKAGES" && shasum -a 256 -c SHA256SUMS)
DSH_HOME="$HOME/.dsh" "$HM_OFFICIAL_DSH_CLI" plugin --profile desktop add --save-exact \
  "$HM_BINDING_PACKAGES/hanamesh-core-0.3.10.tgz" \
  "$HM_BINDING_PACKAGES/hanamesh-usage-0.2.0-rc.33.tgz"
unset HM_BINDING_PACKAGES HM_OFFICIAL_DSH_CLI
```

这条命令供 owner 操作自己的配置；工程预演没有执行它，只升级隔离副本。无需卸载、allow-version、修改 JSON、手填设备编号或删除 storage。AppHost0.6.2 保持现有安装。

| 包 | SHA256 |
|---|---|
| hanamesh-core-0.3.10.tgz | f67d503f1c017ac4f7a0a50657b8ca97adf95a26593080762799dbd610b7b4a4 |
| hanamesh-usage-0.2.0-rc.33.tgz | 01df11729c8631c91a492acbe95b8499de5d3b64145258b4370520f6f7271634 |

## 点哪里、应该看到什么

1. 重开官方 DSH。**Plugins → hanamesh-core** 应显示 **v0.3.10**；Usage 应为 **rc.33**。左下点 **HanaMesh**，打开主设置。
2. **服务端**行应显示当前 **http://127.0.0.1:34440**、来源“你设置的”。若不同，在这一行输入这个完整地址，点旁边的**保存**。等设备身份显示“已注册”。本机验收使用 **127.0.0.1**；`localhost` 是另一来源，后端未信任时现在会明确显示 **来源未被信任 IDENTITY_ORIGIN_REJECTED（HTTP 403）**。
3. 紧接着的**网站**行是本次新增。输入 **http://127.0.0.1:48606**，点这一行的**保存**。应显示当前本机网站、来源“你设置的”；“出厂默认 https://market.hanamesh.com”只是默认值说明。如果尚未设置对应网站，网站/绑定按钮会禁用并写明原因，不能打开线上网站。两个地址分别保存/恢复默认；本次验收不点恢复默认。
4. 主设置的**本机使用记录 → 查看本机记录**可打开明细，检查原记录仍在。已接收的历史记录不会因为换库自动重新上报；新版保留已收、拒收和待上传状态。若有待上传，等页面显示的下次重试时间；后端缺设置接口时会显示“后端版本过旧，缺上报设置接口”及重试时间。不要为重试关闭授权，关闭授权会执行撤回。
5. 主设置**我的 Hana**应显示后端已有的 **10 分，其中待绑定10分**（两条市场插件安装各5分）；官方 HanaMesh 插件默认不计分。不需要为了本次绑定再装插件或伪造事件。若当前后端没有这10分，先核对服务端地址、接收/拒收原因，不通过清空记录或重复装同版本来补分。
6. 在**账号**行点 **去网站绑定**。浏览器地址应以 **http://127.0.0.1:48606/me/bind** 开头。使用这次新打开的链接；之前误开的线上链接不用再试。新链接中的设备编号和签名自动带入，不用复制/修改。
7. 如果网站要求登录，点 **用 GitHub 登录**（英文为 **Sign in with GitHub**）。此验收环境使用编排的本机 OAuth 桩，登录后账号显示 **[LOCAL FIXTURE] GitHub owner**；再回到同一绑定页。核对设备与账号后点 **确认绑定 / Confirm binding**；应出现 **设备已绑定 / Device bound**。打开链接本身不会绑定。
8. 点 **去我的贡献 / Go to my contributions**，进入同一本机网站的 **/me**。应看到设备数1、**总计10分 / 10 pts**、用户积分10分、待绑定0分，两插件各5分。现有 owner 数据对应插件以当前账本显示为准；工程预演用了 dsh-no-long-sit 与 dsh-notch 两个真实市场包。可点网站右上“中”切中文。
9. 切回 DSH 的 HanaMesh 设置，等界面/贡献刷新或重新打开该设置，应显示已绑定。此版本默认界面刷新10秒、贡献/积分刷新60秒；以设置页“运行配置”的实际值为准。网站地址保存后重启仍保留。

如果绑定页提示已过期，回到 DSH 再点一次**去网站绑定**取得新链接；不要手改 URL。若服务器记录丢失，新版会用原密钥重新注册并显示恢复情况；账号绑定和服务端积分由服务端保存，不会被客户端伪造恢复。

## repair / 错误时怎么恢复

在主设置查看具体组件错误、版本和下一步。**Quit → 用上面官方 CLI 覆盖安装 → 重开 → 重新检查**；Usage 服务恢复后应退出 repair。若 Core 尚未加载，先在 Plugins 检查 Core/Usage 启用与版本，再按同样方式覆盖升级。保留 storage、设备密钥和授权，不手改健康结果；仍失败时记录界面可见的错误码/HTTP状态与组件版本交编排。HTTP403 是服务端明确拒绝，不能当网络不可达重试；只有真正网络失败才显示 `CORE_UPSTREAM_UNAVAILABLE`。

历史升级与设备恢复细节：[历史记录升级](OWNER-LEGACY-UPGRADE-20261016.md)、[待上传与设备恢复](OWNER-SERVER-RECOVERY-20261016.md)。本轮真实预演证据见交付目录 `evidence/G15-REHEARSAL.md`；owner 的真实配置、验收服务和端口未被工程预演修改。

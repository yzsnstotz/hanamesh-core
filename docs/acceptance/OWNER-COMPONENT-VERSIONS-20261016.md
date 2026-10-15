# DSH 小版本升级：组件版本显示与网站探测设置

适用官方 DSH 0.2.0-rc.2。验证三已由 owner 通过，现有设备、授权、服务端、网站地址和绑定继续保留。此次 Core 0.3.11 仅改组件版本显示；App-host 0.6.3 收紧本地探测的允许网站名单，并保存轮询间隔。Usage 保持已验收的 rc.33。第4段独立固定副本仍使用已验收 Core0.3.10，不需要先做此升级才能开始第4段。

## 升级与可见结果

先在 DSH 菜单 Quit，再由 owner 执行（工程测试没有操作真实 ~/.dsh）：

```sh
HM_MINOR_PACKAGES='/Users/yzliu/.cache/hanamesh-runs/session-g-stage4-next-20261016'
HM_OFFICIAL_DSH_CLI='/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh'
(cd "$HM_MINOR_PACKAGES" && shasum -a 256 -c DSH-MINOR-SHA256SUMS)
DSH_HOME="$HOME/.dsh" "$HM_OFFICIAL_DSH_CLI" plugin --profile desktop add --save-exact \
  "$HM_MINOR_PACKAGES/hanamesh-core-0.3.11.tgz" \
  "$HM_MINOR_PACKAGES/hanamesh-dsh-app-host-0.6.3.tgz"
unset HM_MINOR_PACKAGES HM_OFFICIAL_DSH_CLI
```

重开 DSH，左下 HanaMesh 打开主设置，向下滚动到 **组件与版本**：Core 0.3.11、使用记录 0.2.0-rc.33、应用容器 0.6.3。版本单独显示，禁用或加载失败时也保留读到的实际版本；读不到显示“未知”，旁边继续显示原因和下一步。无需改 JSON 或填写编号。

原来的本机服务端/网站地址应仍在，已完成的账号绑定继续保留。主设置“查看本机记录”仍可打开记录；积分继续由现有后端保存。本轮工程没有操作或重建 owner 的验收服务。

如验轮询保存：DSH 设置 → 网站安装交接，将“应用库轮询间隔”改成自己需要的值并保存；Quit 后重开，值应保持。本机网站仍须列入“允许的网站”；名单修改后两处探测立即采用新名单。普通安装和交接仍需本人确认。

## 包与工程证据

| 包 | SHA256 |
|---|---|
| hanamesh-core-0.3.11.tgz | 032ad618589d2e6dd73fa8cb110e2bd48d18179e43fe7973d039569a14a14e03 |
| hanamesh-dsh-app-host-0.6.3.tgz | c6f7ee59e789a97acf9b57ae15f9baaf68b0334eb85c42dca0d1fb144ca17307 |

官方 rc.2 桌面使用全新隔离 HOME/DSH_HOME 实际安装三插件，公开 Core 状态健康，主设置显示三版本；公开设置保存900ms，真实桌面退出重开仍900，两处探测只回答获准来源。使用设备与私钥仅在隔离根，退出后已删除。工程结果不代替 owner 对此小版本的本人验收；不部署、不打标签。真实绑定/10分的已通过结论属于此前验证三。

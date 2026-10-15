> 2026-10-16：已有历史数据或已装 Usagerc.31 的用户，改走 [原地升级验证三](OWNER-LEGACY-UPGRADE-20261016.md)（Core0.3.8 / Usagerc.32）。下文是此前全新隔离配置的安装说明，不能替代历史数据升级验收。

# Owner 验证三：官方 DSH 0.2.0-rc.2 安装三插件

本轮用官方更新源已经提供的桌面版，不需要寻找 0.2.1-alpha.x 桌面安装包。新包只在本机交付，尚未 npm 发布。此步骤验证 DSH 插件兼容；跨生态真实模型到网站积分另见宿主 `docs/acceptance/STAGE4-LOCAL-OWNER.md`。

## 本轮包

目录：`/Users/yzliu/.cache/hanamesh-runs/session-g-dsh-compat-20261015/`。

| 文件 | SHA256 |
|---|---|
| hanamesh-core-0.3.7.tgz | 3c942ca36c2495526476640e7065243a5ab1ea9bde3fd0ac52fc88ef544ba661 |
| hanamesh-usage-0.2.0-rc.31.tgz | 14880b899e5d27b7a87db8e970aba932a2df4e3cdc04b1c2267b7428e1717af6 |
| hanamesh-dsh-app-host-0.6.2.tgz | 4f8124a27bd9eeb749f19b5541759a10479907bec6c4d5ad1d1a4a0131205329 |

## 手动安装（隔离配置）

以下块在同一终端执行，使用全新的本机目录。`HM_DSH_TEST_ROOT` 会在清理步骤删除。

```sh
HM_DSH_TEST_ROOT="$(mktemp -d -t hm-owner-dsh-compat)"
HM_DSH_TEST_ROOT="$(cd "$HM_DSH_TEST_ROOT" && pwd -P)"
HM_DSH_APP='/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness'
HM_DSH_CLI='/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh'
HM_DSH_PACKAGES='/Users/yzliu/.cache/hanamesh-runs/session-g-dsh-compat-20261015'
HM_DSH_NODE='/Applications/DeepSeek Harness.app/Contents/Resources/runtime/primary-runtime/dependencies/node/bin/node'
HM_DSH_TEST_PORT="$(env -i "$HM_DSH_NODE" -e 'const net=require("node:net");function choose(){const s=net.createServer();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>[3080,34440,48606].includes(p)?choose():console.log(p))})}choose()')"
mkdir -p "$HM_DSH_TEST_ROOT/home" "$HM_DSH_TEST_ROOT/tmp" "$HM_DSH_TEST_ROOT/dsh/profiles/desktop"
hm_dsh_isolated() {
  env -i HOME="$HM_DSH_TEST_ROOT/home" DSH_HOME="$HM_DSH_TEST_ROOT/dsh" \
    ZDOTDIR="$HM_DSH_TEST_ROOT/home" TMPDIR="$HM_DSH_TEST_ROOT/tmp" \
    PATH='/usr/bin:/bin' LANG=en_US.UTF-8 DSH_TELEMETRY_DISABLED=1 "$@"
}
cat > "$HM_DSH_TEST_ROOT/dsh/profiles/desktop/cordis.patch.yml" <<EOF
- id: webserver
  config:
    host: 127.0.0.1
    port: $HM_DSH_TEST_PORT
- id: hanamesh-core
  config:
    serverOrigin: null
    websiteOrigin: null
    allowSystemBrowser: false
    sharedIdentityDir: "$HM_DSH_TEST_ROOT/shared"
- id: hanamesh-app-host
  config:
    library:
      sources: []
      handoff:
        enabled: false
EOF
hm_dsh_isolated "$HM_DSH_CLI" --version
hm_dsh_isolated "$HM_DSH_APP" --user-data-dir="$HM_DSH_TEST_ROOT/electron" \
  --use-mock-keychain --password-store=basic
```

应看到 CLI 输出 `0.2.0-rc.2`，随后启动独立桌面窗口。初次欢迎页可选择 Add API Key → Set up later，不填密钥。**用菜单 Quit 完全退出这个测试窗口**，终端命令返回后安装：

```sh
hm_dsh_isolated "$HM_DSH_CLI" plugin --profile desktop add --save-exact \
  "$HM_DSH_PACKAGES/hanamesh-core-0.3.7.tgz" \
  "$HM_DSH_PACKAGES/hanamesh-usage-0.2.0-rc.31.tgz" \
  "$HM_DSH_PACKAGES/hanamesh-dsh-app-host-0.6.2.tgz"
hm_dsh_isolated "$HM_DSH_APP" --user-data-dir="$HM_DSH_TEST_ROOT/electron" \
  --use-mock-keychain --password-store=basic
```

应看到安装成功，无 incompatible-version，也无需 allow-version。再打开后：

1. 左侧 Plugins → Installed 显示三包及上述新版本，各组件正常运行。
2. 左下 HanaMesh → 设备身份存在；使用记录 rc.31、应用容器 0.6.2 正常。关于页显示 `hanamesh-core 0.3.7 · 支持 DSH 0.2.x`。服务端显示未设置，同意默认关闭。
3. Settings → HanaMesh 使用记录：同意前没有事件。回 HanaMesh 开启数据授权后，应出现本机安装记录；再打开使用记录设置页，出现对应“打开”事件。页面明确只保存本机、不会上报；本流程没有后端或网站积分。
4. 左下市场能打开。本隔离配置显式关闭目录源，因此空目录是预期；不会访问线上目录。
5. 回 HanaMesh 关闭授权，使用记录清零。用菜单 Quit 完全退出测试窗口，终端返回后清理：

```sh
test -n "$HM_DSH_TEST_ROOT" && rm -rf -- "$HM_DSH_TEST_ROOT"
unset -f hm_dsh_isolated
unset HM_DSH_TEST_ROOT HM_DSH_APP HM_DSH_CLI HM_DSH_PACKAGES HM_DSH_NODE HM_DSH_TEST_PORT
```

## 本机市场安装的工程复现入口

如需亲手复现本轮已跑过的无害插件安装，交付目录的 `evidence/native-rc2.mjs` 会准备一个全新隔离官方桌面、回环 scoped npm 测试源和仅一条的 `LOCAL COMPATIBILITY FIXTURE` 目录。它在前台持有进程并输出 `NATIVE_READY`；状态文件 `evidence/native-ready.json` 标明本次隔离 root 和 control 文件。使用官方随包 Node 启动：

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/primary-runtime/dependencies/node/bin/node" \
  /Users/yzliu/.cache/hanamesh-runs/session-g-dsh-compat-20261015/evidence/native-rc2.mjs
```

在测试窗口点市场 → LOCAL COMPATIBILITY FIXTURE → 安装，rc.2 应显示“安装完成，重启 DSH 后生效”。向状态文件中明确列出的 **本次 control 文件**写 `restart` 可重启这个隔离窗口；重启后官方 Plugins → `@hm-compat-probe/target` → Components 显示 Running。向同一 control 文件写 `stop`，runner 会关闭自己启动的进程并删除整个临时根，最后打印 `cleanup:true`。不要直接关闭终端中断清理。

alpha.2 的安装回归使用真实公开 npm CLI/web 宿主及隔离浏览器；它与官方 rc.2 桌面证据分开记录。API 差异、范围语义、工程检查和仍未运行的门见 [兼容报告](dsh-rc2-compat-20261015.md)。owner 亲手验收结果仍需另记。

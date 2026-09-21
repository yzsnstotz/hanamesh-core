# O3 阶段 4 · 首轮演示记录（2026-09-21，本机，真实 Chrome + 固定内核 DSH 0.1.5-alpha.1，全新 DSH_HOME，官方 DSH 路径无壳）

安装：`--from-default-profile web` 种子 → `dsh plugin add hanamesh-core@0.2.0-rc.28`（一次得 core/usage/app-host rc.26）→ `dsh plugin add @hanamesh/app-vibe-trading@0.1.0-rc.23`（`plugin-add.log`）。服务端 = 线上 `api.hanamesh.com` rc.8。

| 步 | 动作 | 截图 | 真实还是未接通 | 阻塞原因 |
|---|---|---|---|---|
| SI22 | 设置 → HanaMesh 段 | `01-core-settings.png` | 真实：设备已注册（新 deviceId）、数据授权关闭、账号未绑定（文案「绑定后网站才能…」+ 去网站绑定）、组件 usage rc.6 / app-host rc.26、关于 core rc.28 | — |
| SI21 | usage 只读页 `/api/hanamesh/usage/view` | `02-usage-view.png` | 真实：0 条（全新 profile，同意未开）；core 段「本设备贡献累计 install 0 · open 0 · use 0 · uninstall 0」一致 | — |
| SI20 | 应用库 → Vibe 卡片「补齐运行时」→「打开」 | `03-library.png`, `04-vibe-open.png` | 真实：默认目录源 `market.hanamesh.com/catalog-source.json` 自动生效；CLI 装的 Vibe 被识别为已安装（runtime-missing → 补齐 → registered）；iframe 渲染 Vibe-Trading，首屏要求 API key | 本 profile 无任何供应商/密钥 → 任务步 BLOCKED（不订购、不伪造） |
| SI23 | 「去网站」 | `05-go-website.png` | 真实：按钮存在；行为 = core `open-external` → 系统浏览器打开 `market.hanamesh.com`（core 生产 patch `allowSystemBrowser: true`）；本次未点击以免在用户默认浏览器开页 | — |

结论：SI21/SI22/SI23 PASS，SI20 打开 PASS、任务 BLOCKED（无凭据）。这条路径在 app-host rc.26 之前不可走（无默认源、CLI 装的应用不被识别）——已修。

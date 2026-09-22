# rc.31 真实门 · T2（我的 Hana 真实数值 + 可领权益弹一次）/ T9（core 邮箱入口）

2026-09-22。全新隔离 profile，`env -i HOME=… DSH_HOME=…` 同一行显式给定，scratch 在 `/private/tmp/hm-t2core-<随机>/`，随机空闲端口（非 3080）；`~/.dsh`、`~/.hanamesh`、`~/.hanamesh-server`、research runtime 全程未触碰。DSH 内核 `0.1.5-alpha.1`，Node 24.13.1 / pnpm 10.33.0。

| # | 门 | 结果 | 证据 |
|---|---|---|---|
| R1 | 全新隔离 profile 安装 rc.31 tgz（真实字节，file: 规格，非重打包同版本走缓存） | PASS | `plugin-add-production-profile-final-tgz.log`、`plugin-add-stub-profile.log` |
| R2 | 真实 DSH 起来后 `hanamesh_core` storage 落 `pointsBindPromptShownAt`（新字段 optional，rc.30 快照仍可加载） | PASS | 存储快照含 `"pointsBindPromptShownAt": null`，插件正常 apply |
| R3 | `GET /api/hanamesh/core/points` 打**生产** `https://api.hanamesh.com/v1/custody/me/points`（设备签名）返回 ready | PASS | `points-production.json`：3 个 Hana 各 5 分（`breakdown.install=5`），`totalPoints 15`，`bound false` |
| R4 | 未同意上报的可读空态 | PASS | 同 profile 授权前：`{"status":"unavailable","reason":"CONSENT_WITHHELD",…}` |
| R5 | 设置页「我的 Hana」显示总分 / 各 Hana 分 / 待绑定分 / 六项 breakdown / 「分不是代币」 | PASS | `settings-points.png`（真实 Chrome，DSH 原生 Settings → HanaMesh） |
| R6 | 可领权益弹层出现**一次**（待绑定 11 分、未绑定设备） | PASS | `prompt-open.png`：`<dialog open>`「你已累计 11 分（待绑定）…」+「去网站绑定」「以后再说」 |
| R7 | 关掉后重载 / 再开都不再弹（标记落盘） | PASS | `after-reload.png`；两次重载 DOM 里 `[data-hanamesh-core-prompt]` 为 null；storage `pointsBindPromptShownAt = 2026-09-22T14:51:20.112Z` |
| R8 | T9「邮箱绑定」入口打开 `<websiteOrigin>/me` | PASS | 点击后 `window.open('<websiteOrigin>/me')` + `POST /api/hanamesh/core/open-external {"url":"<websiteOrigin>/me"}` |

R5–R8 用第二个隔离 profile，`cordis.patch.yml` 把 `serverOrigin`/`websiteOrigin` 覆盖到本机 stub（`stub-upstream-payload.json` 是 stub 返回的 custody 载荷：37.25 分、待绑定 11 分），因为生产上不能为了演示弹层去写「待绑定分」。R3/R4 用生产环境证明签名读与空态在真服务端成立。

UI 由真实 Chrome 经 CDP 驱动（Node 内建 WebSocket，无新依赖），驱动脚本只存在于本次 scratch，未进仓。

首跑发现并已修：弹层在 DSH 暗色主题下用 `#fff` 兜底导致浅底浅字不可读，改为 `var(--dsw-alias-bg-layer-2, Canvas)` / `var(--dsw-alias-label-primary, CanvasText)`（系统色是成对的，缺 token 也不会浅底浅字），重打包后 R5–R7 复跑通过。

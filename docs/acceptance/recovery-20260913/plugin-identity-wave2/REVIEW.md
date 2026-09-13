# plugin-identity 2026-09-13 隔离联验回收

状态：**PARTIAL；没有签署 ACCEPTED，也没有创建远端、push 或发布。** 本轮只写 plugin-identity 仓及一次性临时资源。最终候选 `hanamesh-plugin-identity@0.1.0-rc.3`，`artifacts/hanamesh-plugin-identity-0.1.0-rc.3.tgz` SHA-256 `9611f7828878a111005a8b31c7348c7446c9cfae0f1b5dabfa9c130b0733cee7`。rc.1/rc.2 历史包保留原字节；rc.3 的 README/API 已更新，最终 DSH 重装与 API 复验见 `dsh-auth-rc3.log`、`dsh-srv01-flow-rc3.log`。

## 真实资源与证据等级

- **REAL_HOST**：research DSH runtime 0.1.5-alpha.1，独立 `DSH_HOME`、`plugin_identity_wave2` web profile、127.0.0.1:59723。`dsh plugin --profile plugin_identity_wave2 add <rc.3 tgz> --offline` exit 0，浏览器 token 握手 303、带宿主 cookie 的页面与状态 API 均 200，安装版本 rc.3。手工使用 DSH 文档的 `cordis.patch.yml` `- insert:`，没有改 DSH 源码、个人 `~/.dsh` 或 3080。运行时禁用 telemetry。`dsh-plugin-add-rc3.log` 的 peer 警告表示 profile manifest 未单独安装 peer；这些固定 peer 由现成 DSH runtime 提供，真实加载和类型门均已通过。
- **REAL_API / REAL_DB**：锁定 SRV-01 `hanamesh-server-identity@0.1.0-rc.1` tarball SHA-256 `19b54a32841647a99ed04883833461c0702f2b073567204d718c2e042cdce557` 的已安装包只读复用，独立 127.0.0.1:59468 服务。`postgres:17.6-alpine` 一次性容器 `plugin-identity-wave2-56dc5c34` 与同名数据库，loopback 32777，schema 用该锁定包的 migration SQL，运行角色无 CREATE/TEMP（`runtime-role.log`）。两个合成账户在该库注册，均非生产账户。`srv01-direct-baseline.log` 证明服务本身的 A/B 读取、跨主体 403 和无 cookie 伪造 header 401。
- **REAL_BROWSER**：独立 headless Chrome profile，经 DSH 宿主认证打开真实页面；页面表单登录后显示 A 主体，本人 API 200、B 资源 403、页面退出后保护请求 401。`browser-flow.log` 和三张 `ui-*.png` 是实际浏览器输出；截图保留合成账户可见值，不含密码、cookie 或宿主 token。
- **SOURCE / CONTRACT_FIXTURE**：新增 DSH 桥接 Host/Origin 回归，先红后绿：`origin-bridge-red.tap` exit 1，`origin-bridge-green.tap` exit 0。修复仅改本插件路由，维持 DSH 既有 Host/Origin 宿主认证门，不降低 `skipLibCheck`。源代码测试与变异不冒充上面真实链路。

## D02 / D05 / D07 技术结果

| 门 | 实测结果 | 原始证据 | 判定边界 |
|---|---|---|---|
| D02 | rc.3 包在真实 DSH 加载；登录前保护请求 401，登录 200、状态 `signed_in` 且主体与合成 A 相符，本人资源 200；真实浏览器表单重演。 | `dsh-auth-rc3.log`、`dsh-srv01-flow-rc3.log`、`browser-flow.log`、`ui-signed-in.png` | 技术门 PASS；用户仍需亲自验收。 |
| D05 | 真 DSH sidecar 停机前为 `signed_in`，停机后手工把状态保持 `signed_in`、revision 加 1000、observedAt 改到 2030；重启后状态 `expired`、principal null、保护 API 401。构造 `x-principal-id`/`x-user-id` 且无 cookie 直打 SRV-01 资源为 401；插件请求自报 header 为 400。 | `sidecar-before-forge.json`、`sidecar-forged.json`、`sidecar-after-restart.log`、`sidecar-forged-resource-rejection.log`、`dsh-srv01-flow-rc3.log` | 技术门 PASS；sidecar 不是远端授权。用户仍需亲自验收。 |
| D07 | 浏览器在 `expired` 状态先直接调用保护 API 得 401；遍历并取消所有 DOM `[hidden]` 和 `display:none` 后再直调得 401。实际页面没有隐藏控件，可见性改动数为 **0**；随后表单登录本人 200、退出后再次 401。 | `browser-flow.log`、`ui-expired-before-bypass.png`、`ui-expired-after-bypass.png` | 直接绕过 UI 的真实负测通过；原文“去掉隐藏逻辑”步骤无法对当前页面执行，保持 PARTIAL，不冒称用户验收。 |

附带 D04：A 会话读 B 资源 403，`dsh-srv01-flow-rc3.log`。D03：真实退出后的插件保护请求 401，未取到已撤销的远端 cookie 再直打资源，故完整远端撤销/过期链仍 PARTIAL。D09 官方 ui-kit 五态视觉未完成。D11 的真实 storage-domain 文件已经读取/篡改/重启，但尚未独立验证 DSH 自身 session 内部读取。D13 没有 pinned DSH git checkout `5dda...` 的独立 diff；research 工作树 HEAD `9d2b...` clean 不能替代该门。X02/X03 真实 DSH backend + DB 强杀矩阵未跑。

## 构建、失败与回归

- 当前仓 Node 24.13.1、pnpm 10.33.0、TypeScript 5.9.3；`npm ci --offline --ignore-scripts` exit 0；`npm run build` rc.3 exit 0，含 `tsconfig.host.json` 的 `skipLibCheck:false`。**最终 rc.3 干净副本** `npm ci` / 目标 build / 44/44 / 2 项变异均 exit 0，见 `final-clean-status.txt` 及对应原始日志。rc.3 是文档与版本变化后重包，`rc2-rc3-runtime-hashes.log` 证实运行代码字节一致；rc.3 真实宿主 API 再次运行 exit 0。
- 当前源码 `npm test` 44/44，`npm run test:crash` exit 0，`npm run check:contracts` exit 0，`npm run verify:inputs` exit 0；最终 rc.3 `scripts/check-package.mjs` 独立源码/包入口冒烟 exit 0。这些输出在 `tests-rc2.tap`、`crash-rc2.tap`、`public-types-rc2.log`、`verify-inputs-rc2.log`、`package-smoke-rc3.log`，运行代码未在 rc.3 改动。
- 首次真实 DSH 的所有 POST 为 403 `IDENTITY_ORIGIN_REJECTED`，见 `dsh-srv01-flow.log`；原因是 DSH bridge 把 WHATWG Request URL 写成 `http://dsh.internal`，但保留已经通过宿主门的外部 Host/Origin。插件原比较 `Origin === Request.url.origin`。新增回归先红后绿，改为在有 Host 时比对外部 Host/Origin，无 Host 的直接调用仍比 Request.url。rc.3 真联验通过。
- 添加一项路由测试后，旧 mutation harness 仍硬编码 `# tests 38` 导致一次非产品失败；改为 39 并重跑两项变异 exit 0。独立包冒烟首次在新机找不到全局 `tsc`；改为使用本仓已安装的 TypeScript 5.9.3，重跑 exit 0。保留 `mutations-rc2.log`、`package-smoke-rc2.log` 与对应 `*-fixed.log`，不把失败藏掉。
- 一次以旧路径 `/api/.../check` 查询 sidecar 后重启状态得到 404，脚本 JSON 解析失败；路由实际为 `/refresh`，订正只读验证后 `sidecar-after-restart.log` exit 0。没有因脚本解析失败重复登录或撤销。

## 最小下一动作

业务/用户验收人按 brief 亲自运行 D02/D05/D07 并签署 ACCEPTED；产品团队还需补 D09 官方 ui-kit 五态真实呈现、D03 远端撤销/过期、D11 DSH session 反向读取、D13 pinned checkout hash/diff、X02/X03 真实介质强杀及业务 owner 收敛。没有这些证据前模块保持 PARTIAL。一次性本机资源执行后停止并删除；重新运行需新建独立 DB/DSH_HOME、使用合成账户与本地端口。

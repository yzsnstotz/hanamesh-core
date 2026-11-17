# @hanamesh/hanamesh

## DSH 桌面安装（推荐） / DSH Desktop (recommended) / DSH デスクトップ（推奨）

**中文**
1. 打开 DSH「插件 → 添加插件」（Plugins → Add plugin）。
2. 到 [HanaMesh 安装页](https://market.hanamesh.com/connect#install)，选择 DSH，点击「复制精确包名」。将完整的 `@hanamesh/hanamesh` **带精确版本的包规格**粘贴到「包名或地址」。网页从 Core 的公开发布数据读取版本，不使用本仓未发布的版本号。
3. 核对来源，点击「安装」，完成后点击「立即启用」；仅在 DSH 提示时重启。总包包含 Core、Usage、AppHost、Theme，无需逐个安装。数据授权与账号绑定仍由本人完成。

**English**
1. Open **Plugins → Add plugin** in DSH Desktop.
2. Choose DSH on the [HanaMesh installation page](https://market.hanamesh.com/connect#install) and **Copy exact package name**. Paste the complete **versioned** `@hanamesh/hanamesh` spec into **Package name or address**. The page reads Core's public release metadata; an unpublished repository version is not an installation target.
3. Confirm the source, choose **Install**, then **Enable now**. Restart only if DSH requests it. The bundle includes Core, Usage, AppHost and Theme; no separate component installation is needed. Review data consent and bind your account yourself.

**日本語**
1. DSH の「プラグイン → プラグインを追加」（Plugins → Add plugin）を開きます。
2. [HanaMesh 導入ページ](https://market.hanamesh.com/connect#install)で DSH を選び、「固定版のパッケージ名をコピー」を押します。`@hanamesh/hanamesh` の**固定版を含む完全な指定**を「パッケージ名またはアドレス」に貼り付けます。公開版は Core のリリース情報から取得し、リポジトリ内の未公開版を使いません。
3. 出所を確認し、「インストール」、完了後に「今すぐ有効化」を選びます。DSH が求めた場合だけ再起動します。Core、Usage、AppHost、Theme は総合パッケージに含まれ、個別導入は不要です。同意とアカウント連携はご本人が行います。

CLI 和交给 AI 是备选 / CLI and agent installation are alternatives / CLI とエージェントによる導入も選べます：[安装页 / Installation page / 導入ページ](https://market.hanamesh.com/connect#install)。CLI 必须操作自己的 desktop profile，不在项目目录执行 npm install。

界面用语依据 / Interface reference：[DSH Plugin Manager](https://github.com/deepseek-ai/DeepSeek-Harness/tree/39163dd30f703a79079e2d2446545cff3c453738/packages/client/ui-plugin-manager)。

### CLI 备选 / CLI alternative / CLI で導入

如需终端安装，从 npm 读取同一公开发布版本：
```sh
bundle_version="$(npm view @hanamesh/hanamesh version --registry=https://registry.npmjs.org/)" &&
  [ -n "$bundle_version" ] &&
  dsh plugin --profile desktop add --save-exact "@hanamesh/hanamesh@$bundle_version"
```
总包一次插入 Core、Usage、AppHost 与独立 Theme 四个插件。设置中的 HanaMesh 负责设备绑定与数据授权；安装不会自动同意采集。读取失败时停止，不执行无版本安装。

仅使用总包；已分装三包的测试 profile 请删除后重新安装，不提供兼容或迁移。

生成器改编自 ai-workbench connect/packages/workbench/build.mjs（origin/main 472b5f3）。它读取四个精确 npm 归档，合并公开 patch 与 @deepseek-ai/* peer，拒绝重复 id、相对入口、非 insert 操作与 peer 冲突；release.json 记录来源 SHA256。构建失败不复用旧输出。根仓的 js-yaml 是构建依赖；发布包只含 patch、release.json、说明和许可证。

审过、合入、打 tag 后，从标签先执行 `pnpm install --frozen-lockfile && pnpm build`，再使用 `node packages/hanamesh/build.mjs --version 0.1.9 --core 0.3.38 --usage 0.3.0-rc.19 --app-host 0.6.28 --theme 0.1.0 --output /absolute/new-directory` 生成正常归档。发布后立即使用总包精确版本进行原生安装验收。发布不得从未审的本地候选执行。

总包的公开 package.json 包含由 Core 同一 SDK 生成的 `hanameshSuiteInstall:{name,version,command,args}`。生成器必须在正常 Core 构建后运行；Web 的 npm latest 只发现总包精确版本，显示该版本的 Core 命令。四个子包必须先按审后统一发布顺序公开发布，才能从公开 npm 重建本轮总包。候选门可将正常归档通过 buildHanaMesh 的已有 fetchPackage 注入点提供；这不是 npm 发布。

仓内旧候选 release.json（rc.15来源）已删除，不能当作本次发布证明。审后构建输出目录中的 release.json 才记录该次真实输入归档摘要；从发布tag/公开npm重新获取，禁止沿用历史SHA。

Theme 的 token 层默认由公开 patch 启用。其 Cordis peer 更窄时，总包保留该已声明的更窄范围；不扩大任一提供方兼容范围。不同且无包含关系的 peer 仍拒绝，不猜交集。Theme 不成为 Core 服务成员或本地归档源白名单成员。

生成器在读完正常归档后核对 Core 的 `hanameshSuiteInstall` 与本次总包精确版本、命令及 argv；旧发布定义拒绝 `CORE_RELEASE_PIN_MISMATCH`，不得把旧总包修复命令带入新分发。

总包的 Core、AppHost、Usage、Theme 运行时依赖使用 `^` 兼容范围。生成输入仍须是四个精确版本的正常 tgz；`release.json` 保留每个来源的精确版本和 SHA256，发布门不变。桌面构建读取当时 npm 最新发布，将总包/Brand 精确版本和完整解析锁随安装包预装。安装后在 HanaMesh 应用库显示已装/最新兼容版本，确认后可升级或选择历史版本；实际安装固定为精确版本，不降低 DSH 兼容或供应链规则。

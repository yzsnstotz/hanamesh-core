# @hanamesh/hanamesh

在 DSH「插件 → 添加插件」填写带当前发布精确版本的完整包名（网页安装页提供可复制内容），安装后立即启用并重启一次。终端安装从 npm 读取同一发布版本：
```sh
bundle_version="$(npm view @hanamesh/hanamesh version --registry=https://registry.npmjs.org/)" &&
  [ -n "$bundle_version" ] &&
  dsh plugin --profile desktop add --save-exact "@hanamesh/hanamesh@$bundle_version"
```
总包一次插入 Core、Usage、AppHost 三个插件。设置中的 HanaMesh 负责设备绑定与数据授权；安装不会自动同意采集。读取失败时停止，不执行无版本安装。

仅使用总包；已分装三包的测试 profile 请删除后重新安装，不提供兼容或迁移。

生成器改编自 ai-workbench connect/packages/workbench/build.mjs（origin/main 472b5f3）。它读取三个精确 npm 归档，合并公开 patch 与 @deepseek-ai/* peer，拒绝重复 id、相对入口、非 insert 操作与 peer 冲突；release.json 记录来源 SHA256。构建失败不复用旧输出。根仓的 js-yaml 是构建依赖；发布包只含 patch、release.json、说明和许可证。

审过、合入、打 tag 后，从标签使用 `node packages/hanamesh/build.mjs --version 0.1.1 --core 0.3.30 --usage 0.3.0-rc.15 --app-host 0.6.21 --output /absolute/new-directory` 生成正常归档。发布后立即使用总包精确版本进行原生安装验收。发布不得从未审的本地候选执行。

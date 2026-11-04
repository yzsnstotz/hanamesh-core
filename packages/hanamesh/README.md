# @hanamesh/hanamesh

在 DSH「插件 → 添加插件」安装 `@hanamesh/hanamesh`，立即启用后重启一次。或执行 `dsh plugin add @hanamesh/hanamesh`。总包一次插入 Core、Usage、AppHost 三个插件。设置中的 HanaMesh 负责设备绑定与数据授权；安装不会自动同意采集。

仅使用总包；已分装三包的测试 profile 请删除后重新安装，不提供兼容或迁移。

生成器改编自 ai-workbench connect/packages/workbench/build.mjs（origin/main 472b5f3）。它读取三个精确 npm 归档，合并公开 patch 与 @deepseek-ai/* peer，拒绝重复 id、相对入口、非 insert 操作与 peer 冲突；release.json 记录来源 SHA256。构建失败不复用旧输出。根仓的 js-yaml 是构建依赖；发布包只含 patch、release.json、说明和许可证。

审过、合入、打 tag 后，从标签使用 `node packages/hanamesh/build.mjs --version 0.1.0 --core 0.3.30 --usage 0.3.0-rc.15 --app-host 0.6.20 --output /absolute/new-directory` 生成正常归档。子包和总包都受 DSH 24 小时成熟期约束。发布不得从未审的本地候选执行。

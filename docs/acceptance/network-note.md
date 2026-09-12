# 网络尝试记录（工具返回摘要，不冒充原始日志）

执行过程中曾调用 `npm view typescript@5.9.3 version --fetch-retries=0 --fetch-timeout=7000`，返回 `EAI_AGAIN registry.npmjs.org`；未获得依赖。最初 npm debug 日志在后续 npm 操作中已轮转，不作为原始证据提供，也不虚构该日志内容。没有重试安装系统工具，没有网络包被用于本轮编译。

环境门以 `environment.log`、`target-build.log`、`host-types-blocked.log` 和缺失的实际路径检查为依据；网络恢复与否不改变这些本轮实测事实。

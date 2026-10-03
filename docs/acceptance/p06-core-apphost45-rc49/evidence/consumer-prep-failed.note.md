# 消费者准备失败记录（人工转录，非原始日志）

首个临时消费者目录误用 Desktop 随包 pnpm `11.7.0`；该版本提示不再读取 `package.json` 的 `pnpm.overrides`，随后从公开 npm 查询私有 `hanamesh-usage` 得到 `ERR_PNPM_FETCH_404`。该次 `consumer-install.log` 在纠正工具版本时被覆盖，不能作为原始证据；错误文字来自本轮工具输出，状态为无效脚手架输入。随后用固定 pnpm `10.33.0`、新 HOME/cache/store、同一固定 tgz 重做，完整原始成功日志在 `consumer-install.log`，字节核对在 `consumer-probe.json`。未发布、未写私有 registry。

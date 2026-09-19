# hanamesh-core 工作边界

只修改本仓。`src/` 是真源，`lib/` 是构建产物；行为改动先写失败测试，再改真源并重建。

不得 import `hanamesh-usage` 或 `@hanamesh/dsh-app-host`；它们只作为 package dependencies、bundle patch 名字与 duck-typed 宿主服务出现。邻仓与 `_archive/hanamesh-plugin-product-profile` 只读。

开发和验收必须使用隔离 `DSH_HOME`、清理继承凭据、随机空闲端口；不得触碰 `~/.dsh`、3080 或研究 runtime。状态只写文档仓 `STATUS.md`，本仓不创建第二套状态文件。

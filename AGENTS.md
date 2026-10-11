# hanamesh-core 工作边界

流程规则只在 segflow：worker 读 /Users/yzliu/work/tools/segflow/roles/worker.md，架构准则见 roles/principles.md；本文件只写本模块事实。

只修改本仓。`src/` 是真源，`lib/` 是构建产物；行为改动先写失败测试，再改真源并重建。

跨模块只经合约交互，不 import 别的模块、不读写别的模块的表（见 /Users/yzliu/work/tools/segflow/roles/principles.md §1–2）。

开发和验收必须使用隔离 `DSH_HOME`、清理继承凭据、随机空闲端口；不得触碰 `~/.dsh`、3080 或研究 runtime。

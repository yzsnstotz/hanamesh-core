| 场景 | 命令/编辑/点击 | 结果 | 日志 |
|---|---|---|---|
| 2a 全新安装 | 1 / 0 / 0 | entries=3 boot=0 deviceId=MY1BaGF- components=usage:inactive(HTTP 就绪后 2 s 的快照；同日隔离门与真实桌面 6 s 后为 satisfied+serviceReady),app-host:satisfied:0.1.0-rc.14 | 2a-*.log |
| 2b-i 已有 usage 再装 core | 3 / 2 / 0 | usage-alone boot=0 entries=1; +core boot=1 failure='duplicate loader entry id: hanamesh-usage'; after remove usage boot=0 entries=3; storages kept=1 | 2b-i-* |
| 2b-ii 已有 app-host 再装 core | 3 / 2 / 0 | ah-alone boot=0 entries=1; +core boot=1 failure='duplicate loader entry id: hanamesh-app-host'; after remove boot=0 entries=3 | 2b-ii-* |
| 2b-iii 已有 core 再显式装 usage | 1 / 1 / 0 | +usage boot=1 failure='duplicate loader entry id: hanamesh-usage'; after remove boot=0 entries=3 | 2b-iii-* |
| 2c 升级一级 rc | 1 / 0 / 0 | 0.2.0-rc.10 -> 0.2.0-rc.11 boot=0 entries=3 deviceId same=yes | 2c-* |
| 2d-i 禁用 usage | 0 / 1 / 0 | boot=0 usage component=inactive/false boot-errors=0 | 2d-i-* |
| 2d-ii usage 非法 config | 0 / 2 / 0 | 整棵树失败、进程退出：`dsh: plugin tree failed to load: failed to apply loader entry include (cordis:include): failed to apply loader entry hanamesh-usage (hanamesh-usage): INVALID_CONFIG`（boot.sh 因 web 端口先起而误报 0；以 boot.log 与进程退出为准） | 2d-ii-* |
| 2e 卸载与数据保留 | 2 / 0 / 0 | after remove: entries=0   storages kept=3; boot-without=0; readd deviceId same=yes | 2e-* |

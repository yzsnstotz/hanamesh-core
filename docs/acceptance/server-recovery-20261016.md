# 验证三：设置接口、运行中设备恢复与本机入口

本轮修复 Core0.3.9 / Usagerc.33，仅本机 main 与 tarball；尚未 owner ACCEPTED，不推送、不发布、不部署。owner步骤见 [升级说明](OWNER-SERVER-RECOVERY-20261016.md)。

## 已定位的协议行为

真实宿主13edfbf固定副本、一次性PostgreSQL、隔离配置实测：数据库没有当前设备时，`POST /v1/usage/events` 返回401 `USAGE_AUTH_REQUIRED`，`GET /v1/identity/me` 返回401 `IDENTITY_DEVICE_SIGNATURE_INVALID`。Identity把缺失、签名/时间失败合并到同一错误，不能断言一定是丢设备。

Core从原有贡献检查定时器发现401/403，先签名核对Identity；只有可恢复鉴权失败才用原设备密钥重新登记并再次核对Identity。设备ID和密钥不变。并发合并，同一贡献刷新间隔内至多一次登记；默认60秒、界面“运行配置”可见，没有新增隐藏间隔。校验暂时失败后独立重试，即使Usage已200也不会永久卡在failed。撤销/重放只显示blocked；服务端已有revoked记录的register仅更新label，不会复活。服务端改变、撤回、dispose使旧结果失效；登记挑战后、Identity签名后、解析后以及重试读取前均检查同代授权。

Core原先在宿主激活且授权已开时也会尝试登记，因此“只有改地址才注册”并非全部源码行为；本次补上的是**运行中服务端丢设备后的自动发现与恢复**。恢复清空旧绑定/账号/积分缓存并提示核对网站绑定，不在客户端重建丢失积分。

Usage保留必须读取共用服务端设置的策略。接口404不猜设置，不POST事件；新增明确旧后端提示和真实nextAttemptAt。7条pending回归逐条保持原状态、nonce、签名与attempts0；接口恢复后按原事件上传一次。其他4xx/其他路由404不冒充旧版本提示。

主HanaMesh页独立读取Usage公开本机投影，显示总数、待传数及内嵌详情入口；后端不可达不阻挡本机记录。缺少组件/投影失败明确显示缺项，不伪造0。详情只读，返回再打开可刷新，不依赖宿主私有导航或写JSON。

## 工程证据与边界

交付根 `/Users/yzliu/.cache/hanamesh-runs/session-g-owner-v3-recovery-20261016/`：

- Core目标build、199测试、strict公开类型、39合同检查、目标工具链与输入检查、最终包58项/真实JS与strictTS消费者通过。9项实际编译代码变异另见mutations收据。
- Usage目标build/check、352测试中350通过/2既有可选真实后端skip；28项实际编译代码变异；最终包strict peers安装/公开JS入口/skipLibCheck:false消费者通过。
- `evidence/real-server-recovery.json`：真实一次性PG宿主，先真实401；同设备/同密钥恢复；原nonce/签名pending事件从鉴权backoff到sent。先前registered状态是明确夹具，不将其当旧库迁移；无owner记录复制。
- `evidence/native-ui-observations.json`：真实官方rc.2桌面、实际新包、真实点击授权/主分区/查看/返回；回环后端明确夹具。3pending attempts0→可见旧后端原因和实际重试时间；运行中丢设备→原key登记2次、可见恢复提示；后台设置恢复→原3条自动sent、pending0。首次接收端夹具误按envelope数事件而非协议裸数组，导致UPLOAD_RESPONSE_INVALID，已更正并重新全程通过；该前置问题不是产品红测。
- `evidence/final-native-ui-observations.json`：最后一次授权屏障修改后的最终tarball，再用全新官方rc.2桌面实装，3条接收、主分区0待传、同key自动恢复及内嵌接收结果可读。截图只含测试窗口。
- 审查补出的暂时校验失败、解析中撤回、服务端auth nonce签名中撤回三项均有断言红绿回归；未用编译失败或缺模块当红测。

真实DSH测试与PG测试串行，全部用0700临时根、最小环境、独立HOME/DSH_HOME/Electron user-data/mock keychain，随机避让保留端口。两次桌面全量跑、一轮最终包重验的根与进程均清除；PG容器明确cleanup ok。只保留不可变包、小收据/源码和截图。

没有连接owner34440/48606/OAuth54667、api.hanamesh.com或改owner配置；未跑owner原profile的7条事件/网站积分，未把夹具接收当积分到帐。未重跑alpha桌面/其他OS；已通过精确alpha.2依赖消费者。第4段独立固定副本和真实Claude/Codex闭环仍在准备中。

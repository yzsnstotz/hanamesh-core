固定版本 DSH 0.1.5-alpha.1 @ 5dda764 各包的公开类型声明（`lib/types/*.d.ts`），来自本机固定 runtime。
只能依据这里声明过的 API 编码；猜测的接口名一律不接受（DELIVERY_RULES §2 #6、#9）。
已知坑：storage-domain 的 domain 名只接受 /^[a-z][a-z0-9_]*$/；JsonlSessionPersistence.create() 不落盘（first append/flush 才落盘）；
整 root 卸载时各服务并行拆除；webServer 路由无鉴权，鉴权用 ctx.connection.requestRejection()。

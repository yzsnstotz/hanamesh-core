# 归档：DSH 0.1.5-alpha.1 宿主类型快照

2026-10-11（J2S1-CORE-03 / HM-4）从 `vendor/host-api/` 与 `deps/HOST_API.sha256.json` 移入此处，不再参与构建、校验或发布。

- 构建与严格类型检查只用 `package.json` 钉的公开官方包（`@deepseek-ai/*@0.2.0-rc.2`、`@deepseek-ai/cordis@4.0.4`）。
- `HOST_API.sha256.json` 原样保留，键仍是移入前的路径 `vendor/host-api/...`；核对时把前缀换成本目录 `host-api/...`。
- semver 同时由 vendor 复制件改为正常依赖 `semver@7.7.2`（ISC，https://github.com/npm/node-semver）；原复制件与 npm 7.7.2 逐字节相同，旧 `vendor/SHA256SUMS` 见 git 历史 572d853。

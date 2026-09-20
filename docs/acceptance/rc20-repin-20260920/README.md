# rc.20 · 重钉 app-host rc.18（2026-09-20，代码同 rc.19）

**改动：** app-host 升 `0.1.0-rc.18`（只改客户端应用库安装/供给/卸载反馈 UI，宿主逻辑不变），本包 `dependencies` / `devDependencies` / `pnpm.overrides` / `vendor/siblings` + `SHA256SUMS` / `profile/suite.profile.json` / 「关于」串 / 测试断言 / `scripts/p1/publish.sh` / `scripts/verify-inputs.mjs` / `scripts/check-package.mjs` 随链重钉（DELIVERY_RULES §1.6）。usage 保持 `0.2.0-rc.6`、lib-provision `0.1.0-rc.1` 不动。运行逻辑零改动。

**本仓门（本目录）：** `pnpm install --frozen-lockfile` 过（lock 只换 app-host tgz 一行）；`verify:inputs` siblings=3；`build.log`（Node 24.13.1 / pnpm 10.33.0 / TS 5.9.3 `--target`）；`test.tap` 39/39；`mutations.log` 5/5 `assertionFailure:true`；`check-contracts.log` 过；`check-package.log` `check_package_ok`；tgz `artifacts/hanamesh-core-0.2.0-rc.20.tgz` sha256 `b54e883fc4b223f75ac247b1bed9c2f20084ea25ba79e322ce41e316d7641a95`（已追加 `artifacts/SHA256SUMS`）。

**registry（`http://127.0.0.1:4873`，`publish-core.log` / `publish-vibe.log` / `registry-dist-tags.txt`）：** `scripts/p1/publish.sh ~/.hanamesh-registry real` 发 app-host rc.18 + core rc.20（usage rc.6 已有跳过）；Vibe rc.15 单独 `npm publish --tag rc`；三包 `dist-tag add … latest`。

**alpha1/（内核 `0.1.5-alpha.1`，`hanamesh-dsh-runtime/runtime`，`scripts/p1/fresh-home.sh` 隔离 `DSH_HOME` 于 session scratchpad，随机回环端口 63573）：** `dsh plugin --profile core add hanamesh-core@0.2.0-rc.20` exit 0（`plugin-add.log`；唯一 WARN 是已知的 `missing peer @hanamesh/lib-provision`，该包内联在 app-host dist 中）；`--dump-config` 恰三条 `hanamesh-core / hanamesh-usage / hanamesh-app-host`（`dump-config.yml`）；`boot.sh` 起宿主后 `/api/hanamesh/core/state` health `normal`，usage `satisfied 0.2.0-rc.6 serviceReady:true`，app-host `satisfied 0.1.0-rc.18`（`state.json`）；`/api/hanamesh/usage/health`、`/hanamesh/apps`、`/` 200（`routes.txt`）；`pnpm ls`：core → app-host rc.18 + usage rc.6 + zod 4.5.4 一份（`pnpm-ls.txt`）；`storages/` 三个 hanamesh 单元（`storages.txt`）；`boot.log` 无 error/duplicate/failed（`boot-errors.txt` 0 行）。

**时序备注：** 第一次在 `boot_ready` 后 2 秒读 state，usage 行为 `inactive / phase:loading`（`state-2s-usage-loading.json`），app-host 已 `satisfied`；重起后 4 秒读则两者均 `satisfied / active`（`state.json`）。这是宿主加载顺序下的正常瞬态，与 rc.19 相同，非本次改动引入。

`~/.dsh`、`~/.hanamesh`、3080 全程未动（`lsof -iTCP:3080` 前后均无监听）。rc.2 内核（用户桌面壳运行时）本次 NOT_RUN：app-host 宿主逻辑不变，rc.18 peer 范围未改。

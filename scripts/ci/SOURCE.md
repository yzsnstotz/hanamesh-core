# Four mandatory CI gates

Source: [HanaMesh orchestration gates](https://github.com/yzsnstotz/docs/tree/main/编排工作法/tools/gates), copied 2026-11-04 from the installed canonical tool. `gates.py` and `cycles.cjs` are unchanged. Dependency versions and lockfile are exact upstream copies.

`run.py` invokes the four canonical functions against this checkout's **HEAD**, including worktrees. The wrapper snapshots installed public dependency manifests into temporary Git trees to check the exact consumed exports. A missing declared and installed provider fails instead of silently exempting its imports. The compressed retirement policy is machine-readable rule data; it is decompressed to a temporary file so definitions are not scanned as product code. No runtime source is excluded.

The scope is retirement, Git dependency pins on main, cross-package exported subpaths, and runtime dependency cycles. `test_gates.py` proves pass → intentional violation → restored pass for every gate. Root JS entrypoints are also checked for cycles (Chain has no src directory).

Upstream source SHA256:
- `gates.py`: `dcd55328f480f3905c74a0ecdd45d0b8467621f8e8af41e23102fe62eec81016`
- `cycles.cjs`: `924985b7d7de36e619985df6c8344204c243bc4412048716ee3beb168c12fd26`

Retirement policy SHA256: `3a3fbd8bdaeded0abce588e8db2bb6f56c9684289c5b5d40c1eca4e9271b1511`.

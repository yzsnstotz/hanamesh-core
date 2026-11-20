# Four mandatory CI gates

Source: [HanaMesh orchestration gates](https://github.com/yzsnstotz/docs/tree/main/编排工作法/tools/gates), synchronized 2026-11-21 from the reviewed GT2 final snapshot (including GT1). `gates.py` and `cycles.cjs` are unchanged. Dependency versions and lockfile are exact upstream copies.

`run.py` invokes the four canonical functions against this checkout's **HEAD**, including worktrees. The wrapper snapshots installed public dependency manifests into temporary Git trees to check the exact consumed exports. A missing declared and installed provider fails instead of silently exempting its imports. The compressed retirement policy is machine-readable rule data; it is decompressed to a temporary file so definitions are not scanned as product code. No runtime source is excluded.

The scope is retirement, Git dependency pins on main, cross-package exported subpaths, and runtime dependency cycles. `test_gates.py` proves pass → intentional violation → restored pass for every gate. Root JS entrypoints are also checked for cycles (Chain has no src directory).

Upstream source SHA256:
- `gates.py`: `4c34347af00abfe328a81e84cb1cc634cc5abcf451b71f862bc40430fcbab0ac`
- `cycles.cjs`: `924985b7d7de36e619985df6c8344204c243bc4412048716ee3beb168c12fd26`

Retirement policy SHA256: `3a3fbd8bdaeded0abce588e8db2bb6f56c9684289c5b5d40c1eca4e9271b1511`.


## Reviewed pins synchronization for Core 0.3.40

The copied `gates.py` is byte-identical to GT2's final reviewed snapshot:
GT1 / R445 PASS supplies owning-lock resolution and real upstream main/tag fetch;
GT2 / R452 PASS supplies installation-manifest/lock scope and consumer scope.
No gate rules, dependency versions or workflow commands changed during this copy.
The prior CI snapshot SHA256 was
`dcd55328f480f3905c74a0ecdd45d0b8467621f8e8af41e23102fe62eec81016`.
The reviewed snapshot SHA256 is
`4c34347af00abfe328a81e84cb1cc634cc5abcf451b71f862bc40430fcbab0ac`.

`test_reviewed_gates.py` is also copied byte for byte from GT2's reviewed final
regressions (SHA256
`4b98c8c825c26e166b2447f807f0d8a8c48e47da8432bd166bb8cbae2de082ae`).
The existing `test_gates.py` entrypoint includes that class and preserves every
original pass/violate/restore assertion; its positive pins fixture now commits
its own matching lock, as required by the reviewed rule.

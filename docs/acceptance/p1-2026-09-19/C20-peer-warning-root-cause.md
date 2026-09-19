# C20 peer warning root cause

Status: **known non-fatal REAL_HOST packaging limitation; no source workaround applied**.

The isolated DSH `0.1.5-alpha.1` profile writes `pnpm-workspace.yaml` with `nodeLinker: hoisted` and `autoInstallPeers: false`. Its profile `package.json` contains only `hanamesh-core`; the host-owned packages are resolved by DSH's out-of-tree runtime fallback and are not declared in the profile manifest. Consequently pnpm reports the exact host peers as missing while `dsh plugin add` exits 0 and the real host loads the plugin.

The route requires exact host peer versions and explicitly forbids `peerDependenciesMeta` because Core has no host-free subpath. Marking the peers optional would silence the warning but violate that requirement and weaken the package contract, so rc.8 intentionally keeps the warning visible.

Observed profile facts:

```text
pnpm-workspace.yaml: nodeLinker=hoisted, autoInstallPeers=false
profile package.json dependencies: hanamesh-core=0.2.0-rc.8
plugin add: exit 0, + hanamesh-core 0.2.0-rc.8
real host: listener ready, anonymous 401, authenticated 200
```

This file does not convert the warning into a PASS. O3 should treat it as a host/profile-manifest compatibility observation and verify that no duplicate peer copies are installed during the three-package suite run.

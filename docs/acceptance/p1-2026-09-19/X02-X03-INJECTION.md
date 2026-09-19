# X02/X03 injection evidence boundary

Status: **PASS after receipt rerun**. The original exploratory files below remain as provenance. The rc.8 rerun adds redacted command semantics, exact PID, `wait_exit=137`, kill marker, restart receipt and server replay summaries, independently closing X02 and X03.

## Runtime identity

- Shared pinned DSH executable: `/Users/yzliu/work/projects/hanamesh/_archive/wave0-5/research-dsh-greenfield-2026-09-09/rt/node_modules/@deepseek-ai/dsh/lib/bin.js`
- Temporary copied executable: `/tmp/hm-p1-x02-runtime.Ug2Ed1/node_modules/@deepseek-ai/dsh/lib/bin.js`
- Both executable SHA-256: `0ff7f1d72c4e0cbe14001709c81e20a04b70464118a7f78568952988e28f2ac5`
- Shared storage-json SHA-256: `293b76e38e9dd64017dae9503218b5120058ce0087b06dffa058512dcb6ee771`
- Instrumented temporary storage-json SHA-256: `735e89bbc70d7188df7e2f45b64cee4b967b2232a4c73539c6bd6ff169f0c09b`

Only the temporary copy was changed. The inserted branch ran immediately after `handle.sync()` and before `rename(tmp, path)`:

```js
if (process.env.HM_X02_KILL_PATH && path.endsWith(process.env.HM_X02_KILL_PATH)) {
  console.error(JSON.stringify({event: "x02_real_kill", target: process.env.HM_X02_KILL_PATH, stage: "temp-fsynced-before-rename"}));
  process.kill(process.pid, "SIGKILL");
}
```

## Retained observations

- X02 core and health kill logs each contain the expected `temp-fsynced-before-rename` marker.
- X02 health target hashes before and after the kill are identical; restart JSON is complete and durable.
- X03 server log records challenge → register 201 → challenge → replay register 200 for the same device id.
- X03 local JSON snapshots remain unregistered after the kill and become registered after restart.

## Receipt rerun

- Core identity: `X02-core-receipt-rc8.log` + `X02-core-kill-rc8.log` + `X02-core-restart-receipt-rc8.log`.
- Health snapshot: `X02-health-receipt-rc8.log` + `X02-health-kill-rc8.log` + `X02-health-restart-receipt-rc8.log`.
- Registration replay: `X03-receipt-rc8.log` + `X03-kill-rc8.log` + `X03-restart-receipt-rc8.log` + the two `X03-server-*-rc8.json` summaries.

Every kill receipt records `signal=SIGKILL` and `wait_exit=137`; every restart receipt records listener readiness, authenticated state HTTP 200 and graceful exit 0. X02 health preserves the same pre/post SHA-256, while X03 preserves the local/server ordering `unregistered + 201` before restart and `registered + 201,200` after restart.

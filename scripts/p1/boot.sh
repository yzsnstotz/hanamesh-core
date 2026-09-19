#!/usr/bin/env bash
set -euo pipefail

ROOT=${1:?usage: boot.sh ROOT [PORT]}
source "$ROOT/env.sh"
if [[ "$(node -p 'process.versions.node')" != 24.13.1 ]]; then
  printf 'Node 24.13.1 required; got %s\n' "$(node -p 'process.versions.node')" >&2
  exit 2
fi
PORT=${2:-$HM_P1_PORT}
if [[ "$PORT" == 3080 ]]; then echo 'refusing port 3080' >&2; exit 2; fi
nohup env -i HOME="$HOME" DSH_HOME="$DSH_HOME" NPM_CONFIG_USERCONFIG="$NPM_CONFIG_USERCONFIG" npm_config_cache="$npm_config_cache" PATH="$PATH" \
  node "$HM_P1_DSH" --profile core --port "$PORT" --no-open >"$ROOT/boot.log" 2>&1 </dev/null &
PID=$!
printf '%s\n' "$PID" >"$ROOT/boot.pid"
for _ in {1..80}; do
  if curl -sS -o /dev/null "http://127.0.0.1:$PORT/"; then printf '{"event":"boot_ready","pid":%s,"port":%s}\n' "$PID" "$PORT"; exit 0; fi
  kill -0 "$PID" 2>/dev/null || { tail -80 "$ROOT/boot.log"; exit 1; }
  sleep 0.25
done
tail -80 "$ROOT/boot.log"
exit 1

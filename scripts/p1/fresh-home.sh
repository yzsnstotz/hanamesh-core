#!/usr/bin/env bash
set -euo pipefail

ROOT=${1:?usage: fresh-home.sh ROOT [REGISTRY_PORT]}
REGISTRY_PORT=${2:-4873}
DSH_BIN=${DSH_BIN:-/Users/yzliu/work/projects/hanamesh/_archive/wave0-5/research-dsh-greenfield-2026-09-09/rt/node_modules/@deepseek-ai/dsh/lib/bin.js}
mkdir -p "$ROOT/home" "$ROOT/user-home" "$ROOT/npm-cache"
PORT=$(node -e "const n=require('net').createServer();n.listen(0,'127.0.0.1',()=>{console.log(n.address().port);n.close()})")
if [[ "$PORT" == 3080 ]]; then PORT=$(node -e "const n=require('net').createServer();n.listen(0,'127.0.0.1',()=>{console.log(n.address().port);n.close()})"); fi
if [[ ! -f "$ROOT/npmrc" ]]; then cat >"$ROOT/npmrc" <<EOF
registry=http://127.0.0.1:$REGISTRY_PORT
EOF
fi
cat >"$ROOT/env.sh" <<EOF
export HM_P1_ROOT='$ROOT'
export DSH_HOME='$ROOT/home'
export HOME='$ROOT/user-home'
export NPM_CONFIG_USERCONFIG='$ROOT/npmrc'
export npm_config_cache='$ROOT/npm-cache'
export HM_P1_PORT='$PORT'
export HM_P1_DSH='$DSH_BIN'
EOF
env -i HOME="$ROOT/user-home" DSH_HOME="$ROOT/home" NPM_CONFIG_USERCONFIG="$ROOT/npmrc" npm_config_cache="$ROOT/npm-cache" PATH="$PATH" node "$DSH_BIN" --profile core --from-default-profile web --dump-config >/dev/null
printf '{"event":"fresh_home","dshHome":"%s","port":%s,"port3080":false}\n' "$ROOT/home" "$PORT"

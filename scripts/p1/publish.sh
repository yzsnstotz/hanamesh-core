#!/usr/bin/env bash
set -euo pipefail

ROOT=${1:?usage: publish.sh ROOT standin [PORT]}
MODE=${2:?usage: publish.sh ROOT standin [PORT]}
REGISTRY_PORT=${3:-4873}
REGISTRY="http://127.0.0.1:$REGISTRY_PORT"
if [[ "$MODE" != standin ]]; then
  echo "Only the explicitly labelled STANDIN mode is available until P2/P3 artifacts are recorded." >&2
  exit 2
fi
mkdir -p "$ROOT/npm-cache"
export npm_config_cache="$ROOT/npm-cache"
for _ in {1..60}; do curl -fsS "$REGISTRY/-/ping" >/dev/null && break; sleep 0.25; done
if [[ -f "$ROOT/npmrc" ]] && grep -q '_authToken=' "$ROOT/npmrc"; then
  TOKEN=$(sed -n 's/.*_authToken=//p' "$ROOT/npmrc" | head -1)
else
  TOKEN=$(curl -fsS -X PUT "$REGISTRY/-/user/org.couchdb.user:hm-p1" -H 'content-type: application/json' --data '{"name":"hm-p1","password":"hm-p1-local-only","email":"hm-p1@example.invalid","type":"user"}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).token||''))")
fi
test -n "$TOKEN"
cat >"$ROOT/npmrc" <<EOF
registry=$REGISTRY
//127.0.0.1:$REGISTRY_PORT/:_authToken=$TOKEN
always-auth=true
EOF
export NPM_CONFIG_USERCONFIG="$ROOT/npmrc"
publish_if_missing() {
  local name=$1 version=$2 source=$3
  if npm view "$name@$version" version --registry "$REGISTRY" >/dev/null 2>&1; then
    printf 'already published: %s@%s\n' "$name" "$version"
  else
    npm publish "$source" --registry "$REGISTRY" --access public --tag rc
  fi
}
publish_if_missing hanamesh-usage 0.2.0-rc.1 ./vendor/standin/usage
publish_if_missing @hanamesh/dsh-app-host 0.1.0-rc.8 ./vendor/standin/app-host
publish_if_missing hanamesh-core 0.2.0-rc.8 ./artifacts/hanamesh-core-0.2.0-rc.8.tgz
printf '{"mode":"STANDIN","registry":"%s","packages":3}\n' "$REGISTRY"

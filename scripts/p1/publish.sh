#!/usr/bin/env bash
set -euo pipefail

ROOT=${1:?usage: publish.sh ROOT real [PORT]}
MODE=${2:?usage: publish.sh ROOT real [PORT]}
REGISTRY_PORT=${3:-4873}
REGISTRY="http://127.0.0.1:$REGISTRY_PORT"
if [[ "$MODE" != real ]]; then
  echo "rc.9+: only REAL_SIBLINGS mode (STATUS §5 registered P2/P3 tgz in vendor/siblings/); standin mode was removed." >&2
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
# @hanamesh/lib-provision is private:true and inlined into app-host dist/provision; it stays a dev-only vendor tgz (app-host peer is satisfied at runtime by the inlined copy, DSH profiles do not auto-install peers).
publish_if_missing hanamesh-usage 0.2.0-rc.6 ./vendor/siblings/hanamesh-usage-0.2.0-rc.6.tgz
publish_if_missing @hanamesh/dsh-app-host 0.1.0-rc.24 ./vendor/siblings/hanamesh-dsh-app-host-0.1.0-rc.24.tgz
publish_if_missing hanamesh-core 0.2.0-rc.25 ./artifacts/hanamesh-core-0.2.0-rc.25.tgz
printf '{"mode":"REAL_SIBLINGS","registry":"%s","packages":3}\n' "$REGISTRY"

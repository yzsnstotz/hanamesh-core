#!/usr/bin/env bash
set -euo pipefail

ROOT=${1:?usage: verdaccio.sh ROOT [PORT]}
REGISTRY_PORT=${2:-4873}
mkdir -p "$ROOT/registry/storage" "$ROOT/registry/cache"
cat >"$ROOT/registry/config.yml" <<EOF
storage: $ROOT/registry/storage
auth:
  htpasswd:
    file: $ROOT/registry/htpasswd
    max_users: 10
uplinks:
  npmjs:
    url: https://registry.npmjs.org/
packages:
  '@*/*':
    access: \$all
    publish: \$authenticated
    unpublish: \$authenticated
    proxy: npmjs
  '**':
    access: \$all
    publish: \$authenticated
    unpublish: \$authenticated
    proxy: npmjs
log: {type: stdout, format: pretty, level: warn}
EOF
export npm_config_cache="$ROOT/registry/cache"
exec pnpm dlx verdaccio@6.10.3 --config "$ROOT/registry/config.yml" --listen "127.0.0.1:$REGISTRY_PORT"

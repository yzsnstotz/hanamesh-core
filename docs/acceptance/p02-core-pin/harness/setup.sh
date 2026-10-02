#!/bin/bash
# usage: setup.sh <profile> — fresh isolated web profile, then the user's real install step `dsh plugin add <Core48 tgz>`.
# Test-profile scaffold only (not a product path): the two private suite packages and app-host's private peer are not on any
# registry, so pnpm overrides point them at the frozen local tarballs; registry = machine-local verdaccio 127.0.0.1:4873 (read only).
# Core's documented serverOrigin/websiteOrigin knobs point at a loopback stub that records request shapes and answers 503.
set -euo pipefail
. "$(dirname "$0")/env.sh"; . "$RUN/ports.env"
P=$1; PR="$RUN/home/dsh/profiles/$P"; H=$(cd "$(dirname "$0")" && pwd)
"$H/dsh.sh" --profile $P --from-default-profile web --dump-config > "$RUN/$P-init.yml" 2>&1
mkdir -p "$PR/.inputs"; cp "$RUN"/inputs/*.tgz "$PR/.inputs/"
printf 'confirmModulesPurge=false\nregistry=http://127.0.0.1:4873/\n' > "$PR/.npmrc"
cat >> "$PR/pnpm-workspace.yaml" <<EOT
overrides:
  hanamesh-usage: file:$PR/.inputs/hanamesh-usage-0.2.0-rc.10.tgz
  '@hanamesh/dsh-app-host': file:$PR/.inputs/hanamesh-dsh-app-host-0.1.0-rc.43.tgz
  '@hanamesh/lib-provision': file:$PR/.inputs/hanamesh-lib-provision-0.1.0-rc.1.tgz
  zod: file:$PR/.inputs/zod-4.5.4.tgz
EOT
cat > "$PR/cordis.patch.yml" <<EOT
# P02-CORE-01 isolation: Core's documented origin knobs -> loopback request-recording stub (no production traffic).
- id: hanamesh-core
  config:
    serverOrigin: http://127.0.0.1:$SPORT
    websiteOrigin: http://127.0.0.1:$SPORT
    allowSystemBrowser: false
EOT
"$H/step.sh" $P-add-lib-provision "$H/dsh.sh" plugin --profile $P add "file:$PR/.inputs/hanamesh-lib-provision-0.1.0-rc.1.tgz" "file:$PR/.inputs/zod-4.5.4.tgz"
{ cat "$PR/.npmrc" "$PR/pnpm-workspace.yaml" "$PR/cordis.patch.yml"; shasum -a 256 "$PR"/.inputs/*; } | sed "s#$RUN#\$RUN#g" > "$EVID/logs/$P-scaffold.txt"
echo setup_ok

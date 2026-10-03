#!/bin/bash
# Test-only embedded Market seat: copy the already fixed rc20 shell plugin manifest into a fresh DSH_HOME,
# replace only the Core suite tgz with Core50, and keep every shell link read-only.
set -euo pipefail
. "$(dirname "$0")/env.sh"
. "$RUN/ports.env"
P=p50panel
PR="$RUN/home/dsh/profiles/$P"
SOURCE=/Users/yzliu/work/projects/hanamesh/_deliveries/p06-public-consumer-20261003/worker-real-host-rc50/home/hanamesh-home/profiles/tauri
"$(dirname "$0")/dsh.sh" --profile "$P" --from-default-profile web --dump-config > "$RUN/$P-init.yml" 2>&1
cp "$SOURCE/package.json" "$SOURCE/cordis.yml" "$SOURCE/pnpm-workspace.yaml" "$PR/"
mkdir -p "$PR/.hanamesh-bundles"
cp "$RUN"/inputs/*.tgz "$PR/.hanamesh-bundles/"
cat > "$PR/.npmrc" <<'EOT'
confirmModulesPurge=false
registry=http://127.0.0.1:4873/
EOT
python3 - "$PR/package.json" <<'PY'
import json,sys
p=sys.argv[1]; x=json.load(open(p))
x['name']='dsh-profile-p50panel'
x['dependencies']['hanamesh-core']='file:./.hanamesh-bundles/hanamesh-core-0.2.0-rc.50.tgz'
with open(p,'w') as f: json.dump(x,f,indent=2); f.write('\n')
PY
cat > "$PR/cordis.patch.yml" <<EOT
- id: hanamesh-core
  config:
    serverOrigin: http://127.0.0.1:$SPORT
    websiteOrigin: http://127.0.0.1:$SPORT
    allowSystemBrowser: false
- id: hanamesh-app-host
  config:
    library:
      fixture: $RUN/inputs/provider-page.json
EOT
env -i HOME="$RUN/home" DSH_HOME="$RUN/home/dsh" PATH="$RUN/bin:/usr/bin:/bin:/usr/sbin:/sbin" TMPDIR="$RUN/tmp" \
  XDG_CACHE_HOME="$RUN/home/.cache" XDG_CONFIG_HOME="$RUN/home/.config" npm_config_cache="$RUN/cache/npm" \
  NPM_CONFIG_USERCONFIG="$PR/.npmrc" CI=true "$RUN/bin/pnpm" install --dir "$PR" --registry http://127.0.0.1:4873/
"$(dirname "$0")/dsh.sh" --profile "$P" --dump-config > "$EVID/logs/panel-dump.log" 2>&1
for id in hanamesh-core hanamesh-usage hanamesh-app-host; do
  count=$(grep -c "id: $id$" "$EVID/logs/panel-dump.log" || true)
  test "$count" = 1 || { echo "$id count=$count"; exit 1; }
done
echo panel_setup_ok

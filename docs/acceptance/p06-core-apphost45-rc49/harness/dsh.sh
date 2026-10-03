#!/bin/bash
# usage: dsh.sh <dsh args...>
set -euo pipefail
. "$(dirname "$0")/env.sh"
H="$RUN/home"
mkdir -p "$H/dsh" "$H/.cache" "$H/.config" "$RUN/bin" "$RUN/tmp" "$RUN/cache/npm" "$RUN/cache/pnpm-store"
if [ ! -x "$RUN/bin/pnpm" ]; then
  printf '#!/bin/bash\nexec %q %q "$@" --store-dir %q\n' "$NODE" "$PNPM_CJS" "$RUN/cache/pnpm-store" > "$RUN/bin/pnpm"; chmod +x "$RUN/bin/pnpm"
  ln -f "$NODE" "$RUN/bin/node"
fi
exec env -i HOME="$H" DSH_HOME="$H/dsh" PATH="$RUN/bin:/usr/bin:/bin:/usr/sbin:/sbin" TMPDIR="$RUN/tmp" XDG_CACHE_HOME="$H/.cache" \
  XDG_CONFIG_HOME="$H/.config" npm_config_cache="$RUN/cache/npm" NPM_CONFIG_USERCONFIG="$H/.npmrc" DSH_TELEMETRY_DISABLED=1 \
  "$RUN/bin/node" "$CLI" "$@"

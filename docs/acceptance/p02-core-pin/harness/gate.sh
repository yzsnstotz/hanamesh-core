#!/bin/bash
# P02-CORE-01 real-DSH gate, one pass on one fresh profile:
#   A install Core48 tgz via `dsh plugin add` → B boot: three loaders, Core settings/device readable, no duplicate → C `dsh plugin remove
#   hanamesh-core` → base DSH boots → D re-add Core48 → boots again. Usage: RUN=<fresh dir with inputs/ and ports.env> gate.sh
. "$(dirname "$0")/lib.sh"; P=p48; PR="$RUN/home/dsh/profiles/$P"
"$NODE" "$H/stub.mjs" $SPORT "$EVID/logs/stub-requests.jsonl" > "$RUN/stub.out" 2>&1 & STUB=$!; trap 'kill $STUB 2>/dev/null' EXIT
installed() { "$H/step.sh" $1-installed sh -c "cd '$PR/node_modules' && for d in hanamesh-core hanamesh-usage @hanamesh/dsh-app-host @hanamesh/lib-provision; do printf '%s ' \$d; grep -m1 '\"version\"' \$d/package.json 2>/dev/null || echo ABSENT; done; shasum -a 256 @hanamesh/dsh-app-host/dist/manager.js hanamesh-core/lib/client.js hanamesh-core/lib/dsh.mjs 2>/dev/null; find . -name package.json -path '*dsh-app-host/package.json' -o -name package.json -path '*hanamesh-usage/package.json' -o -name package.json -path '*hanamesh-core/package.json' | sort"; }
loaders() { "$H/step.sh" $1-dump "$H/dsh.sh" --profile $P --dump-config; grep -n 'id: hanamesh' "$EVID/logs/$1-dump.log" | tee "$EVID/logs/$1-loader-ids.txt"; echo "$1 hanamesh_loader_entries=$(grep -c 'id: hanamesh' "$EVID/logs/$1-dump.log")" | tee -a "$EVID/logs/probes.jsonl"; }
# A
"$H/setup.sh" $P > "$RUN/setup.out" 2>&1 || { cat "$RUN/setup.out"; exit 1; }
"$H/step.sh" A-add-core48 "$H/dsh.sh" plugin --profile $P add "file:$PR/.inputs/hanamesh-core-0.2.0-rc.48.tgz" || exit 1
installed A; loaders A
# B
up $P B-core48 || exit 1
probe B-core48 core; probe B-core48 routes
ui B-core48 B-core48 '[{"capture":"home"},{"click":"HanaMesh"},{"wait":2500},{"capture":"core-settings"}]'
down B-core48
grep -i -n 'duplicate' "$EVID/logs/B-core48.boot.log" > "$EVID/logs/B-duplicate-grep.txt"; echo "B duplicate_lines=$(wc -l < "$EVID/logs/B-duplicate-grep.txt" | tr -d ' ')" | tee -a "$EVID/logs/probes.jsonl"
# C
"$H/step.sh" C-remove-core "$H/dsh.sh" plugin --profile $P remove hanamesh-core
installed C; loaders C
up $P C-core-removed || { echo "C boot failed"; exit 1; }
probe C-core-removed routes
ui C-core-removed C-core-removed '[{"capture":"home"}]'
down C-core-removed
# D
"$H/step.sh" D-readd-core48 "$H/dsh.sh" plugin --profile $P add "file:$PR/.inputs/hanamesh-core-0.2.0-rc.48.tgz"
installed D; loaders D
up $P D-core48-readded || exit 1
probe D-core48-readded core; probe D-core48-readded routes
down D-core48-readded
( cd "$RUN/home/dsh" && find storages data -type f 2>/dev/null | sort ) > "$EVID/logs/storage-files.txt"
ps -axo pid=,command= | grep -F "$RUN/home" | grep -v grep > "$EVID/logs/leftover-procs.txt"; echo "leftover_dsh_procs=$(wc -l < "$EVID/logs/leftover-procs.txt" | tr -d ' ')" | tee -a "$EVID/logs/probes.jsonl"
echo gate_done

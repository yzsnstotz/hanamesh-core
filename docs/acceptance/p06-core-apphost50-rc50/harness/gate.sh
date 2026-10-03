#!/bin/bash
# P06-CORE-APPHOST50-01 real-DSH gate, one pass on one fresh profile:
#   A install Core50 tgz via `dsh plugin add` → B boot: three loaders, Core settings/device readable, no duplicate → C `dsh plugin remove
#   hanamesh-core` → base DSH boots → D re-add Core50 → boots again. Usage: RUN=<fresh dir with inputs/ and ports.env> gate.sh
. "$(dirname "$0")/lib.sh"; P=p50; PR="$RUN/home/dsh/profiles/$P"
set -o pipefail
umask 077
"$NODE" "$H/stub.mjs" $SPORT "$EVID/logs/stub-requests.jsonl" > "$RUN/stub.out" 2>&1 & STUB=$!; trap 'kill $STUB 2>/dev/null' EXIT
installed() { "$H/step.sh" $1-installed sh -c "cd '$PR/node_modules' && for d in hanamesh-core hanamesh-usage @hanamesh/dsh-app-host @hanamesh/lib-provision; do printf '%s ' \$d; grep -m1 '\"version\"' \$d/package.json 2>/dev/null || echo ABSENT; done; shasum -a 256 @hanamesh/dsh-app-host/dist/manager.js hanamesh-core/lib/client.js hanamesh-core/lib/dsh.mjs 2>/dev/null; find . -name package.json -path '*dsh-app-host/package.json' -o -name package.json -path '*hanamesh-usage/package.json' -o -name package.json -path '*hanamesh-core/package.json' | sort"; }
loaders() { "$H/step.sh" "$1-dump" "$H/dsh.sh" --profile "$P" --dump-config || return 1; grep -n 'id: hanamesh' "$EVID/logs/$1-dump.log" | tee "$EVID/logs/$1-loader-ids.txt" || true; for id in hanamesh-core hanamesh-usage hanamesh-app-host; do count=$(grep -c "id: $id$" "$EVID/logs/$1-dump.log" || true); [ "$count" = "$2" ] || { echo "$1 $id count=$count expected=$2"; return 1; }; done; echo "$1 each_hanamesh_loader_count=$2" | tee -a "$EVID/logs/probes.jsonl"; }
# A
"$H/setup.sh" $P > "$RUN/setup.out" 2>&1 || { cat "$RUN/setup.out"; exit 1; }
"$H/step.sh" A-add-core50 "$H/dsh.sh" plugin --profile $P add "file:$PR/.inputs/hanamesh-core-0.2.0-rc.50.tgz" || exit 1
installed A; loaders A 1 || exit 1
# B
up $P B-core50 || exit 1
probe B-core50 core || exit 1; probe B-core50 routes || exit 1; probe B-core50 target || exit 1
"$NODE" "$H/ui-target.mjs" B-core50 "$DPORT" | tee "$EVID/logs/B-core50-ui.jsonl" || exit 1
down B-core50 || exit 1
grep -i -n 'duplicate' "$EVID/logs/B-core50.boot.log" > "$EVID/logs/B-duplicate-grep.txt"; echo "B duplicate_lines=$(wc -l < "$EVID/logs/B-duplicate-grep.txt" | tr -d ' ')" | tee -a "$EVID/logs/probes.jsonl"
# C
"$H/step.sh" C-remove-core "$H/dsh.sh" plugin --profile $P remove hanamesh-core
installed C; loaders C 0 || exit 1
up $P C-core-removed || { echo "C boot failed"; exit 1; }
probe C-core-removed routes || exit 1
down C-core-removed || exit 1
# D
"$H/step.sh" D-readd-core50 "$H/dsh.sh" plugin --profile $P add "file:$PR/.inputs/hanamesh-core-0.2.0-rc.50.tgz"
installed D; loaders D 1 || exit 1
up $P D-core50-readded || exit 1
probe D-core50-readded core || exit 1; probe D-core50-readded routes || exit 1; probe D-core50-readded target || exit 1
"$NODE" "$H/ui-target.mjs" D-core50-readded "$DPORT" | tee "$EVID/logs/D-core50-ui.jsonl" || exit 1
down D-core50-readded || exit 1
( cd "$RUN/home/dsh" && find storages data -type f 2>/dev/null | sort ) > "$EVID/logs/storage-files.txt"
ps -axo pid=,command= | grep -F "$RUN/home" | grep -v grep > "$EVID/logs/leftover-procs.txt"; echo "leftover_dsh_procs=$(wc -l < "$EVID/logs/leftover-procs.txt" | tr -d ' ')" | tee -a "$EVID/logs/probes.jsonl"
echo gate_done

# helpers sourced by gate.sh
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"; export RUN EVID; . "$RUN/ports.env"
H=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
up() { touch "$RUN/$2.hold"; ("$H/boot.sh" $1 $2 &); for i in $(seq 1 150); do [ -f "$RUN/$2.up" ] && return 0; tail -1 "$EVID/logs/boot-summary.log" 2>/dev/null | grep -q "$2 web_up=NO" && return 1; sleep 0.5; done; return 1; }
down() { rm -f "$RUN/$1.hold"; for i in $(seq 1 60); do [ -f "$RUN/$1.up" ] || return 0; sleep 0.5; done; }
probe() { "$NODE" "$H/probe.mjs" $1 $DPORT "${@:2}" | tee -a "$EVID/logs/probes.jsonl"; }
ui() { "$NODE" "$H/ui.mjs" $1 $DPORT $2 "$3" | tee -a "$EVID/logs/ui.jsonl"; }

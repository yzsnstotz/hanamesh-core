#!/bin/bash
# usage: step.sh <tag> <command...> — full output to logs/<tag>.log ($RUN redacted), real exit code to logs/steps.log
. "$(dirname "$0")/env.sh"
TAG=$1; shift
{ echo "\$ $*"; "$@"; } > "$RUN/$TAG.raw" 2>&1; rc=$?
sed "s#$RUN#\$RUN#g" "$RUN/$TAG.raw" > "$EVID/logs/$TAG.log"
echo "$(date -u +%FT%TZ) $TAG rc=$rc :: $*" | sed "s#$RUN#\$RUN#g; s#$EVID/harness/#harness/#g" | tee -a "$EVID/logs/steps.log"; exit $rc

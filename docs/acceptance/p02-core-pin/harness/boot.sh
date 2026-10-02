#!/bin/bash
# usage: boot.sh <profile> <tag> — boots `dsh --profile P --no-open --port $DPORT`; "web up" = DSH printed its web URL and the port
# answers HTTP. Records the real exit code. While up, $RUN/<tag>.url (0600) holds the session URL; touch $RUN/<tag>.hold to keep it
# running. The evidence copy of the log is token- and path-redacted.
. "$(dirname "$0")/env.sh"; . "$RUN/ports.env"
umask 077
P=$1; TAG=$2; RAW="$RUN/$TAG.raw.log"; LOG="$EVID/logs/$TAG.boot.log"
"$(dirname "$0")/dsh.sh" --profile $P --no-open --port $DPORT > "$RAW" 2>&1 & pid=$!
up=0; for i in $(seq 1 240); do
  if ! kill -0 $pid 2>/dev/null; then break; fi
  if grep -q '^dsh web: http' "$RAW"; then code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$DPORT/ || true)
    if [ "$code" != 000 ]; then up=1; break; fi; fi; sleep 0.5
done
if [ $up = 1 ]; then
  grep -m1 -o 'http://127.0.0.1:[0-9]*/?token=[A-Za-z0-9_-]*' "$RAW" > "$RUN/$TAG.url"
  echo "$(date -u +%FT%TZ) $TAG web_up port=$DPORT root_without_token=$code" | tee -a "$EVID/logs/boot-summary.log"; echo $pid > "$RUN/$TAG.up"
  while [ -f "$RUN/$TAG.hold" ]; do sleep 1; done
  kill -INT $pid; wait $pid; rc=$?; echo "$(date -u +%FT%TZ) $TAG stopped_by=SIGINT rc=$rc" | tee -a "$EVID/logs/boot-summary.log"
else
  wait $pid; rc=$?; echo "$(date -u +%FT%TZ) $TAG web_up=NO exit_rc=$rc" | tee -a "$EVID/logs/boot-summary.log"
fi
sed -E "s/token=[A-Za-z0-9_-]+/token=<redacted>/g; s#$RUN#\$RUN#g" "$RAW" > "$LOG"; rm -f "$RUN/$TAG.up"

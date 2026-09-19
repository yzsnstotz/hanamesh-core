#!/usr/bin/env bash
# O3 stage 1+2: one-command install and T10 lifecycle scenarios on the pinned DSH (0.1.5-alpha.1), each in a fresh DSH_HOME.
# usage: scripts/o3/t10.sh <ROOT> [REGISTRY_PORT]   — expects a verdaccio already serving the three packages on the port.
set -uo pipefail
ROOT=${1:?usage: t10.sh ROOT [PORT]}; RP=${2:-4879}
CORE=/Users/yzliu/work/projects/hanamesh/hanamesh-core
export DSH_BIN=${DSH_BIN:-/Users/yzliu/work/projects/hanamesh/hanamesh-dsh-runtime/runtime/node_modules/@deepseek-ai/dsh/lib/bin.js}
CORE_VER=${CORE_VER:-0.2.0-rc.11}; CORE_PREV=${CORE_PREV:-0.2.0-rc.10}; USAGE_VER=0.2.0-rc.4; AH_VER=0.1.0-rc.14
OUT=$ROOT/stage2; mkdir -p $OUT; OPS=$OUT/T10-ops.md; : > $OPS
printf '| 场景 | 命令/编辑/点击 | 结果 | 日志 |\n|---|---|---|---|\n' >> $OPS
row(){ printf '| %s | %s | %s | %s |\n' "$1" "$2" "$3" "$4" >> $OPS; echo "[$1] $3"; }
newhome(){ local h=$ROOT/homes/$1; rm -rf $h; mkdir -p $h; bash $CORE/scripts/p1/fresh-home.sh $h $RP >/dev/null; echo $h; }
dshenv(){ source $1/env.sh; env -i HOME="$HOME" DSH_HOME="$DSH_HOME" NPM_CONFIG_USERCONFIG="$NPM_CONFIG_USERCONFIG" npm_config_cache="$npm_config_cache" PATH="$PATH" node "$HM_P1_DSH" "${@:2}"; }
add(){ dshenv $1 plugin --profile core add "$2" 2>&1; }
rmv(){ dshenv $1 plugin --profile core remove "$2" 2>&1; }
dump(){ dshenv $1 --profile core --dump-config 2>&1 | grep -E "^- id: |^  name: " ; }
boot(){ bash $CORE/scripts/p1/boot.sh $1 >$1/boot-result.txt 2>&1; local rc=$?; cat $1/boot-result.txt | tail -3; sleep 2; return $rc; }
stop(){ [ -f $1/boot.pid ] && kill $(cat $1/boot.pid) 2>/dev/null; sleep 1; }
cookie(){ source $1/env.sh; local T=$(grep -o 'token=[A-Za-z0-9_-]*' $1/boot.log | head -1 | cut -d= -f2); rm -f $1/cj; curl -sS -c $1/cj -o /dev/null "http://127.0.0.1:$HM_P1_PORT/?token=$T"; }
state(){ source $1/env.sh; curl -sS -b $1/cj "http://127.0.0.1:$HM_P1_PORT/api/hanamesh/core/state"; }
deviceid(){ state $1 | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).deviceId))"; }
entries(){ dump $1 | grep -c "^- id: hanamesh"; }

# ---- 2a fresh install (SI01–SI03, SI05, SI06)
H=$(newhome 2a); add $H hanamesh-core@$CORE_VER > $OUT/2a-add.log 2>&1; echo "exit=$?" >> $OUT/2a-add.log
dump $H > $OUT/2a-dump.txt; boot $H > /dev/null; B=$?; cookie $H; state $H > $OUT/2a-state.json
(source $H/env.sh; cd $DSH_HOME/profiles/core && pnpm ls --depth 1 2>/dev/null) > $OUT/2a-pnpm-ls.txt
DEV_A=$(deviceid $H); grep -iE "error|duplicate|failed" $H/boot.log > $OUT/2a-boot-errors.txt; cp $H/boot.log $OUT/2a-boot.log
row "2a 全新安装" "1 / 0 / 0" "entries=$(entries $H) boot=$B deviceId=${DEV_A:0:8} components=$(node -e "const j=require('$OUT/2a-state.json');console.log(j.components.map(c=>c.id+':'+c.status+':'+c.version).join(','))")" "2a-*.log"
stop $H
# ---- 2b-i usage first, then core (SI07)
H=$(newhome 2b-i); add $H hanamesh-usage@$USAGE_VER > $OUT/2b-i-add-usage.log 2>&1; boot $H >/dev/null; B1=$?; E1=$(entries $H); stop $H
(source $H/env.sh; ls $DSH_HOME/storages/ 2>/dev/null) > $OUT/2b-i-storages-before.txt
add $H hanamesh-core@$CORE_VER > $OUT/2b-i-add-core.log 2>&1; boot $H > /dev/null; B2=$?; grep -o "duplicate loader entry id[^\"]*" $H/boot.log | head -1 > $OUT/2b-i-failure.txt; cp $H/boot.log $OUT/2b-i-boot-fail.log; stop $H
rmv $H hanamesh-usage > $OUT/2b-i-remove.log 2>&1; boot $H > /dev/null; B3=$?; E3=$(entries $H); (source $H/env.sh; ls $DSH_HOME/storages/) > $OUT/2b-i-storages-after.txt; stop $H
row "2b-i 已有 usage 再装 core" "3 / 2 / 0" "usage-alone boot=$B1 entries=$E1; +core boot=$B2 failure='$(cat $OUT/2b-i-failure.txt)'; after remove usage boot=$B3 entries=$E3; storages kept=$(grep -c hanamesh_usage $OUT/2b-i-storages-after.txt)" "2b-i-*"
# ---- 2b-ii app-host first (SI08)
H=$(newhome 2b-ii); add $H @hanamesh/dsh-app-host@$AH_VER > $OUT/2b-ii-add-ah.log 2>&1; boot $H >/dev/null; B1=$?; E1=$(entries $H); stop $H
add $H hanamesh-core@$CORE_VER > $OUT/2b-ii-add-core.log 2>&1; boot $H >/dev/null; B2=$?; grep -o "duplicate loader entry id[^\"]*" $H/boot.log | head -1 > $OUT/2b-ii-failure.txt; cp $H/boot.log $OUT/2b-ii-boot-fail.log; stop $H
rmv $H @hanamesh/dsh-app-host > $OUT/2b-ii-remove.log 2>&1; boot $H >/dev/null; B3=$?; E3=$(entries $H); stop $H
row "2b-ii 已有 app-host 再装 core" "3 / 2 / 0" "ah-alone boot=$B1 entries=$E1; +core boot=$B2 failure='$(cat $OUT/2b-ii-failure.txt)'; after remove boot=$B3 entries=$E3" "2b-ii-*"
# ---- 2b-iii core first, then explicit usage (SI09)
H=$(newhome 2b-iii); add $H hanamesh-core@$CORE_VER >/dev/null 2>&1; boot $H >/dev/null; stop $H
add $H hanamesh-usage@$USAGE_VER > $OUT/2b-iii-add-usage.log 2>&1; boot $H >/dev/null; B2=$?; grep -o "duplicate loader entry id[^\"]*" $H/boot.log | head -1 > $OUT/2b-iii-failure.txt; cp $H/boot.log $OUT/2b-iii-boot-fail.log; stop $H
rmv $H hanamesh-usage > $OUT/2b-iii-remove.log 2>&1; boot $H >/dev/null; B3=$?; E3=$(entries $H); stop $H
row "2b-iii 已有 core 再显式装 usage" "1 / 1 / 0" "+usage boot=$B2 failure='$(cat $OUT/2b-iii-failure.txt)'; after remove boot=$B3 entries=$E3" "2b-iii-*"
# ---- 2c upgrade core prev -> current (SI10)
H=$(newhome 2c); add $H hanamesh-core@$CORE_PREV > $OUT/2c-add-prev.log 2>&1; boot $H >/dev/null; cookie $H; D1=$(deviceid $H); V1=$(source $H/env.sh; node -e "console.log(require('$DSH_HOME/profiles/core/node_modules/hanamesh-core/package.json').version)"); stop $H
add $H hanamesh-core@$CORE_VER > $OUT/2c-upgrade.log 2>&1; boot $H >/dev/null; B=$?; cookie $H; D2=$(deviceid $H); V2=$(source $H/env.sh; node -e "console.log(require('$DSH_HOME/profiles/core/node_modules/hanamesh-core/package.json').version)"); E=$(entries $H); stop $H
row "2c 升级一级 rc" "1 / 0 / 0" "$V1 -> $V2 boot=$B entries=$E deviceId same=$([ "$D1" = "$D2" ] && echo yes || echo NO)" "2c-*"
# ---- 2d-i disable usage via patch (SI11)
H=$(newhome 2d-i); add $H hanamesh-core@$CORE_VER >/dev/null 2>&1; (source $H/env.sh; f=$DSH_HOME/profiles/core/cordis.patch.yml; grep -v '^\[\]$' $f > $f.tmp; printf -- '- id: hanamesh-usage\n  disabled: true\n' >> $f.tmp; mv $f.tmp $f; cat $f > $OUT/2d-i-patch.yml)
boot $H >/dev/null; B=$?; cookie $H; state $H > $OUT/2d-i-state.json; U=$(node -e "const j=require('$OUT/2d-i-state.json');const c=j.components.find(c=>c.id==='usage');console.log(c.status+'/'+(c.serviceReady))" 2>/dev/null); grep -iE "error|failed" $H/boot.log > $OUT/2d-i-boot-errors.txt; stop $H
row "2d-i 禁用 usage" "0 / 1 / 0" "boot=$B usage component=$U boot-errors=$(wc -l < $OUT/2d-i-boot-errors.txt | tr -d ' ')" "2d-i-*"
# ---- 2d-ii invalid usage config (SI12)
H=$(newhome 2d-ii); add $H hanamesh-core@$CORE_VER >/dev/null 2>&1; (source $H/env.sh; f=$DSH_HOME/profiles/core/cordis.patch.yml; grep -v '^\[\]$' $f > $f.tmp; printf -- '- id: hanamesh-usage\n  config:\n    maxPending: 0\n' >> $f.tmp; mv $f.tmp $f; cat $f > $OUT/2d-ii-patch.yml)
boot $H >/dev/null; B=$?; grep -iE "failed to apply|INVALID_CONFIG|maxPending|error" $H/boot.log | head -3 > $OUT/2d-ii-failure.txt; cp $H/boot.log $OUT/2d-ii-boot.log; stop $H
row "2d-ii usage 非法 config" "0 / 2 / 0" "boot=$B failure='$(head -c 200 $OUT/2d-ii-failure.txt | tr '\n' ' ')'" "2d-ii-*"
# ---- 2e uninstall & data retention (SI13)
H=$(newhome 2e); add $H hanamesh-core@$CORE_VER >/dev/null 2>&1; boot $H >/dev/null; cookie $H; D1=$(deviceid $H)
(source $H/env.sh; curl -sS -b $H/cj -H "content-type: application/json" -H "origin: http://127.0.0.1:$HM_P1_PORT" -X POST "http://127.0.0.1:$HM_P1_PORT/api/hanamesh/core/consent" -d '{"state":"granted"}') > $OUT/2e-consent.json
(source $H/env.sh; curl -sS -b $H/cj "http://127.0.0.1:$HM_P1_PORT/api/hanamesh/usage/health") > $OUT/2e-usage-health-before.json; stop $H
(source $H/env.sh; ls $DSH_HOME/storages/) > $OUT/2e-storages-before.txt
rmv $H hanamesh-core > $OUT/2e-remove.log 2>&1; dump $H > $OUT/2e-dump-after-remove.txt; (source $H/env.sh; ls $DSH_HOME/storages/; echo ---; node -e "const m=require('$DSH_HOME/profiles/core/package.json');console.log(JSON.stringify({deps:m.dependencies,bundles:m.dsh.profile.bundles}))"; ls $DSH_HOME/profiles/core/node_modules | grep -c hanamesh) > $OUT/2e-after-remove.txt
boot $H >/dev/null; B1=$?; stop $H
add $H hanamesh-core@$CORE_VER > $OUT/2e-readd.log 2>&1; boot $H >/dev/null; cookie $H; D2=$(deviceid $H); (source $H/env.sh; curl -sS -b $H/cj "http://127.0.0.1:$HM_P1_PORT/api/hanamesh/usage/health") > $OUT/2e-usage-health-after.json; stop $H
row "2e 卸载与数据保留" "2 / 0 / 0" "after remove: entries=$(grep -c hanamesh $OUT/2e-dump-after-remove.txt) $(sed -n 's/.*---//p' $OUT/2e-after-remove.txt | tr '\n' ' ') storages kept=$(grep -c hanamesh $OUT/2e-after-remove.txt); boot-without=$B1; readd deviceId same=$([ "$D1" = "$D2" ] && echo yes || echo NO)" "2e-*"
echo "T10 done -> $OPS"

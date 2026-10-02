# P02-CORE-01 real-DSH gate. Every DSH call runs under `env -i` with a fresh isolated HOME/DSH_HOME; never ~/.dsh, never 3080.
# Adapted from the P02-APPHOST-01 harness (apphost-contract docs/acceptance/p02-apphost-contract/harness), same official CLI.
RUN=${RUN:?set RUN to a fresh directory}
EVID=${EVID:-/Users/yzliu/work/projects/hanamesh/_deliveries/p05-dispatch-20261002/worktrees/core-first-prompt/docs/acceptance/p02-core-pin}
NODE='/Users/yzliu/Library/Application Support/com.hanamesh.desktop/runtime/bin/node'
PNPM_CJS='/Users/yzliu/Library/Application Support/com.hanamesh.desktop/dependencies/pnpm/bin/pnpm.cjs'
CLI='/Users/yzliu/Library/Application Support/com.hanamesh.desktop/dependencies/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js'

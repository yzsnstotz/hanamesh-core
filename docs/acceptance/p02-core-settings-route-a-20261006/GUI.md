# Implementation self-test · REAL_UI (not independent VERIFY)

Shared lock hanamesh / P02-CORE-SETTINGS-01 / 01a10e51-a997-7ad0-96bc-72485d02df98 acquired before CUA. First lease chunk 0cb676 exit0; release f27622 exit0. Latest rc52 lease 4bee61 exit0; release c7df48 exit0. Temporary tabs closed, rc51 child99586 and rc52 child1197 stopped only.

Latest official DSH rc2 public-package host with newly packed Core rc52, fresh home/profile. No API key entered (Configure later), no credentials/model requests, no OAuth. Native Host Connection authentication retained; generated isolated launch token not printed/stored in evidence, bootstrap redirect uses it in memory only; recorded host URL redacted.

Actions and observed results:
1. Same sidebar HanaMesh entry → h1 HanaMesh 设置. Own full-screen dialog uses complete existing Core settings component; 01-settings.jpg / 01-settings.ax.txt. Core routes return real disconnected/optional-component states, not fixture values.
2. Data consent initial withheld → UI click grants → checkbox1, 当前：已开启 (02-granted.ax.txt) → UI uncheck withholds → checkbox0, 当前：已关闭 (03-withheld.ax.txt). 03-consent-network.json contains UI POST bodies and HTTP200 for both. ServerOrigin null prevents external transmission. Usage buffer/server deletion not exercised in this Core-only isolated host.
3. 重新检查 → POST health/recheck HTTP200 then state and points GET200. Unconnected 去网站绑定 → existing bind-link HTTP400; explicit CORE_URL_NOT_ALLOWED alert and 重新读取. 04-business-network.json / screenshot / AX. Retry clears alert and reads actual state. Existing 10s refresh also clears alerts; observation captured synchronously.
4. 返回 → page unmounted, focus aria-label 打开 HanaMesh 设置; 05-return-focus.json. Reopen → 关闭 → reopen → Escape → closed/focus entry; 06-escape.ax.txt.
5. Collapse sidebar → compact HanaMesh entry opens same full page. Native modal layout x0 y0 width1280 height720; scrollHeight990/clientHeight720; 07-layout.json. Complete page has scrollable lower rows.

No Account menu interaction, no host settings dialog navigation, no desktop settingsNavigation. CUA read-only DOM inspection used only for self-test geometry/focus; production code has no host querySelectors.

Limits: this is Core own isolated component runtime, symlinking the existing frozen public official host packages. Only Core newly installed; other four product plugins not installed/loaded/read. Not an Electron product gate, not packaging/dependency closure or clean machine, not independent REVIEW/GATE, not TO_TEST/ACCEPTED.

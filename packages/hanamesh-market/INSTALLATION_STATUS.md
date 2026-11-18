# Public installation status bridge · contract 1

Market 0.6.7 supplies metadata discovery and a separate, explicitly consented read. Discovery never launches a reader. This is an installation observation, not permission to install/upgrade, a Usage consent change, compatibility calculation, or proof of another client.

## Discovery and request

Both the existing website handoff listener and the DSH local library listener add optional `installationStatus` to `GET /hanamesh/library/install-target`:

```json
{"contract":"hanamesh.installation-status","contractVersion":"1","path":"/hanamesh/library/installation-status"}
```

The field is advertised independently of `ready` (which describes controlled installation). Consumers must use the path on that same responder only, and only when the capability/contract is present. Old providers have no capability; do not probe a guessed path.

Only after the person's explicit “检测本机安装状态” click, send `POST` to that path with `credentials:'omit'`, `Content-Type: application/json`, and exactly:

```json
{"contractVersion":"1","consent":"read-installations"}
```

The owning listener enforces its existing exact loopback Host. Origin is required: handoff allows only `library.handoff.allowedOrigins`; the DSH library additionally permits its actual workspace/transport origins. Null/unlisted/missing Origin is rejected, with no CORS grant for the rejected origin. Cookie or Authorization, query fields, iframe control, absolute/protocol-relative/backslash targets, wrong method/content type, invalid JSON, extra fields, unsupported contract or missing exact consent are rejected **before** any directory/CLI/Core read. The body limit is the existing `HANDOFF_BODY_MAX_BYTES` (4096), not a new configurable default. OPTIONS returns 204 with exact approved Origin, POST/content-type and Private Network Access; it performs no read. No credentials or persistent consent are accepted.

Responses use JSON, `Cache-Control:no-store`, nosniff and frame-denying CSP. After the listener's preliminary Host/target/frame checks and successful allowed-Origin admission, subsequent named refusals carry CORS; preliminary safety refusals can omit CORS. Errors use `{error:{code,message,details?},traceId}`; messages never include raw reader output, paths or exceptions.

## Response

Public types and capability are exported at `@hanamesh/market/installation-status`.

```ts
interface InstallationStatus {
  schemaVersion:1;
  client:'hanamesh'|'dsh';
  checkedAt:string; // current read completion, ISO UTC; not an atomic whole-machine snapshot
  observations:readonly InstallationObservation[];
  traceId?:string;
}
interface InstallationObservation {
  channel:'hanamesh'|'dsh'|'claude'|'codex';
  scope:{id:'current-runtime'|'other-runtime'|'agent-cli'|'desktop-app';
    kind:'responding-runtime'|'other-client'|'official-user-profile'|'desktop-app';label:string};
  status:'installed'|'not-installed'|'incomplete'|'unknown';
  version:string|null;
  versionKind:'suite-bundle'|'agent-distribution';
  components:readonly {name:string;version:string|null;active?:boolean;status?:string}[];
  identity:{pluginName:string;marketplace:string}|null;
  reason:{code:string;message:string;action:string}|null;
  blocked?:readonly {code:string;moduleName?:string}[];
}
```

The five distinct observations are: responding runtime, the other DSH/HanaMesh runtime (always `unknown`, not observed by this responder), Claude Code current-user CLI scope, Codex CLI current-user local-marketplace scope, and Codex/ChatGPT desktop App scope (always named `unknown`). CLI labels explicitly exclude project/other isolated profiles and desktop App. A valid absence is absence **only in the named current-user scope**; never show it as a machine-wide uninstall. Preserve every responder/scope; ports are not durable instance identities. Conflicts between responders are unknown, never resolved by choosing one installed result.

Current runtime status/version/components come only from the optional public Core protocol `'1'` `getSuiteDeclaration()` **without an argument**, through the existing Core adapter. No registry request, health substitution, physical file-count completeness, version-range/peer/source algorithm or local upgrade selection is added. Complete maps to installed; incomplete stays incomplete; unknown stays unknown with top-level version null but known component versions and sanitized named blocked codes retained. Missing method, malformed declaration and read failure have distinct reasons. Each detection re-reads; Core removal/invalidation cannot reuse an old installed answer. Agent distribution version is independent of the DSH suite bundle version. Missing active fields remain absent.

## Automatic official CLI discovery

Market 0.6.23 discovers Claude Code and Codex for the current OS user after the consented request. There is no manual reader setting; the former `library.installationReaders` option and public reader configuration type are removed. Browser requests cannot supply paths, commands, environment or profile selection. The registered suite identity is `hanamesh@hanamesh`, with the exact HTTPS source `https://github.com/yzsnstotz/hanamesh-plugins`, as in the existing suite catalog contract.

Selection is deterministic: the first executable in the inherited absolute PATH directories wins; if absent on macOS/Linux, query the user's interactive login shell once (`-ilc`), extracting only the named infrastructure-path environment in a framed JSON value. This follows [VS Code's shell environment practice](https://code.visualstudio.com/docs/configure/command-line#_how-do-i-detect-when-a-shell-was-launched-by-vs-code). No full environment dump is collected. Like [VS Code's implementation](https://github.com/microsoft/vscode/blob/main/src/vs/platform/shell/node/shellEnv.ts), shell stderr is separate from success: exit/result and a valid framed payload decide success. Normal Bash non-TTY diagnostics are discarded, not treated as failure; both streams still count toward the existing byte budget. Plugin inventory commands retain their clean-stderr requirement. Shell startup noise and stderr never enter public output. Next search the fixed layouts below in listed order. Finally, scan the listed manager version directories in order, newest Node SemVer first within each directory. Relative/empty PATH segments are excluded. Do not run every candidate or switch to a second CLI when the selected command fails, is old or returns an invalid inventory. Executable names alone are not a signature guarantee; the fixed official version syntax and inventory schema are validated before returning facts.

| Layout | Searched locations and source |
|---|---|
| Official native / standalone | `~/.local/bin/claude[.exe]` ([Claude setup](https://code.claude.com/docs/en/setup#auto-updates)); native launcher symlinks resolve through normal OS execution. Codex `~/.local/bin/codex`, `CODEX_INSTALL_DIR`, Windows `%LOCALAPPDATA%/Programs/OpenAI/Codex/bin/codex.exe` ([official installer variables](https://learn.chatgpt.com/docs/config-file/environment-variables#installer-variables), [installation](https://learn.chatgpt.com/docs/cli)). Standalone release binaries in custom directories are found through inherited/login PATH or `CODEX_INSTALL_DIR`; unlinked archives are not guessed. |
| Legacy Claude local | `~/.claude/local/claude`, `~/.claude/local/node_modules/.bin/claude`. These are historical npm-local layouts, not the current native default; [upstream issue with the original launcher path](https://github.com/anthropics/claude-code/issues/2824). No `.claude.json` or installMethod file is read. |
| npm global | `npm_config_prefix` / `NPM_CONFIG_PREFIX` (`bin` on POSIX, prefix itself on Windows), `~/.npm-global/bin`, `~/.npm/bin`, `%APPDATA%/npm`, `%ProgramFiles%/nodejs`; system prefixes and active Node manager bins below. [npm folder rules](https://docs.npmjs.com/cli/v11/configuring-npm/folders/). No npmrc read or npm config command. |
| pnpm global | `PNPM_HOME` and its `bin`, `~/.local/share/pnpm[/bin]`, `~/Library/pnpm[/bin]`, `%LOCALAPPDATA%/pnpm`. [pnpm setup](https://pnpm.io/cli/setup). Both earlier direct-bin and current bin-subdirectory layouts are recognized. |
| Yarn Classic | `~/.yarn/bin`, `~/.config/yarn/global/node_modules/.bin`, custom prefix via PATH/login shell. [Yarn global](https://classic.yarnpkg.com/lang/en/docs/cli/global/). |
| Volta / asdf / mise | `VOLTA_HOME/bin` or `~/.volta/bin`, `%LOCALAPPDATA%/Volta/bin`; `ASDF_DATA_DIR/shims` or `~/.asdf/shims`; `MISE_DATA_DIR/shims` or `~/.local/share/mise/shims`. [Volta](https://docs.volta.sh/guide/understanding), [asdf](https://asdf-vm.com/manage/configuration.html), [mise](https://mise.jdx.dev/directories.html). |
| Homebrew / system | `/opt/homebrew/bin`, `/usr/local/bin`, `/home/linuxbrew/.linuxbrew/bin`, `/usr/bin`, `/bin`. [Homebrew prefixes](https://docs.brew.sh/Installation); [Claude Homebrew setup](https://code.claude.com/docs/en/setup), [Codex distribution](https://learn.chatgpt.com/docs/cli). Brew-linked native binaries use the same discovery path. |
| nvm / fnm / installed manager versions | `NVM_BIN`, `NVM_SYMLINK`; `NVM_DIR/versions/node/*/bin` or `~/.nvm/versions/node/*/bin`; Windows `NVM_HOME/*`; `FNM_MULTISHELL_PATH`; `FNM_DIR/node-versions/*/installation[/bin]`, `~/.local/share/fnm/node-versions/*/installation/bin`, `~/Library/Application Support/fnm/node-versions/*/installation/bin`, `%APPDATA%/fnm/node-versions/*/installation`; asdf `installs/nodejs/*/bin`, mise `installs/node/*/bin`. Only SemVer directory names are scanned. [nvm](https://github.com/nvm-sh/nvm), [fnm](https://github.com/Schniz/fnm/blob/master/docs/commands.md), [asdf](https://asdf-vm.com/manage/configuration.html), [mise](https://mise.jdx.dev/directories.html). |
| Windows native links / npm shims | `%LOCALAPPDATA%/Microsoft/WinGet/Links` ([Claude WinGet](https://code.claude.com/docs/en/setup)). `.exe` precedes `.cmd` per directory. A `.cmd` is never sent to a shell: resolve only the adjacent official npm `node_modules/@anthropic-ai/claude-code/cli.js` or `node_modules/@openai/codex/bin/codex.js`, run it with the verified standalone Node. Missing JS is a named failure, not a guessed shell command. |
| Desktop app bundle (macOS, Codex only, searched last) | `/Applications` and `~/Applications` `ChatGPT.app/Contents/Resources/codex-cli/bin/codex` (the ChatGPT desktop app ships the Codex CLI; it reads the same `CODEX_HOME` / `~/.codex`). A standalone CLI in any earlier layout wins. |

HOME is the host user's HOME/USERPROFILE. Honor existing `CLAUDE_CONFIG_DIR` / `CODEX_HOME` environment paths, otherwise use `~/.claude` / `~/.codex`. These directories must already exist; discovery never creates them, reads their contents, or reads credentials, sessions or private configuration files. Only official read commands observe plugin inventory. The named profile scope is not a machine-wide inventory. Electron hosts retain the existing verified standalone Node requirement.

Named automatic read budgets are `INSTALLATION_READ_BUDGET.timeoutMs=2000` and `maxOutputBytes=20000`, retaining the existing installation-command fixtures' values without extending deadlines or adding retries. **待追认:** the former product configuration had required budgets but no defaults; adopting those existing fixture values for automatic product reads requires owner acknowledgement. They are code constants documented here, with no manual reader form.

Minimum CLI version and fixed syntax (no new upper bound):

| Channel | Minimum version / accepted `--version` syntax | Fixed subsequent read argv |
|---|---|---|
| Claude Code | `>=2.1.301`, `MAJOR.MINOR.PATCH[-prerelease] (Claude Code)` | `plugin list --json`; `plugin marketplace list --json` |
| Codex CLI | `>=0.162.1`, `codex-cli MAJOR.MINOR.PATCH[-prerelease]` (desktop bundles report e.g. `0.167.0-alpha.3.2`; SemVer ordering applies, so `0.162.1-alpha.1` is below the minimum) | `plugin list --json --disable remote_plugin`; `plugin marketplace list --json --disable remote_plugin` |

Malformed version output is `AGENT_READER_VERSION_INVALID`; below-minimum versions are `AGENT_READER_VERSION_UNSUPPORTED`; JSON parse/shape failure is `AGENT_INVENTORY_INVALID`. New versions such as 2.1.319 / 0.167.0 must pass exactly the existing inventory validation.

The Codex flag was checked through this exact CLI's public `features list`; it excludes remote directory reads. Passing the version floor is necessary but not sufficient: both JSON shapes must validate. Claude uses the official installed array's `id`, user `scope`, enabled/version and load diagnostics. Other project-only target rows are unknown for this reader. Codex uses the official `installed` array and its qualified identity, installed/enabled/version. The exact target marketplace must match the registered HTTPS source in marketplace list; Codex's per-install `marketplaceSource` must also be present, supported and consistent. For official GitHub `sourceType:'git'` records, the exact credential/query/fragment-free `https://github.com/owner/repository.git` spelling identifies the same repository as the registered suffix-free URL. Normalize both the marketplace mapping and the per-install source independently; no other URL rewrite, repository substitution or source fallback is accepted. A local/different/unreadable source, duplicate/conflicting target or malformed/truncated/empty raw output is unknown. Only a complete valid clean inventory with no target in the observed user scope is not-installed. A known install may have version null; consumers must show version unknown. Official load/payload issues produce incomplete, not successful readiness. No plugin MCP/hook definitions, unrelated inventory or CLI raw diagnostics are returned.

Commands run with an empty stdin in a disposable neutral cwd, only named HOME/config/platform paths, only the selected inherited/recovered absolute PATH plus allowlisted manager and standard XDG directory variables, no inherited model/API keys, proxy/auth/askpass/Node preload, and disabled Git credential helpers. The verified Node and selected executable directories prefix the selected PATH; retain its manager binary directories, so an official asdf shim can resolve `asdf`. Preserve existing XDG_CONFIG_HOME/CACHE_HOME/DATA_HOME/STATE_HOME/RUNTIME_DIR and CONFIG_DIRS/DATA_DIRS; absent variables stay absent and retain manager OS defaults. The supervisor never overwrites XDG paths with empty temporary directories. Only TMPDIR/TMP/TEMP and cwd use the owned disposable directory. Manager paths additionally include ASDF_CONFIG_FILE, MISE_CONFIG_DIR/GLOBAL_CONFIG_FILE/CACHE_DIR/STATE_DIR alongside the earlier manager-home keys; credentials, proxy, Node preloads and askpass remain excluded. Recovered shell manager/XDG paths follow the same allowlist; there is no fallback to a different installation. No model/install/upgrade/marketplace refresh command runs. On POSIX, a detached IPC reaper owns the neutral cwd outside a separate live command-group anchor. The anchor remains alive until output closes; abort, budget exhaustion, overflow, provider disposal or parent IPC disconnect makes the surviving reaper terminate only that live anchor's group. The reaper waits for group close before removing the cwd, so active writers cannot race deletion, including after caller death. No released PID/PGID or arbitrary process name is used. The caller also performs exact-path cleanup when alive. On Windows the same live anchor/reaper ownership uses the OS taskkill tree operation for its precise owned anchor; no process-name match or command-shell execution. Windows/Linux runtime evidence is separate from macOS fixture execution. There is no retry or stale-result cache. Automatic recovery after an internal reaper/anchor itself is externally SIGKILLed or suffers a native crash is outside this lifecycle guarantee; an external intervention can leave command processes or temporary files and is never reported as an installed/absent inventory.

## Refusals, unknown reasons, and lifecycle

HTTP refusals: `HOST_DENIED`, `ORIGIN_DENIED`, `FRAME_CONTROL_DENIED`, `CREDENTIALS_NOT_ACCEPTED` (403), `METHOD_NOT_ALLOWED` (405), `CONTENT_TYPE_REQUIRED` (415), `BODY_TOO_LARGE` (413), `BAD_TARGET`, `INVALID_JSON`, `UNKNOWN_FIELDS`, `INSTALLATION_STATUS_CONTRACT_UNSUPPORTED` (400), `INSTALLATION_STATUS_CONSENT_REQUIRED` (403), `INSTALLATION_STATUS_UNAVAILABLE` (503). A caller/provider cancellation has `INSTALLATION_STATUS_CANCELLED` (499 when still connected); disconnected clients receive no result.

Per-scope unknown reasons always include a safe code/message/action:

- `CORE_SUITE_DECLARATION_MISSING`, `CORE_SUITE_DECLARATION_INVALID`, `CORE_SUITE_READ_FAILED`, `CORE_SUITE_DECLARATION_UNKNOWN`; incomplete: `CORE_SUITE_CURRENT_INCOMPLETE`, plus Core blocked codes.
- `OTHER_RUNTIME_NOT_OBSERVED`, `CODEX_DESKTOP_SCOPE_UNOBSERVABLE`, `DSH_PROFILE_UNREADABLE`; incomplete: `DSH_PROFILE_SUITE_INCOMPLETE`.

Authoritative absence (read-only, no CLI execution): an official user profile directory (`CLAUDE_CONFIG_DIR` / `CODEX_HOME`, else `~/.claude` / `~/.codex`) that does not exist holds no user-scope plugin, so that channel is `not-installed` with the registered identity, whether or not the CLI is installed. An existing but inaccessible directory stays `AGENT_PROFILE_UNAVAILABLE`; an existing profile without a readable CLI stays `AGENT_READER_UNAVAILABLE`.

The HanaMesh client's `other-runtime` row (`kind:'other-client'`) reads the distinct official DSH desktop profile on disk. A missing profile manifest is not-installed; existing profiles without a total-bundle dependency are inventoried member by member rather than declared absent. For each protected member Market resolves public package metadata without executing it, checks entry existence as a physical fact, records dependency + `dsh.profile.bundles` selection, and collects resolvable peer metadata in that member's own resolution context. Facts use `scope:'profile'`; the observing client's runtime Node/React are never evidence of DSH runtime readiness. Core's optional public `assessLegacyInstallation(facts)` alone validates member ranges, identities, formats and compatibility. Market checks the response DTO, service identity and forwards status, components, named issue codes and reason. No range list, minimum version or candidate ranking is added here.

Core's `CORE_LEGACY_COMPONENTS_INSTALLED` is installed with version null (there is no bundle version), and recommends upgrading; `CORE_LEGACY_COMPONENTS_UNUSABLE` is incomplete with the exact member reason; every member absent is not-installed. Unreadable facts or missing/changed assessor remain unknown (`CORE_LEGACY_ASSESSOR_MISSING` / `CORE_LEGACY_ASSESSMENT_FAILED`). No-bundle current runtime observations use the same optional Core declaration `legacy` verdict. Existing total-bundle profile checks and runtime completeness guards remain unchanged. This observation proves profile installation/selection, not that DSH is running. Core's no-numeric-floor policy is pending owner ratification; Market does not invent one.

Before every read, both profiles are resolved physically; same-directory aliases or unresolved identities keep `OTHER_RUNTIME_NOT_OBSERVED`. A DSH listener never inventories the HanaMesh client. Reader abort/disposal still suppresses late results; collecting metadata does not execute plugins, access credentials, mutate profiles or start DSH.

- `AGENT_READER_VERSION_INVALID`, `AGENT_READER_VERSION_UNSUPPORTED`, `AGENT_READER_NODE_REQUIRED`, `AGENT_SHELL_ENV_UNAVAILABLE`, `AGENT_READER_ENTRYPOINT_UNAVAILABLE`, `AGENT_READER_DISCOVERY_INVALID`.
- `AGENT_PROFILE_UNAVAILABLE`, `AGENT_READER_UNAVAILABLE`, `AGENT_READER_PERMISSION_DENIED`, `AGENT_READER_TIMEOUT`, `AGENT_READER_OUTPUT_LIMIT`, `AGENT_READER_DIAGNOSTIC`, `AGENT_READER_CLEANUP_FAILED`, `AGENT_READER_FAILED`.
- `AGENT_INVENTORY_INVALID`, `AGENT_INVENTORY_CONFLICT`, `AGENT_SCOPE_UNOBSERVABLE`, `AGENT_MARKETPLACE_SOURCE_UNAVAILABLE`, `AGENT_MARKETPLACE_SOURCE_MISMATCH`.
- An installed record with unobserved version uses `AGENT_VERSION_UNAVAILABLE`; incomplete uses `AGENT_PLUGIN_LOAD_FAILED` / `AGENT_PLUGIN_PAYLOAD_MISSING`.

Start each explicit detection by clearing previous observations. Cancel fetch when the person clears/revokes/leaves, the consumer/identity changes, or the window unmounts. Discard late request generations. A failed read/capability disappearance never keeps old installed status. Do not poll, persist, forward inventory or change Core/Usage recording consent. G's website consumer owns these page lifecycle rules; the bridge cancels on disconnect and module unload and holds no cross-request observation cache.

Official command references: [Claude Code plugin commands](https://code.claude.com/docs/en/plugins/cli-reference), [Codex CLI plugin reference](https://learn.chatgpt.com/docs/cli/reference). [OpenAI local plugin scope documentation](https://developers.openai.com/plugins/build/plugins) describes multiple client scopes; CLI installation is not used here as proof of the desktop App.

For DSH/HanaMesh runtime observations, versionKind is suite-bundle and version is the installed @hanamesh/hanamesh version. Component rows retain their physical versions. Agent distribution observations retain their existing semantics.

R115 regression fixtures execute real non-TTY Bash, asdf 0.20.2 official shim and mise 2026.11.4 with default/custom/shell-defined global XDG selection. Tool provenance, hashes and the explicit test-only binary inputs are in source `tests/fixtures/installation-managers/README.md`; binaries do not enter the npm package.

0.6.25：Claude 官方市场清单的 `source: "github"` 使用 `repo` 的 owner/repository 身份与登记的 GitHub HTTPS 市场核对；`url` / `git` 继续核对其 URL；官方 GitHub HTTPS Git 来源允许同一仓库的 `.git` 后缀。来源不同仍为 `AGENT_MARKETPLACE_SOURCE_MISMATCH`，不会把无响应或缺少 CLI 当作未安装。

安装物回归：`node tests/native/installed-detection.mjs /absolute/HanaMesh.app /absolute/new-evidence-directory https://website-origin` 从实际 app 资源读取种子版本，以全新 HOME / DSH_HOME / shared home / user-data 启动同一可执行文件；仅在出现该按钮时选择 Set up later，不登录或开启记录；随后断言获准 Origin 的发现响应、真实 POST、五作用域及本 runtime 的完整套件/版本。检测失败退出非零，保留逐端口响应、UI 与首错；不以页面可打开或目录中存在包文件代替运行结果。该手工安装物测试需要 macOS GUI 会话，默认源码单测另覆盖全新彩排配置初始化。

未发布候选可在最后追加本人自建、无凭据且由正常 DSH CLI 安装的 profile 路径。回归把该资料复制到新 DSH_HOME，再运行同一安装物；不手改 app 或 dist。默认不传此参数时仍检查 app 原始种子。

DT8 / R204 repair (same 0.6.28 candidate): package metadata lookup uses Node's public module search paths when package.json is not exported, independently of whether the root entry resolves. An existing package with a missing entry is collected as damaged with its real metadata/version; an existing package directory whose metadata cannot be read stays unreadable, never authoritative absence. Explicit peer read failures remain `unknown`. Market forwards these facts to Core and adds no compatibility policy.

R206 repair (same 0.6.28 candidate): hidden metadata lookup resolves its physical path with Node's public realpath before establishing the member's peer resolution context. This preserves pnpm peers bound beside the physical member, independently of entry health. Unreadable metadata/peers stay unconfirmed/unknown; only actual absence is collected as missing/null. Market still delegates all compatibility decisions to Core.


## Trusted command diagnostics (0.6.29)

Failed official reads emit one `APPHOST_INSTALLATION_COMMAND_DIAGNOSTIC` JSON record through the trusted host logger. The DSH entry supplies its existing logger; logger failures cannot change the installation observation. Public installation-status reasons keep the existing fixed code/message/action and never include this record or raw output.

The record contains only channel, fixed failure code, `stage` (`version`, `plugin-list`, `marketplace-list`; shell discovery uses `login-shell`), `failurePhase` (`worker-startup`, `anchor-startup`, `cli`, `cleanup`), `timedOut`, observed CLI `exitCode`/allowlisted `signal`, supervisor `workerExitCode`/`workerSignal`, `stderrBytes`, and `stderrCode` (`STDERR_PRESENT` / `STDERR_EMPTY`). No stderr content is retained, parsed for text categories or logged. Paths, argv, environment values, inventory and exceptions are excluded by a field projection. A null exit code/signal means no exit was observed; terminating an anchor does not fabricate a CLI exit status. Byte counts cover the observed stderr stream, including partial output before failure.

`timingsMs` uses a monotonic OS clock across the owned processes. `workerStartup` runs from fork to worker request acceptance; `anchorStartup` runs from anchor fork (including Windows job preparation) to CLI spawn attempt; `cli` runs from that attempt through pipe closure, or up to cancellation cleanup when no completion is observed; `cleanup` runs from reaper termination initiation through group/directory cleanup and the caller's final exact-path cleanup. `total` includes preflight and IPC gaps. A phase never started is null, not an invented zero. Incomplete phases measure through cleanup initiation/return. The timeout phase is determined at the original timeout instant, rather than after cleanup. Completed stderr/nonzero failures are attributed to CLI; cleanup failure remains cleanup.

This is additive observability only: `INSTALLATION_READ_BUDGET.timeoutMs=2000`, output limits, all other deadlines, command order, cancellation/ownership and clean-stderr validation are unchanged. No retry or budget extension is added. Source/fixture tests do not establish a diagnosis for DT10's already-lost first failure, or Linux/Windows/native-client acceptance.

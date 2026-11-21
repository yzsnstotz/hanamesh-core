# @hanamesh/market

Independent HanaMesh market plugin. It follows the Core repository's Theme subpackage convention; Core does not import it. The `@hanamesh/hanamesh` distribution composes its original Cordis patch.

The client contributes **Plugins → HanaMesh** using `plugins.tab`, and probes the public slot before advertising the entry. Catalog search, existing category/channel/source facets, 50-item loading, semantic task search, favorites, details and settings belong here. Missing recommendation, pack, platform overview, assessment, trust and domain data remain explicit empty states.

New installations use the native tab owner's `install()` after reviewing the exact version, author, source and trust notice. Installed/newer entries call `openPackage()`. Installed facts come only from the live plugin manager's `listBundles()`; compatibility uses the host SDK's `evaluatePluginCompatibility()` with current version exemptions. This package never runs a plugin installation command, installs through an AI agent, or offers a security audit. Non-DSH entries provide copy-command and website actions.

Application execution, runtime provisioning, processes, leases and model routes remain in `@hanamesh/dsh-app-host`. Suite completeness and compatible upgrade tuples remain Core public protocol-1 facts. Native package details own suite updates.

Read [CONTRACT.md](CONTRACT.md) for endpoints, source binding and website handoff. Use Node 24.13.1, `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm test`, `pnpm test:contract`, `pnpm test:mutations`, `pnpm pack`, then `pnpm verify:pack <archive>` in an isolated environment. The package's own lockfile declares its complete dependencies; it is not part of the root pnpm workspace.

Version 0.1.1 uses the public npm ^0.27.0 API contracts range. Publication is coordinated after review and merge; Git/SHA dependency specifications are not distribution inputs.

Version 0.1.2 fixes the official catalog choice to use `official=true`, matching the website. Literal source-ID filters and the existing 50-item pagination remain unchanged.

## Current scope: functional skeleton

Visual details are provisional pending the owner-approved DS3 ratings/discovery design. The independent plugin, native installation and installed facts, shared directory/semantic transport, compatibility, cancellation, retained errors/retry and 50-item pagination stay in this package. Replace the view components through `createMarketPage` rather than rewriting host/data or native-install logic; see CONTRACT.md. No client score/trust calculation is added.

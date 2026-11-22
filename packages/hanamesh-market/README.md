# @hanamesh/market

Independent HanaMesh market plugin. It follows the Core repository's Theme subpackage convention; Core does not import it. The `@hanamesh/hanamesh` distribution composes its original Cordis patch.

The client contributes **Plugins → HanaMesh** using `plugins.tab`, and probes the public slot before advertising the entry. Catalog search, existing category/channel/source facets, 50-item loading, semantic task search, favorites, details and settings belong here. Missing recommendation, pack, platform overview, assessment, trust and domain data remain explicit empty states.

Review the exact version, author, source and trust notice before confirming a new installation. Ordinary DSH bundles use the native tab owner's `install()` callback. For AppHost applications, Market calls the Cordis service `hanameshApps.installApplication` when available and displays its result. Applications use the native `install()` callback when the AppHost installation service is absent. AppHost verifies the installed version and application definition, provisions the runtime in the same transaction, and handles recovery on failure.

Installed facts come from the live plugin manager's `listBundles()`. Compatibility uses the host SDK's `evaluatePluginCompatibility()` with current version exemptions. The native tab owner's `openPackage()` opens package management. Non-DSH entries provide copy-command and website actions.

Application execution, runtime provisioning, processes, leases and model routes remain in `@hanamesh/dsh-app-host`. Suite completeness and compatible upgrade tuples remain Core public protocol-1 facts. Native package details own suite updates.

Read [CONTRACT.md](CONTRACT.md) for endpoints, source binding and suite status. Use Node 24.13.1, `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm test`, `pnpm test:contract`, `pnpm test:mutations`, `pnpm pack`, then `pnpm verify:pack <archive>` in an isolated environment. The package's own lockfile declares its complete dependencies; it is not part of the root pnpm workspace.

Version 0.1.4 refreshes the install button in an open detail when DSH reports an installation change, using the host's current installed state instead of polling.

Version 0.1.3 uses the public npm ^0.27.0 API contracts range. Publication is coordinated after review and merge; Git/SHA dependency specifications are not distribution inputs.

Version 0.1.2 fixes the official catalog choice to use `official=true`, matching the website. Literal source-ID filters and the existing 50-item pagination remain unchanged.

## Current scope: functional skeleton

Visual details are provisional pending the owner-approved DS3 ratings/discovery design. The independent plugin keeps installation confirmation, installed facts, shared directory and semantic transport, compatibility, cancellation, retry and 50-item pagination. Replace view components through `createMarketPage` to reuse the same data and installation integrations. See CONTRACT.md.

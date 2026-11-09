# HanaMesh A theme

Independent theme child package, owned and released from hanamesh-core. Brand stays read-only. The host metadata entry has no services, network requests or storage. The client contributes one `theme.overrideTokens('@hanamesh/theme', tokens)` layer with paired light/dark values derived from DS1's approved website design tokens.

Install `@hanamesh/theme` as a DSH bundle after the official web bundle. It is enabled by the bundle patch. Disabling/removing its profile entry retracts its layer through the owning Cordis effect. It does not persist a custom theme id or change the user's light/dark/system preference. User font choices take precedence over A's default system sans/mono stacks. Uninstall through DSH plugin management as usual.

Compatibility: DSH 0.2.2-rc.1 and subsequent 0.2.x versions that retain the public override API; peers use a range, not an exact host pin. Older hosts without that API are not claimed. Tests use exact 0.2.2-rc.1 as a validation baseline only. No Core trust allowlist changes.

The theme maps consumed background/text/border/accent/status/code/card/font/radius variables. It never changes host DOM, layout, slots, feature state, model credentials, or third-party iframe contents. Components with hardcoded styles remain the host's responsibility; report observed gaps rather than patching them here. Both product scenarios use the same tarball. Distribution/suite adoption follows review and publication of this package; no unpublished registry dependency is inserted into the existing suite.

Build: `npm run build`; unit/lifecycle/bundle validation: `npm test`; package: `npm pack`. No build dependencies are needed.

# Website installation target v1

The Market plugin owns the existing website protocol URLs, including their `/hanamesh/library/` prefix. These URLs no longer belong to AppHost. `GET /hanamesh/library/install-target` advertises protocol `hanamesh.install-target`, version `1`, supported `['1']`, the `#hanamesh-install?` fragment prefix, actual client identity and current native capability. Discovery is anonymous only for configured website origins, with exact local Host and CORS/PNA checks.

A website can post an item identity or package identity to `/hanamesh/library/handoff`; an optional exact structured installation target is checked against the current directory. The local window receives the pending request, opens the native Plugins page, and the HanaMesh tab presents the source/version confirmation. A handoff means intent, not authorization or success. The window can report only shown/cancelled/failed. Actual completion requires the matched native plugin-manager operation and fresh exact native installed facts. Expired requests keep a named cause.

A `hanamesh:suite-upgrade` target uses Core's current compatible suite tuple and native package management. Changing source, tuple or physical baseline invalidates confirmation. The Market does not own a CLI update path.

The old AppHost JavaScript Market seat, `openInstallTarget` exports and CLI/cursor catalog conformance suites were retired when the native Plugins tab and shared v2 directory became authoritative. They are not exported by the new package. The website handoff, discovery, status and fragment contracts remain. Consent-gated status is documented in INSTALLATION_STATUS.md.

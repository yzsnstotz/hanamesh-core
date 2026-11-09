# HanaMesh client pages (CL1)

The Core client contributes three additive root-scoped keyed main entries:

| Main key | Navigation |
| --- | --- |
| `hanamesh-home` | Sidebar panel id `hanamesh-home`, order 10, label HanaMesh 首页 |
| `hanamesh-account` | Core footer and account/data-authorization actions |
| `hanamesh-environment` | The environment tab in Settings and Connections |

Other navigation seats consumed by Core are `hanamesh-library` (AppHost), `hanamesh-usage` (Usage), and `hanamesh-providers` (AppHost). Missing component navigation is shown as unavailable; it does not select or create a Session. `layout.selectPanel(null)` returns to the existing conversation. DSH root/sidebar/conversation registrations are not replaced.

The environment main entry declares a root-scoped list child slot `hanamesh.environment.content`. Its component renders it through the public supplied `renderSlot` face. AppHost contributes installation environment, catalog and installation-source settings, and website handoff to that list. The declaration and contributions are owned by their registering Cordis fibers; no sibling implementation import or duplicated configuration store is used.

Account and environment views reuse Core's original actions, serialized configuration writes, consent confirmation/readback and return-from-website state refresh. The account view does not fetch asset balances or contribution pages. The home page reads Core state and the public AppHost inventory once while mounted; it does not start a model, enable data recording, or fetch balances. Unknown local inventory stays unavailable. Login, device binding, recording and model connections remain distinct facts.

Market transactions, issuance, LP and assets are website actions using Core's existing validated website/open-external routes. The old inline asset detail and its repeated points reads are removed from Core settings; the original separately owned one-shot bind nudge remains unchanged. Device event history in advanced settings retains its bounded read and original fact semantics.

Page CSS is scoped and consumes host theme tokens. The home navigation glyph reuses the exact supplied DS1 dashboard icon asset. No host layout selector or persistent appearance preference is changed. Existing host settings and admitted Modal fallback remain available independently of the additive layout scope.

The source/contract tests are not a visual or real-host acceptance result. See CL1 delivery for the exact archives, checks and outstanding DSH/browser verification.

The account main page now reviews both enabling and withdrawing recording through
the existing public DSH Modal. It shows the destination (or local-only status);
cancel/Escape leave consent unchanged. Confirmation invokes the original serialized
save and authoritative readback. The original settings-section integration remains
available. The native browser run found this missing review and now verifies cancel
without any consent POST. Theme coverage includes the dedicated sidebar, composer,
menu and bubble surfaces as well as the generic background aliases; disposing the
real owning theme fiber retracts the layer in the live client.

## R152 consent entry parity

The retained DSH `settings.section`, footer settings Modal and keyed account page share the same consent review. A switch gesture only opens the existing CoreModal: state remains withheld until “确认开启”. The dialog explains the usage summary fields, excluded content/credentials and configured destination. Cancel, Escape/backdrop close and default mount do not post consent. Confirmation uses the existing serialized write plus authoritative readback; withdrawal also uses the same review. No backend or permission protocol changes.

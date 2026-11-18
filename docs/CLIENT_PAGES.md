# HanaMesh client composition (Core shell B)

Core contributes one `main` key `hanamesh-home` and one sidebar panel with the
same id, label **HanaMesh**. It does not replace DSH root/sidebar/conversation.
The main entry declares a root/list child slot `hanamesh.tab`. Core registers only
its own `home` (首页, order 0) and `account` (账号, order 100) entries. Modules own
their contributions and disposal; the shell derives labels/order from the public
DSH slot ledger and renders the selected id with `renderSlot(..., {only:id})`.
Removing a selected module returns to home with a visible explanation.
Arrow keys, Home and End move the selected tab and its keyboard focus.

## Module contract

A module compiles this structural owner contract locally (also exported as a type
from `@hanamesh/core/client`), and registers via DSH's public slots API:

```ts
interface HanaMeshTabProps {
  readonly version: 1;
  readonly navigateTab: (id: string) => void;
  readonly openPlugins: () => void;
}
// After the hanamesh.tab declaration becomes available:
ctx.slots.inject('hanamesh.tab', () => ctx.slots.register({
  name: 'hanamesh.tab', id: 'usage', label: '使用记录', order: 50,
}, UsagePage));
```

Register id/label/order belongs to the module; Core has no module tab list.
Modules using DSH declaration merging declare `hanamesh.tab` as
`{kind:'list'; scope:'root'; owner:HanaMeshTabProps}` in their own client build.
The callbacks never install a package, change consent or create a Session.

Home declares `hanamesh.home.continue` (root/list) and the account tab declares
`hanamesh.account.models` (root/list), with the same owner contract. These regions
are contribution seats only: Core does not read AppHost inventory, enumerate
installed apps, implement model/CLI detection or provide a second installed list.
The empty home region directs the person to Plugins. Their consumer integration
and joint acceptance belong to the owning module's follow-up task.

## Market and host compatibility

Market belongs to the DSH Plugins page (`plugins.tab`), implemented by AppHost.
`openPlugins()` selects the public host panel `plugins`; the user then chooses the
HanaMesh tab. There is no extra AppHost navigation contract or private store write.
Core observes the public declaration snapshot/subscription for `plugins.tab`.
When unavailable it shows a message and keeps the HanaMesh tabs usable instead of
selecting a missing host page or restoring retired entries.

The public capability helper `corePluginCapabilities(owner)` tests actual function
presence for install/openPackage/update. rc.1 exposes install/openPackage;
rc.3/rc.4 are checked against their real owner during the compatibility gate.
An absent update is unavailable, never called as though it succeeded. This is a
structural probe, not a version string guess or a custom installation pipeline.
Core itself does not register a market tab or perform installs.

## Native technical configuration

| DSH slot/key | Core content |
| --- | --- |
| `plugins.bundle.config` / `@hanamesh/hanamesh` or `@hanamesh/core` | Website/server addresses, named runtime budgets, local suite source |
| `plugins.row.config` / `@hanamesh/hanamesh#hanamesh-core` or `@hanamesh/core#hanamesh-core` | Diagnostics, contribution events/cumulative facts, components/about and address troubleshooting |
| `plugins.detail.section` | Backlink only for Core or the HanaMesh suite that declares its Core row |

Both standalone and suite installation forms are supported. The configuration
entries honor DSH `view: summary/page`; the DSH page owns its chrome and package
management. Existing address save/reset, serialized writes, authoritative readback,
identity repair, bounded contribution history and exact manual repair command remain.
No configuration store is duplicated. `HanaMeshSection` is the shared composition
component; its optional page filter is used by the native wrappers and portable
business tests. It is not registered in the host settings or footer.

Account preserves binding/email website actions, identity and explicit consent
review. Cancel/Escape never write consent. Confirm uses serialized save and
readback. Local Usage counts remain independent of server contribution facts;
the existing local record view remains a DSH Modal. Assets are website actions.
There is no invented account logout or model credit state.

First consent is contributed to `shell.overlay`, retains the existing admitted
DSH Modal and persists its marker only after visible display. The points bind
reminder is now a homepage banner: it checks the host's `prompt.show`, and requires
intersection, foreground document and the public DSH modal stack to yield before
writing `points/prompt-shown`. Unseen/unmounted content cannot consume it; marker
failure is visible and not retried. The bind action selects Account.

## Original 19 seats

| # | Previous seat | B destination / owner |
| --- | --- | --- |
| 1,4 | Core sidebar/home | HanaMesh shell / home tab, Core |
| 2,7 | AppHost sidebar/market main | DSH market tab, AppHost |
| 3,9 | Usage sidebar/main | `hanamesh.tab`, Usage |
| 5 | Account/device main | Account tab, Core |
| 6 | Environment/source main | Native package/Core row config; other module settings stay with their owner |
| 8 | Model connection main | Account model contribution, AppHost |
| 10 | Core footer | Registration removed, account/native config replace actions |
| 11,12 | Market footer/overlay | Removed by AppHost task |
| 13 | First consent | Public `shell.overlay`, Core |
| 14 | Bind points modal | Homepage banner, Core |
| 15 | Core settings section | Account + package/Core row config |
| 16 | Usage settings | Usage row config, Usage |
| 17 | AppHost's five settings | AppHost row/package config, AppHost |
| 18 | Old extension market slot | Removed by AppHost task |
| 19 | Brand | Retained unchanged |

Core does not edit the DSH client, Brand, Theme, AppHost or Usage. Other modules'
old sidebar entries disappear in their own delivery; this Core change alone must
not be described as completing whole-suite integration. Version assignment belongs
to orchestration. Real rc.4/rc.3/rc.1 results and draft comparison screenshots are
recorded in CL5 delivery, separately from unit/source tests.

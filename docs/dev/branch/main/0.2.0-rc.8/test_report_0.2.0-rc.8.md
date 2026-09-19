# UI test report — `hanamesh-core` `0.2.0-rc.8`

- **Date**: 2026-09-19 15:04 JST
- **Version**: `0.2.0-rc.8`
- **Branch**: `main`
- **Code commit tested**: `4bb21b6045ef8636270d41e4e465d0abd3a84ef1` (`v0.2.0-rc.8`); later changes are evidence/docs only
- **Prior version**: N/A (first P1 core UI round)
- **Tester**: Codex + Computer Use
- **Base URL**: `http://127.0.0.1:53667/` (token omitted)

## Environment

| Item | Value / note |
| --- | --- |
| Start | DSH `0.1.5-alpha.1`, Node `24.13.1`, fresh isolated profile, `--no-open` |
| Server | Loopback registration/contribution STUB; suite siblings are STANDIN |
| Smoke | anonymous `401`; token `303`; authenticated root/state `200` |
| Browser | Current task's isolated Codex session browser only; no public/shared browser used |

## Summary

| Pass | Partial | Fail | Skip | Blocked | Resolved | Persists | Regressed | New |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 6 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 2 |

## Results

| ID | Case | Status | Notes |
| --- | --- | --- | --- |
| UI-1 | Load authenticated DSH shell | Pass | Main shell visible after normal first-run notices; no API key entered. |
| UI-2 | Native sidebar footer entry | Pass | `打开 HanaMesh 设置` visible without fixed/index injection. |
| UI-3 | Native Settings section | Pass | Footer opens Settings directly to the `HanaMesh` section. |
| UI-4 | Approved Chinese fields | Pass | Device, consent, account, My Hana, contribution, components and about rows visible. |
| UI-5 | Consent control | Pass | Checkbox visibly changed to enabled; final API state is `granted`, and restart retained it. |
| UI-6 | Health recheck | Pass | Button actionable; usage stand-in is explicitly rendered `已安装 0.2.0-rc.1，服务未就绪`. |
| UI-7 | Website action | Partial | Button click issued `GET /` to the configured foreign loopback origin, but the in-app browser did not expose the child tab in its tab inventory. |
| ENV-1 | Required Chrome run/screenshots | Blocked | The user required this concurrent session to use only its isolated session browser; no public/shared Chrome was opened and no Chrome artifact was fabricated. |

## Blocked

1. **UI-7** — O3/user-browser validation should confirm that the already-observed foreign-origin request is presented as a visible new tab.
2. **ENV-1** — Chrome-specific screenshots remain outside this session because of the explicit session-browser-only constraint.

## Recommendations

- Keep the final profile running for integrator inspection; use the current in-app-browser evidence as functional pre-validation, not as Chrome evidence.
- Do not promote to ACCEPTED until the user performs the checklist and explicitly signs.

---

## Findings Index

| ID | Summary | Severity | Route / page | Status | Verify-Env |
| --- | --- | --- | --- | --- | --- |
| UI-7 | Website action reaches the configured origin, but child-tab presentation is not exposed | P1 | Settings / HanaMesh | Partial | session-browser |
| ENV-1 | Session was restricted to isolated in-app browser, so Chrome screenshots are absent | P1 | DSH shell | Blocked | session-browser |

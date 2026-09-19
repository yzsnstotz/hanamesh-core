# UI test report — `hanamesh-core` `0.2.0-rc.8`

- **Date**: 2026-09-19 15:04 JST
- **Version**: `0.2.0-rc.8`
- **Branch**: `main`
- **Commit tested**: pre-commit working tree based on `1a54cd7`
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

| Pass | Fail | Skip | Blocked | Resolved | Persists | Regressed | New |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 6 | 0 | 0 | 2 | 0 | 0 | 0 | 2 |

## Results

| ID | Case | Status | Notes |
| --- | --- | --- | --- |
| UI-1 | Load authenticated DSH shell | Pass | Main shell visible after normal first-run notices; no API key entered. |
| UI-2 | Native sidebar footer entry | Pass | `打开 HanaMesh 设置` visible without fixed/index injection. |
| UI-3 | Native Settings section | Pass | Footer opens Settings directly to the `HanaMesh` section. |
| UI-4 | Approved Chinese fields | Pass | Device, consent, account, My Hana, contribution, components and about rows visible. |
| UI-5 | Consent control | Pass | Checkbox visibly changed to enabled; final API state is `granted`, and restart retained it. |
| UI-6 | Health recheck | Pass | Button actionable; usage stand-in is explicitly rendered `已安装 0.2.0-rc.1，服务未就绪`. |
| UI-7 | Website new tab | Blocked | Button click produced no observable new tab in the in-app browser; Chrome provider unavailable. |
| ENV-1 | Required Chrome run/screenshots | Blocked | Browser control returned `Browser is not available: chrome`; no Chrome screenshot artifact was fabricated. |

## Blocked

1. **UI-7** — Repeat the website button in Chrome and record the loopback stub URL in a new tab.
2. **ENV-1** — Capture C20/C21/C23 screenshots in an available Chrome session.

## Recommendations

- Keep the final profile running for user acceptance, and treat the current in-app-browser evidence as pre-validation only.
- Do not promote to ACCEPTED until the user performs the checklist and explicitly signs.

---

## Findings Index

| ID | Summary | Severity | Route / page | Status | Verify-Env |
| --- | --- | --- | --- | --- | --- |
| UI-7 | Website action lacks observable new-tab evidence in available browser | P1 | Settings / HanaMesh | Blocked | browser-mcp |
| ENV-1 | Required Chrome provider unavailable, so Chrome screenshots are absent | P1 | DSH shell | Blocked | browser-mcp |

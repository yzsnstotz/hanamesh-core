# Agent process API · 0.3.6

Each process consumes one JSON request `{config,input}` on stdin and emits one `{result}` or `{error:{code}}` line. Core uses its existing Ed25519 device/shared store, request transport and registration; it loads no DSH peers. It is a local process API, not an HTTP server.

`config`: absolute `sharedHome`, nullable exact `serverOrigin`/`websiteOrigin`, optional `timeoutMs` (default10000, 10–60000). All origins are HTTPS or loopback HTTP. No production origin default.

`input.operation`: `state`; `consent` plus `state:granted|withheld`; `sign` plus standard-base64 `bytes`; `signRequest` plus `method,path,body` (UTF8 string|null); `register`; `bindLink`; `withdraw`. State never creates an identity. Consent starts withheld, independent from DSH consent. Signing/registration/bind require granted. Registration omits hostname/os/shell labels. Device identity remains the existing shared `identity/device.json`. CLI replies never include private key material.

`withdraw` can run after opt-out and signs only the exact fixed DELETE for the current shared device. With no existing identity it returns zero without creating one. A transport failure or unreadable response is not deletion success. Callers must expose pending/unknown and may repeat the idempotent deletion.

This agent adapter does not prove hook trust, plugin attribution, backend acceptance, points or owner acceptance. Those belong to the corresponding adapters/contracts. Test evidence is local macOS arm64; Windows, Linux and Intel macOS real-host paths are NOT_RUN.

0.3.6 adds consent.consentId (UUID|null): new explicit withheld→granted creates a UUID, repeated granted keeps it, withheld retains it for deletion retries. withdraw signs only DELETE /v2/usage/me/devices/:deviceId/consents/:consentId. It accepts exactly a matching {deletedEvents,consentId,state:withdrawn,barrier:committed} receipt. Unknown/mismatched/pending barriers fail. A fresh device-less identity returns no-device; callers may accept that only when no prior upload markers exist. Agent consent is independent of DSH; its barrier deletes agent raw records and tombstones their generations, not DSH records.

An explicit first opt-out also allocates a UUID solely for the remote tombstone (never activates/collects). This lets a pre-existing DSH device withdraw agent data before ever opting in without getting stuck in pending. Read-only defaults remain consentId:null and create nothing.


Binding deadline handoff (0.3.19): both controller bind-link and portable agent bindLink return the same `{url,expiresAt}` shape and add `expiresAt=<the original Identity challenge response>` plus `expiryClock=identity-server` to `/me/bind`. The deadline must be canonical UTC millisecond ISO; invalid/missing data is CORE_UPSTREAM_RESPONSE_INVALID/502, with no local TTL or replacement challenge. Identity nonce signature and three-field bind submission remain unchanged.

These URL values are editable, unsigned display hints. They are not a fresh challenge-status check, serverNow or a grant to enable Confirm; they cannot extend Identity's stored deadline or single-use acceptance. The clock domain is Identity's authoritative server storage (currently PostgreSQL now), not Core/browser/chain time. No exact countdown or used/revoked status is supplied; Identity must define a trustworthy status/time contract before a website can claim that verification. OAuth must preserve the same original query, never silently refresh or submit it. The website sends only deviceId/nonce/signature to Identity, never these metadata fields.

# Channels UX and Reliability Hardening

**Date:** 2026-07-11
**Branch:** `codex/channels-ux-hardening` from `origin/main` (`89329f99`)
**Scope:** Telegram, Discord, Slack, WhatsApp settings, protected routes, inbound agent turns, pairing, workspace routing, approvals, persistence, responsive UI, clean install, and real local runtime.

## Gate status

The Channels implementation is code-complete and locally release-ready. All hermetic gates pass, the production UI was exercised against a real bearer-protected sidecar, and the real Baileys transport reached QR pairing without writing plaintext authentication state.

External release evidence is still required for real provider credentials and a real WhatsApp device scan. That evidence is intentionally not represented as complete below.

## Defects found and corrected

| Severity | Defect | Correction |
|---|---|---|
| P0 | Settings used raw `fetch`, so protected channel routes returned 401. | Added typed authenticated adapter methods and moved the UI entirely onto them. |
| P0 | Channel-to-agent loopback called protected `/api/chat` without a bearer token. | Threaded the sidecar session token through `ChannelManager` and `runChannelChatTurn`; added a real Fastify auth integration test. |
| P0 | `package-lock.json` did not describe the merged Channels dependency graph; clean install failed. | Regenerated the lock, aligned `tsx`/`esbuild`, added the Testing Library peer, and proved normal `npm ci --legacy-peer-deps`. |
| P0 | Baileys persisted WhatsApp account/session keys as plaintext JSON. | Replaced multi-file auth persistence with one encrypted Vault entry, added one-time legacy migration, removed plaintext only after the encrypted write succeeds, and wipes both stores on logout. Corrupt state now fails closed and is preserved for recovery. |
| P1 | Headless channel turns could wait five minutes for an SSE approval nobody was watching. | Channel turns now use `proposeHeld`; gated actions enter the durable approval queue and the channel receives the app-approval response immediately. |
| P1 | Config writes could partially save secrets before a later field failed validation. | Validate the entire request, secret key set, values, enabled flag, and workspace before any Vault write. |
| P1 | Config changes were not represented in the audit stream. | Added `channel_config_change`; audit payloads contain secret key names only, never values. |
| P1 | Duplicate provider deliveries could execute a turn twice; simultaneous messages in one chat could interleave. | Added bounded 24-hour message-ID deduplication and a per-chat promise queue. |
| P1 | `/workspace` required opaque IDs and `/status` exposed raw IDs. | Resolve names or IDs, persist the stable ID, and show `Name (id)` in status output. |
| P1 | Channel controls were unreadable in narrow windows because the nested Settings rail consumed most of the viewport. | Settings tabs become a horizontal scroller below 640 px; active tabs scroll into view; channel forms, selectors, and actions stack without page overflow. |
| P2 | A deep link to a disclosure-hidden tab stayed on General after the user enabled Standard. | Re-resolve `?tab=channels` when the disclosure tier changes. |
| P2 | Failed saves cleared or obscured useful state and several actions had weak busy/error feedback. | Preserve secret drafts on failure, expose alert/status semantics, and consistently disable busy or prerequisite-blocked actions with visible reasons. |
| P2 | Baileys' default logger printed verbose device-pairing payloads. | Pass a silent internal logger and retain only curated Waggle lifecycle/error messages. |

## Scenario coverage

| Scenario | Evidence | Result |
|---|---|---|
| Unauthenticated management request | Real Fastify security middleware | 401, no state change |
| Authenticated browser bootstrap | Production app + fresh sidecar | Session token fetched; all Channels GET/POST requests 200 with bearer header |
| Atomic invalid config | Route integration | Unknown secret or workspace rejected; earlier fields are not persisted |
| Secret save | Real browser + isolated Vault | Draft clears only after success; masked saved state appears; Start becomes available |
| Bad provider credential | Real Telegram start | Honest `Unauthorized` error, transport remains stoppable |
| Deny-by-default pairing | Manager/pairing tests | Unknown senders receive silence; only valid one-use code pairs |
| Pair expiry/case/reuse | Pairing tests | Ten-minute TTL, case-insensitive entry, single use |
| Workspace name/id routing | Manager tests | Human name resolves to stable ID; per-chat override remains scoped |
| Duplicate inbound delivery | Manager tests | Same provider message ID executes once |
| Concurrent same-chat turns | Manager tests | Replies remain in arrival order |
| Injection rejection | Loopback client test | Scanner 400 becomes a safe user-facing channel error |
| Held tool approval | Chat route + client/manager tests | Durable approval notification; no unwatched five-minute wait |
| Platform send limits/reconnects | Telegram/Discord/Slack/WhatsApp adapter tests | Chunking, recovery, stop, and error states pass |
| WhatsApp encrypted persistence | Auth-state tests | Credentials and signal keys round-trip through Vault; no plaintext files |
| Existing WhatsApp pairing migration | Auth-state test | Multi-file state imported, encrypted, then legacy directory removed |
| Real Baileys startup | Fresh sidecar on port 34292 | Outbound connection succeeds, QR appears, no plaintext auth dir, verbose upstream logs suppressed |
| Desktop UI | Playwright at 1280x720 | No overlap; full workflow remains scannable |
| Narrow-window UI | Playwright at 390x844 | No document overflow; active tab visible; fields/actions stack and remain usable |
| Deep-link disclosure recovery | Real browser | Essential falls back to General; switching to Standard opens requested Channels tab |

## Verification evidence

- `npm ci --legacy-peer-deps`: pass, 1,769 packages installed.
- Backend Channels lane: 9 files, **89/89 tests pass**.
- Web Channels/deep-link lane: 2 files, **12/12 tests pass**.
- `npx tsc --noEmit --project packages/server/tsconfig.json`: pass.
- `npm run build:packages`: pass.
- `npm run build`: pass.
- `git diff --check`: pass.
- Fresh sidecar boot with a new data directory: pass.
- Real browser authenticated Vault save/start/error/stop flow: pass.
- Real Baileys unpaired QR flow: pass.

## Remaining release evidence

These are not code failures, but they must be completed before calling Channels production-proven:

1. Telegram bot: real token, pair from owner account, inbound answer, workspace switch, duplicate-delivery observation, revoke.
2. Discord bot: real app/guild install, Message Content intent, DM and channel message, reconnect, revoke.
3. Slack app: real Socket Mode app/bot tokens, DM and channel message, reconnect, revoke.
4. WhatsApp: scan with a secondary number, restart persistence, inbound/outbound message, unlink/logout wipe, re-pair.
5. Trigger one genuinely gated tool from a real channel and approve it in the desktop Approvals surface.

The founder-approved WhatsApp Terms-of-Service and ban risk remains visible and is not treated as solved by the credential hardening.

## Integration notes outside this branch

- `origin/main` still emits the known Tailwind arbitrary-duration warnings, the shape-selection chunk warning, and a >500 kB bundle warning. The broader UX branch already contains related build-polish work; do not duplicate it here.
- The served page reports a CSP rejection for the inline theme bootstrap script. It did not block Channels, but it remains global browser-console debt and should be resolved in the broader UX integration branch.

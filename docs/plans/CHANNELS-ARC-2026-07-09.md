# IM Channels Arc — Slack · Telegram · WhatsApp · Discord

**Date:** 2026-07-09 · **Status:** ✅ P1–P4 EXECUTED (4 commits on `worktree-channels-arc`) · **Branch:** `worktree-channels-arc`

> Executed 2026-07-09: P1 core+Telegram (48 tests) → P2 Discord+Slack raw ws (18 tests) →
> P3 WhatsApp/Baileys (11 tests) → P4 Settings UI (tier-filter Standard).
> Gates at completion: server tsc 0, server suite 2183 ✓, apps/web 1575 ✓, web build ✓.
> Bonus fix: `.gitignore` `s*.png` was swallowing sales-rep/support-agent avatars → main's web build was broken on clean checkout; fixed with scoped negation + committed binaries.
> Residual (not blocking): live end-to-end verification with real bot tokens; WhatsApp real-device pairing; approval-over-IM (explicitly out of v1).
**Origin:** CowAgent teardown (`docs/analysis/cowagent-vs-waggle-2026-07-09.md`) steal #4 — IM reach as distribution surface.

## Founder decisions (locked — do not re-raise)

| Decision | Choice |
|---|---|
| Platforms | Slack, Telegram, WhatsApp, Discord |
| WhatsApp transport | **Baileys (unofficial)** — founder accepts ToS/ban risk; UI must show prominent ban-risk disclosure + "use a secondary number" advisory |
| Workspace routing | Default workspace per channel + per-chat override (`/workspace` bot command + Settings UI) |
| Inbound auth | **Pairing code, deny-by-default** — unknown senders ignored; owner generates short-lived code in Settings, sends it to the bot once, sender ID allowlisted |
| Tier gating | **All free** (channels generate memory → moat; team-shared channel governance may become TEAMS later) |
| Tool approvals over IM | **Not in v1** — gated tools reply "needs approval in the Waggle app" + app notification; no approval-over-IM |

## Architecture

Channel-adapter layer **inside the sidecar**: `packages/server/src/local/channels/`.
All four transports are NAT-friendly (desktop-behind-NAT is the binding constraint CowAgent doesn't have):

| Platform | Transport | Dependency |
|---|---|---|
| Telegram | long-poll `getUpdates` (raw fetch, fixed host) | none |
| Discord | gateway WebSocket | `ws` (explicit dep) |
| Slack | **Socket Mode** (apps.connections.open → wss) | `ws` (raw, no bolt) |
| WhatsApp | Baileys multi-device WS | `@whiskeysockets/baileys` |

### Components

- **`types.ts`** — `ChannelMessage` (platform, chatId, senderId, senderName, text, messageId), `ChannelAdapter` interface (`start/stop/getStatus/send`), `ChannelPlatform` union, config types.
- **`chat-client.ts`** — loopback SSE client: POST `/api/chat` on 127.0.0.1, collect `done`/`error`/`approval_required` events → `{content, approvalRequired}`. Reuses the full chat path (injection scan, persona, governance, memory persistence) with **zero refactor of the 2k-line chat.ts**. Session id = `channel-<platform>-<chatId>` so each IM chat gets its own persisted history.
- **`pairing.ts`** — `PairingStore`: 8-char single-use codes, 10-min TTL, per-platform sender allowlist + per-chat workspace overrides persisted to `<dataDir>/channels/channels.json` (non-secret). Bot tokens/secrets go to **vault** only.
- **`manager.ts`** — `ChannelManager`: create/start/stop adapters from config, restart on config change, status registry, per-sender rate limit (10 msg/min token bucket), inbound pipeline (pair check → command handling → chat turn → chunked reply).
- **`<platform>-adapter.ts`** — one file per platform, transport only.
- **`routes.ts`** — `/api/channels` (list+status), `/api/channels/:platform/config` (GET masked / POST), `/api/channels/:platform/{start,stop,test}`, `/api/channels/pairing-code` (POST generates), `/api/channels/pairing` (list/revoke). Sensitive routes behind `isLocalRequest`.

### Bot commands (all platforms, text-level)

`/pair <code>` · `/workspace [name]` (show/set per-chat override) · `/status` · plain text → chat turn.

### Security invariants

1. Deny-by-default: unpaired senders get **silence** (no bot-presence oracle), except `/pair`.
2. All inbound text flows through `/api/chat`'s existing `scanForInjection` (user_input context).
3. Secrets vault-only; `channels.json` holds no tokens.
4. Fixed API hosts (Telegram/Slack/Discord) — no SSRF surface; Baileys pinned lib.
5. Outbound replies chunked to platform limits (TG 4096 / Discord 2000 / Slack 40k / WA 65k).
6. Audit events on pair/unpair/config-change.
7. Existing one-way `telegram.ts` digest push stays; adapter supersedes its send path later (not in P1 scope to remove).

## Phases

- **P1** — core (`types`, `chat-client`, `pairing`, `manager`, `routes`) + **Telegram** adapter end-to-end + unit tests (pairing, manager pipeline, telegram with mocked fetch, routes). Gate: server tsc 0, vitest green.
- **P2** — Discord (gateway) + Slack (Socket Mode) adapters + tests.
- **P3** — WhatsApp via Baileys (QR pairing surfaced through `/api/channels/whatsapp/qr`, ban-risk copy) + tests.
- **P4** — Settings UI (`apps/web` Channels section: connect forms, status, pairing-code generation, QR display), docs.

Commit per phase. Verification per phase: `npx tsc --noEmit -p packages/server/tsconfig.json` + `npm run test -- --run` (server tests) + new tests green.

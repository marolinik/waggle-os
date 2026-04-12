# Waggle OS — M2 Sprint Session 3 Kickoff (Stripe)

## How This Works

I (Marko) upload this + the two context docs to a new Claude.ai chat. Claude reads the repo via MCP tools, produces Claude Code prompts, I execute them. Claude.ai = strategist + prompt author. Claude Code = executor.

## Repo
`D:\Projects\waggle-os` — Tauri 2.0 + React/TypeScript monorepo (15 packages).
Build chain: `packages/shared → core → agent → server → apps/web` — 0 errors.

## M2 Completed (Sessions 1-2)

| # | Item | Status |
|---|------|--------|
| M2-1 | Real embedding provider | ✅ InProcess→Ollama→API→Mock fallback chain |
| M2-3 | Tauri desktop builds | ✅ Bundled Node.js + native modules |
| M2-4 | Landing page + pricing | ✅ apps/www/, GitHub Pages |
| M2-5 | Onboarding polish | ✅ Wizard→chat routing, starter memory, static welcome, template tooltips |
| M2-7 | Basic telemetry | ✅ SQLite TelemetryStore, 14 events, 6 API endpoints, opt-in OFF |
| M2-6 | Keyboard power user | ✅ GlobalSearch rewrite: fuzzy memory search, categorized results |

## M2-2: Stripe Subscription — THE LAST ITEM

This is the only remaining M2 item. It's the most complex because it requires a cloud component.

### The Desktop App Problem

Stripe webhooks require a public URL — `localhost:3333` can't receive them. Desktop users have no server on the internet. This means we need a minimal cloud service for billing.

### Architecture Decision Needed

**Option A: Cloudflare Worker** — ~50 lines, free tier, global edge. Receives webhooks, stores subscription status in KV, exposes `/api/license/validate` endpoint. Desktop app calls this on startup.

**Option B: Render server** — `render.yaml` already exists for team server. Add Stripe routes there. More infra but centralized.

**Option C: Supabase Edge Function** — Similar to Cloudflare but with built-in Postgres for subscription data.

### Desktop Flow (Regardless of Backend Choice)

```
User clicks "Upgrade to Teams" in Settings
→ Opens browser: Stripe Checkout (hosted page, email pre-filled)
→ User pays on Stripe
→ Stripe webhook → Cloud backend → stores subscription
→ Desktop app calls /api/license/validate?email=...
→ Tier activates, locked features unlock (feature-gates already exist from M1 S8)
```

### What Already Exists

- **Tier gating (M1 Session 8):** `feature-gates.ts` + `LockedFeature` component. Features are already locked/hidden per tier (Simple/Professional/Power maps to Solo/Teams/Business).
- **Pricing tiers (M2-4):** Solo free / Teams $29/mo per seat / Business $79/mo per seat. Landing page shows these.
- **Vault:** Encrypted credential storage. License key can be stored here.
- **Settings UI:** Already has sections for API keys, connectors, telemetry. Add "Subscription" section.

### Key Files to Read

```
apps/web/src/lib/feature-gates.ts              — Tier gating logic
apps/web/src/components/os/apps/SettingsApp.tsx — Settings UI
apps/web/src/components/LockedFeature.tsx       — Lock overlay component (if exists)
packages/core/src/config.ts                     — WaggleConfig (add license/tier fields)
packages/server/src/local/index.ts              — Server init
apps/www/src/components/Pricing.tsx             — Landing page pricing section (CTA links)
render.yaml                                     — Existing Render blueprint
```

### Deliverables for M2-2

1. **Cloud backend** (Cloudflare Worker or Render route) — Stripe Checkout session creation, webhook handler, subscription status store, license validation endpoint
2. **Desktop integration** — License validation on startup, tier activation, feature unlock
3. **Settings UI** — "Subscription" section showing current tier, upgrade/manage buttons
4. **Landing page update** — Pricing CTAs link to actual Stripe Checkout URLs
5. **Stripe Customer Portal** — Self-service plan changes, cancellation, invoice history

### Stripe Keys Needed (I'll Provide)

- `STRIPE_SECRET_KEY` — for server-side API calls
- `STRIPE_PUBLISHABLE_KEY` — for client-side (Checkout redirect)
- `STRIPE_WEBHOOK_SECRET` — for webhook signature verification
- Price IDs for Teams ($29/mo) and Business ($79/mo)

## Prompt Format

Same as all previous sessions: read repo files first, produce a single Claude Code prompt with exact file references, step-by-step plan, constraints, verification checklist.

Language: English for prompts/code, Serbian for communication.
Tone: Professional CxO consultant.

## Decision for Claude

Start the session by asking me:
1. Which cloud backend (Cloudflare Worker vs Render vs other)?
2. Do I have Stripe API keys ready, or should prompt use placeholder values?

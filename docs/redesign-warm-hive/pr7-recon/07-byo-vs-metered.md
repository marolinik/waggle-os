# PR7 Recon — DESIGN_POV #4: BYO-key vs Waggle-metered (the inference-cost decision)

> RECON ONLY. No product code changed. Every claim below is grounded with `file:line`.
> Topic: make the founder's BYO-vs-metered choice **concrete with build cost**, grounded in
> what already shipped through PR1–PR6. PR7 = screen 13 Auth (Clerk) + screen 14 Billing (Stripe)
> per `docs/redesign-warm-hive/BUILD-PLAN.md §6` (line 145).

---

## 0. TL;DR (the de-facto commitment)

**The codebase has already committed to Option A: BYO-key + flat SUBSCRIPTION tiers, with no inference metering.** This isn't a design intention — it is *shipped, wired, and tested* across three surfaces:

1. **BYO-key is the only inference-payment path that exists.** Onboarding's hard model gate and Settings → Models both mount the same `ModelGate` whose entire copy is *"Bring your own key — it's stored encrypted in your Vault and never leaves your machine."* (`apps/web/src/components/os/model-gate/ModelGate.tsx:186`). Waggle never holds an inference key or pays a provider on the user's behalf in any shipped path.
2. **Stripe billing is flat `mode: 'subscription'`** — both the desktop sidecar (`packages/server/src/stripe/checkout.ts:40`) and the `apps/www` cloud port (`apps/www/app/api/stripe/checkout/route.ts:170`). Two products (Pro $19, Teams $49/seat), monthly/annual, period-end renewal. **No `mode: 'payment'`, no usage records, no metered prices.**
3. **There is zero inference-metering plumbing.** No `createUsageRecord`, no `billing_meter`, no `reportUsage`, no credits/balance ledger anywhere in `packages/server/src` (verified by grep — only hit is a *comment* about not burning Anthropic credits in `packages/server/src/local/index.ts:1980`). The only "usage" surface is an **estimate-based read-only cost dashboard** (`/api/cost/summary`) with a **soft, advisory** daily-budget warning — never a hard cap, never tied to billing.

**Recommendation: ratify Option A.** PR7 Billing becomes a *theming* task over an already-working subscription flow (near-zero new backend). Option B (Waggle-metered) is a multi-month strategic pivot touching billing, onboarding, the inference path, quota enforcement, and a new credits surface — and it contradicts the local-first / "your key never leaves your machine" promise the product already makes to users in onboarding copy. The recon's job is to make this choice concrete; the decision is the founder's.

---

## 1. Evidence — what PR5 actually shipped for BYO-key (D1)

**`ModelGate.tsx` is the single shared "get a working model" component** — mounted in onboarding step 3 AND Settings → Models (`apps/web/src/components/os/model-gate/ModelGate.tsx:8–20` header doc).

- BYO-key cloud path: pick provider → paste key → **live-validate** (`adapter.testApiKey(..., { live: true })`, line 94) → write to Vault (`adapter.setProviderKey`, line 99).
- Explicit BYO framing in the UI: *"Bring your own key — it's stored encrypted in your Vault and never leaves your machine."* (line 186).
- Honesty contract already enforced: "verified" only after a live probe; a format-only pass says "looks valid (not live-verified)" (lines 18–20, 247–253).
- Local path (Ollama) is the other route to a working model — also zero cost to Waggle (lines 266–304).

**Onboarding hard gate (D2):** `ModelGateStep.tsx` disables "Continue" until `useHasWorkingModel` is true (`apps/web/src/components/os/overlays/onboarding/ModelGateStep.tsx:49`), with copy *"Bring your own provider key … Nothing leaves your machine without your key."* (lines 26–28) and one soft escape ("I'll do this later" → Home `NoModelBanner`, lines 9–17).

**Interpretation:** the user pays the provider directly. Waggle's margins are clean; it never carries inference cost. This is textbook **Option A (BYO-key)** from DESIGN_POV §4 (`docs/design_handoff_waggle_app/DESIGN_POV.md:62–70`).

---

## 2. Evidence — Stripe tiers are flat SUBSCRIPTION, not metered

**`packages/shared/src/tiers.ts`** — canonical 5-tier system (TRIAL/FREE/PRO/TEAMS/ENTERPRISE), pricing in the header doc (lines 7–18): flat per-seat/per-month dollar amounts. `stripePriceId` is a single price per tier (lines 122, 143) — a **fixed recurring price**, not a metered/usage price.

**Desktop sidecar Stripe (`packages/server/src/stripe/`):**
- `checkout.ts:40` — `mode: 'subscription'`, `line_items: [{ price: priceId, quantity: 1 }]`. Quantity 1, fixed price. (Only PRO/TEAMS, line 25.)
- `webhook.ts:114–158` — handles exactly **3** subscription lifecycle events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. **No `invoice.created` / usage-record handling.** On cancel → tier drops to FREE (line 150).
- `index.ts:71–100` — `tierFromPriceId` / `priceIdForTier` map fixed monthly/annual price IDs to tiers. Pure subscription mapping.
- `portal.ts:41` — `stripe.billingPortal.sessions.create` — defers payment-method / invoice / cancel management to **Stripe's hosted Customer Portal** (this is where invoices and payment methods legitimately come from, never invented locally).

**`apps/www` cloud port (already built — see §4):**
- `app/api/stripe/checkout/route.ts:170` — `mode: 'subscription'`, fixed `priceId` resolved by env or `lookup_key` `${tier}_${billing}` (lines 109–119).
- `app/api/webhooks/stripe/route.ts:196–205` — same 3 subscription events, mirrored to Clerk `publicMetadata`. No metering.

**Conclusion:** there is no metered/usage-based Stripe billing anywhere. The model is "pay a flat monthly fee for *capabilities* (workspaces, connectors, governance), not for *inference*." Inference is on the user's own key/quota.

---

## 3. Evidence — the current Usage/cost surface (what's shown today)

**There is NO `UsageApp.tsx`.** The de-facto Usage screen is `TelemetryApp.tsx` — titled **"Usage & cost"** in the UI (`apps/web/src/components/os/apps/TelemetryApp.tsx:159`). PR6b's "Usage/budget" screenshot (`docs/redesign-warm-hive/smoke-pr6b-20260618/04-usage-budget.png`) is this surface.

What it shows (all **read-only, estimate-based** — never a balance to draw down):
- Total tokens, **estimated** cost, by-model spend, by-workspace (TEAMS-gated) — from `GET /api/cost/summary` and `/api/cost/by-workspace` (`TelemetryApp.tsx:55–100`).
- A **daily budget** the user can set, which produces a **soft warning at 80% / "exceeded"** status (`TelemetryApp.tsx:151`, `192–195`) — purely advisory.

The backing route confirms the "estimate, not meter, not enforce" nature:
- `packages/server/src/local/routes/cost.ts:8–9` — *"Data source: in-memory CostTracker … All cost values are **estimates** based on published model pricing."*
- Returns `estimatedCost` everywhere (lines 175, 181, 188).
- The daily-budget "exceeded" status (lines 162–169) sets a **string status only** — nothing in the codebase blocks a request when exceeded. It's a dashboard, not a quota gate.
- Free for all tiers per a product decision (line 263, "P22 … usage/telemetry info is free for all tiers").

**Interpretation:** today's Usage tells the user *"here's roughly what your own provider key is costing you"* — a BYO-key courtesy readout. It is structurally NOT a metered-balance/credits surface.

---

## 4. Evidence — Auth (Clerk) status: NOT in the desktop app; FULLY built in `apps/www`

**Desktop `apps/web` has no Clerk and no real logged-in identity.** Grep for `Clerk|@clerk|SignIn|auth0` across `apps/web/src` → **no files**. "Identity" today = a `tier` field in `config.json`, read fail-closed-to-FREE by `readTierFromDataDir` (`packages/server/src/middleware/assert-tier.ts:21–32`). There is a *data-model placeholder*: `User.clerkId: string` exists in `packages/shared/src/types.ts:6`, but nothing populates it from a real Clerk session in the desktop path.

**`apps/www` (Next.js cloud/landing) already has a complete, themed Clerk + Stripe SaaS surface** — this is the direct reference (and possibly the literal home) for PR7's screens 13/14:
- `apps/www/app/sign-in/[[...sign-in]]/page.tsx` — `<SignIn />` Clerk component, themed via `<ClerkProvider>` (header doc line 15).
- `apps/www/app/sign-up/[[...sign-up]]/page.tsx` — sign-up (verified to exist via glob).
- `apps/www/middleware.ts:6,16` — `clerkMiddleware()` wired, matcher includes API routes.
- `apps/www/app/account/page.tsx` — account surface.
- `apps/www/app/api/stripe/checkout/route.ts` — lazy-create Stripe Customer → store id in Clerk `publicMetadata` (lines 81–100); subscription checkout (line 170).
- `apps/www/app/api/webhooks/stripe/route.ts` — mirrors subscription state Stripe → Clerk metadata (3 events).
- `apps/www/app/_components/Pricing.tsx` — pricing cards.

**Net for PR7 Auth (screen 13):** in `apps/www`, Auth is REAL and only needs **theming to the warm-Hive tokens**. In the desktop `apps/web`, Auth is **MUST-BUILD if** the desktop must show a real logged-in identity (otherwise the design's own line "An account is optional — Waggle runs fully local without one" — `SCREENS.md:274` — means desktop can stay identity-light and route account/billing to the cloud `apps/www`). **This is itself a sub-decision the founder should confirm: does screen 13 live in `apps/www` only, or also in the desktop shell?**

---

## 5. The screen-14 fabrication risks (honesty contract carried from PR3–PR6)

`SCREENS.md:282–295` (screen 14 Billing) calls for four states. Three of them name fields that **must come from Stripe, never be invented**:

| Field in the design | Risk | Required gating |
|---|---|---|
| **Invoices (Paid + PDF)** (`SCREENS.md:292`) | Fabricating an invoice list / fake PDFs | Source ONLY from Stripe Customer Portal (`portal.ts` already does this) — do NOT render a local invoice list. If portal isn't reachable, show "Manage in Stripe" link, not a stub table. |
| **Payment method "VISA ···4242"** (`SCREENS.md:291`) | Hardcoding a fake card (the `4242` test card is literally in the spec text) | Never render a card brand/last4 the app doesn't have from Stripe. The portal owns this. The `4242…` in the design is a *mockup placeholder* — it must not ship as real-looking data. |
| **"Next charge" / billing cycle** (`SCREENS.md:291–292`) | Inventing a renewal date | Only from Stripe subscription data via the portal. |
| **Checkout card form (email/card/expiry/CVC)** (`SCREENS.md:287–289`) | Building a *fake* in-app card form that collects nothing real | Use **Stripe Checkout** (hosted) — the design itself says "Use Stripe Checkout/Customer Portal where possible" (`SCREENS.md:294`). The in-app form mock is illustrative; real PCI capture is Stripe's. |
| **Logged-in identity / avatar+name** (screen 13) | Showing a name/email for a session that isn't real | Bind to the real Clerk session (`apps/www`) or render the honest "no account / local-first" state (`SCREENS.md:274`). The desktop's `userName={null}` → "Account"/"W" pattern is the honest fallback (BUILD-PLAN §9 deferred note, line 191). |

**Plus a Usage-screen trap** if Option B is ever pursued: a credits/balance number, a "you've used X of Y tokens" quota bar, or a "$N remaining" figure would all be **fabricated** today (no ledger exists). The current estimate-only dashboard (§3) is the honest ceiling — do not dress it up as a metered balance.

---

## 6. The decision, made concrete

### Option A — Ratify BYO-key + flat subscription (RECOMMENDED, de-facto current state)

PR7 Billing themes the **existing** Stripe subscription flow; near-zero new backend. Exactly what's needed:

- **Auth (screen 13):**
  - **Cloud (`apps/www`):** theme the existing `<SignIn/>`/`<SignUp/>` Clerk components + the brand split-panel to warm-Hive tokens. Add the local-first trust copy ("an account is optional"). ~UI-only.
  - **Desktop (`apps/web`):** confirm whether it needs a real auth surface at all (§4 sub-decision). If "local-first, no account" stands, desktop screen 13 is a *deep-link to the cloud account page* + the honest no-account state — minimal build. If a real desktop session is wanted, that's the one genuine new piece (embed Clerk in the SPA / token bridge) — flag as a scoped add-on, not core to Option A.
- **Billing (screen 14):**
  - **Plans state:** theme to tokens; data already exists (tiers.ts, `useBilling.startCheckout`). Add monthly/annual toggle UI (the −20% annual already exists as price IDs — `index.ts:91–100`).
  - **Checkout state:** redirect to **Stripe Checkout** (already wired both surfaces). The "in-app card form" from the design ships as a themed *intro/summary*, then hands off to Stripe — no PCI surface built.
  - **Success state:** `useBilling` already syncs `?session_id=` post-checkout (`useBilling.ts:103–115`). Theme the success ring/receipt; receipt link → Stripe.
  - **Manage state:** `billing.openPortal()` already exists (`useBilling.ts:84`, `SettingsApp.tsx:625`) → Stripe Customer Portal owns invoices/payment-method/cancel. Theme the entry; do NOT build a local invoice/card UI (§5).
  - **Usage:** leave the estimate-only "Usage & cost" dashboard as-is; optionally reskin to warm-Hive in the long tail. No metering.
- **Net new backend for Option A: essentially none.** Possibly: thread `STRIPE_PRICE_*_ANNUAL` into the desktop checkout UI's monthly/annual toggle (the resolver already supports it — `index.ts:91`), and (if desktop auth is wanted) a Clerk-session bridge. Otherwise pure theming + wiring existing routes to the new screens.

### Option B — Pivot to Waggle-metered (MAJOR ARC, strategic reversal)

Enumerated NEW plumbing (none of this exists today):

1. **Inference-cost metering per request** — a real, persisted, authoritative usage ledger (today's CostTracker is **in-memory + estimate-only**, `cost.ts:8`; it would need to become durable, exact, and per-user/account).
2. **Waggle holds the provider keys** — a managed model pool where Waggle's own key pays the provider. This **directly contradicts** shipped onboarding/Settings copy ("your key never leaves your machine") and the local-first promise — a product-positioning reversal, not just code. (`managedModelPool` capability exists as a *flag* in tiers.ts:97/130 but has no inference-path implementation behind it.)
3. **Usage caps / quota enforcement** — convert the *advisory* budget (`cost.ts:162–169`, soft warning only) into a **hard gate** that blocks chat requests at the inference path when a balance/quota is exhausted. New enforcement point in the agent loop.
4. **Stripe metered/usage-based billing** — `mode: 'payment'` top-ups or metered subscription items + `createUsageRecord`/billing-meter reporting. New webhook events (`invoice.created`, usage aggregation). None of the current 3-event handlers (`webhook.ts`) cover this.
5. **A credits/balance surface** — a new "$N remaining / buy more credits" screen + the ledger behind it. (None exists; building it without the ledger would be fabrication — §5.)
6. **Usage screen rework** — from "here's your own-key estimate" to "here's your metered balance, draw-down, and top-up" — a full rebuild of `TelemetryApp`.
7. **Margin/abuse controls** — rate limits, anti-abuse, cost-of-goods accounting that the BYO model never needed because Waggle carried no inference cost.

This is a multi-month arc that reshapes Billing, Onboarding (the model gate would invert — from "add your key" to "you're metered"), Usage, and the core inference path, and it takes on inference COGS + abuse risk that the current architecture deliberately avoids.

### Recommendation

**Ratify Option A.** Rationale: (1) the codebase has *already committed* to it end-to-end (BYO-key gate + flat subscription + no metering), so A is "finish what's shipped," (2) it keeps the local-first / "your key never leaves your machine" promise the product *already makes to users in onboarding*, (3) it keeps margins clean (no inference COGS), and (4) PR7 collapses to theming + wiring existing routes. Option B is a deliberate strategic pivot with real COGS, abuse surface, and a contradiction of live product copy — worth a separate, founder-led decision, **not** something PR7 should absorb. DESIGN_POV §4 said "the current design supports either but commits to neither" (`DESIGN_POV.md:70`); the *implementation* has since committed to A. PR7 should make that commitment explicit and themed.

---

## 7. Open sub-decisions for the founder (surfaced, not decided)

1. **Does screen 13 (Auth) live in `apps/www` only, or also in the desktop `apps/web`?** Desktop has no Clerk today; the design says accounts are optional. If desktop stays identity-light, PR7 desktop-Auth is a deep-link + honest no-account state (cheap). If a real desktop session is wanted, add a scoped Clerk-bridge task.
2. **Monthly/annual toggle on the desktop Billing tab** — the annual price resolver already exists (`index.ts:91`); the desktop UI currently only calls `startCheckout('PRO'|'TEAMS')` with default monthly (`SettingsApp.tsx:584`). Adding the toggle is small but is genuinely new desktop UI.
3. **Where does screen 14 Billing render?** The richest, already-real flow is in `apps/www` (Clerk-linked). The desktop SettingsApp Billing tab is a thinner subscription surface. PR7 could (a) theme both, or (b) make desktop Billing a deep-link to the cloud account page. Confirm.

---

## Appendix — files read for this recon (all `file:line` claims above traceable to these)

- `docs/design_handoff_waggle_app/DESIGN_POV.md` (§4, lines 62–70)
- `docs/redesign-warm-hive/BUILD-PLAN.md` (§6 PR7 row line 145; §7 #5 line 165; §9 deferred note line 191)
- `docs/design_handoff_waggle_app/SCREENS.md` (screen 13 lines 269–278; screen 14 lines 282–295)
- `packages/shared/src/tiers.ts` (5 tiers, single stripePriceId per tier)
- `packages/shared/src/types.ts:6` (`User.clerkId` placeholder)
- `packages/server/src/stripe/{index,checkout,webhook,portal}.ts` (subscription-only)
- `packages/server/src/middleware/assert-tier.ts` (config.json tier, no real identity)
- `packages/server/src/local/routes/cost.ts` (estimate-only, advisory budget)
- `apps/web/src/components/os/model-gate/ModelGate.tsx` (BYO-key, shipped)
- `apps/web/src/components/os/overlays/onboarding/ModelGateStep.tsx` (hard gate)
- `apps/web/src/components/os/apps/TelemetryApp.tsx` ("Usage & cost" surface)
- `apps/web/src/hooks/useBilling.ts` (checkout/portal/sync, subscription)
- `apps/web/src/components/os/apps/SettingsApp.tsx` (Billing tab, upgrade/portal)
- `apps/www/{middleware.ts, app/sign-in/.../page.tsx, app/api/stripe/checkout/route.ts, app/api/webhooks/stripe/route.ts}` (Clerk + Stripe subscription, already built — PR7 reference)

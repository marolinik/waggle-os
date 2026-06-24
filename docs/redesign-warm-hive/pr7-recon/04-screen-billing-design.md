# PR7 Recon — Screen 14: Billing (Stripe) DESIGN spec

> RECON ONLY. No product code touched. Topic owner: the Billing screen DESIGN spec
> (`billing.html`) + SCREENS.md §14, cross-checked against the REAL Stripe wiring in the
> monorepo so PR7 knows what is wired vs what must be gated/faked.
>
> Sources read in full:
> - `docs/design_handoff_waggle_app/design-files/screens/billing.html` (247 lines)
> - `docs/design_handoff_waggle_app/SCREENS.md` §14 (lines 282–295)
> - `docs/redesign-warm-hive/BUILD-PLAN.md` (§6 roadmap, §7.5 BYO-vs-metered flag)
> - Backend Stripe: `packages/server/src/stripe/{index,checkout,portal,webhook,sync}.ts`
> - Tier system: `packages/shared/src/tiers.ts`
> - Current billing UI: `apps/web/src/hooks/useBilling.ts`,
>   `apps/web/src/components/os/overlays/UpgradeModal.tsx`,
>   `apps/web/src/components/os/apps/SettingsApp.tsx` (Billing tab, ~L516–650)
> - Tier route: `packages/server/src/local/routes/settings.ts` (`GET /api/tier`, L321–341)
> - Identity name: `packages/server/src/local/routes/home.ts` (L258–271, IdentityLayer)
> - Landing pricing: `apps/www/app/_components/Pricing.tsx`

---

## 0. TL;DR for the PR7 builder

The design is a **4-state segmented Stripe billing flow**: Plans, Checkout, Success, Manage
(`billing.html:117–122`). The monorepo already has a **fully wired, real Stripe backend** for
*Plans → checkout-redirect → sync → tier* and a **hosted Customer Portal** for *Manage*. But the
design's Checkout, Success, and Manage states render a **custom card form, a fabricated receipt,
a fabricated payment method, and a fabricated 3-line invoice list** — **none of which have a data
source in this codebase, and none of which we should hand-build** (PCI + fabrication risk).

**The governing instruction is already in the design itself** (`SCREENS.md:294`):
> "Use Stripe Checkout/Customer Portal where possible; theme to tokens."

So PR7's faithful-but-honest interpretation: **build the Plans state for real** (it maps 1:1 to the
existing checkout route), and **treat Checkout/Success/Manage's in-app chrome as Stripe-hosted
redirects**, not as locally-rendered card forms / invoice tables. The custom card form in the HTML
is a **mockup of what Stripe Checkout shows** — we must not reimplement it.

**Blocking dependency (already flagged):** BUILD-PLAN §7 open-decision #5 — DESIGN_POV §4
"who pays for inference (BYO-key vs Waggle-metered)" — must be decided before PR7. The Plans copy
("you only pay for scale — no feature-count games") leans metered/scale framing; the product today
is BYO-key (Settings model keys). This is a **copy + product-positioning fork**, not just a screen.

---

## 1. State 1 — PLANS (`billing.html:127–159`) — **REAL, ship it**

### Verbatim copy
- Segmented control labels: `Plans` / `Checkout` / `Success` / `Manage` (`:118–121`); top eyebrow
  `Billing · Stripe · state` (`:116`).
- Header H1: **"Upgrade your _hive._"** (`:130`).
- Subhead: **"Memory is free forever. You only pay for scale — no feature-count games."** (`:131`).
- Cycle toggle: **`Monthly`** | **`Annual −20%`** (`:132`); the `−20%` is a `.save` span in
  `--healthy` green.

### The 3 cards (verbatim)
| Card | Tag | Price (mo) | Price (yr) | Unit suffix | Tagline | Feature list | CTA |
|---|---|---|---|---|---|---|---|
| **Solo** | `Current` (work-blue `.curtag`, `:136`) | **$0** | $0 | `/ forever` | "For individuals exploring an AI workspace." | Personal memory graph · All major LLMs + local · Local-first by default | **"Your plan"** (disabled, `:141`) |
| **Pro** | **"Most popular"** (honey `.pop`, `:144`) `.feat` honey border+glow | **$19** | **$15** | `/ month` → `/ mo · billed yearly` | "For power users compounding across projects." | Everything in Solo · Sync across devices · Marketplace skills & connectors · Self-evolving skills | **"Choose Pro"** (honey, `data-go="checkout"`) |
| **Teams** | — | **$49** | **$39** | `/ seat / mo` → `/ seat · yearly` | "Shared memory without losing privacy." | Everything in Pro · Shared team memory · WaggleDance multi-agent · SSO & role-based access | **"Choose Teams"** (ghost) |

- Annual prices come from `data-yr` attributes; the cycle toggle JS swaps `pp` innerHTML and special-cases Teams' suffix (`:243`). So **$15 Pro / $39 Teams annual are the design's stated annual-equivalent monthly numbers** (−20% of $19→$15.20 rounded to $15; −20% of $49→$39.20 rounded to $39).
- "Most popular" badge is **honey** (`--honey` bg, `#1a1407` text, `:38`); "Current" badge is **work-blue** (`--work`, `:39`).

### REAL backing
- **Prices match `tiers.ts:7–12` exactly**: FREE $0 / PRO $19/mo / TEAMS $49/seat. ✅ No drift.
- **"Choose Pro/Teams" → real route**: `adapter.createCheckoutSession('PRO'|'TEAMS')`
  (`adapter.ts:2667`) → `POST /api/stripe/create-checkout-session` (`checkout.ts:13–56`) →
  `stripe.checkout.sessions.create({mode:'subscription', allow_promotion_codes:true, ...})` →
  returns hosted `session.url`. **This already works** when `STRIPE_SECRET_KEY` + a price ID env are set.
- **Monthly/Annual toggle is REAL-capable but currently NOT wired in-app.** The backend
  `priceIdForTier(tier, billingPeriod)` (`index.ts:91–100`) already resolves
  `STRIPE_PRICE_PRO_MONTHLY/_ANNUAL` + `STRIPE_PRICE_TEAMS_MONTHLY/_ANNUAL`. But
  `adapter.createCheckoutSession(tier)` (`adapter.ts:2667`) sends **no `billingPeriod`** → always
  monthly. **MUST-BUILD (small):** thread `billingPeriod` through the adapter + hook to honor the
  toggle. `apps/www/app/_components/Pricing.tsx:9,95,165` already has the monthly/annual toggle pattern to copy.
- "Solo = Current / Your plan (disabled)" — the current-plan marker is REAL: `useBilling().tier`
  + `tierResolved` (`useBilling.ts:13–37`); SettingsApp already renders a tier badge from this
  (`SettingsApp.tsx:537–561`).

**Verdict: Plans is REAL/DERIVABLE — the highest-value, lowest-risk part of PR7.**

---

## 2. State 2 — CHECKOUT (`billing.html:161–185`) — **DO NOT hand-build the card form**

### Verbatim copy (left "Payment details" panel, `:163–175`)
- H2 **"Payment details"**.
- Email field, value `mara@egzakta.com` (**fabricated identity**).
- "Card information" → `1234 1234 1234 1234` placeholder, value `4242 4242 4242 4242` (**fake Stripe test card**), `VISA` brand chip.
- Expiry `MM / YY` value `08 / 28`; CVC value `•••`.
- "Name on card" value `Mara Kovač` (**fabricated**).
- "Country" value `Germany` (**fabricated**).
- Secure line (`:172`): lock icon + **"Encrypted & secure. We never store your card — Stripe does."**
- Pay button (`:173`): **"Pay $19.00 / month"** → `data-go="success"`.
- Footer (`:174`): **"Powered by _Stripe_ · cancel anytime"**.

### Verbatim copy (right "Order summary" panel, `:176–184`)
- H2 **"Order summary"**.
- Plan row: hex "W" mark + **"Waggle Pro"** / **"Monthly · renews Jul 14"** (`:178`).
- Line: **"Pro plan" — "$19.00"** (`:179`).
- Promo row: input placeholder **"Promo code"** + **"Apply"** button (`:180`).
- Line: **"Tax (est.)" — "$0.00"** (`:181`).
- Total line: **"Due today" — "$19.00"** (`:182`).
- Guarantee (`:183`): **"14-day free trial · you won't be charged until Jun 28"**.

### Reality check — THIS IS THE CORE TENSION
- **There is NO custom-card-form backend, and there must not be one.** The real flow is a
  **redirect to Stripe-hosted Checkout**: `checkout.ts` returns `session.url`, and
  `useBilling.startCheckout()` does `window.open(url, '_blank')` (`useBilling.ts:69–81`). The card
  fields, brand detection, promo `Apply`, and live tax are **all Stripe's hosted page**, not ours.
- **`SCREENS.md:294` explicitly says "Use Stripe Checkout/Customer Portal where possible."** So the
  HTML's 2-col card form is a **visual mock of Stripe Checkout** — the honest PR7 build is:
  *"Choose Pro" → spinner/redirect → Stripe-hosted Checkout (themeable via Stripe's Branding
  settings, NOT our DOM).* We do **not** collect card/email/name/country in-app (PCI scope + the
  fields have no API to POST to).
- **Promo codes ARE real** end-to-end: `allow_promotion_codes:true` (`checkout.ts:44`) — but they're
  entered on Stripe's page, not our `Apply` button.
- **Trial-aware "Due today / won't be charged until"** is DERIVABLE from `trialDaysRemaining` +
  `trialStartedAt` (`/api/tier`, `settings.ts:332–333`) for a *plans-page hint*, but the binding
  "Due today $19 / charged Jun 28" on the checkout page itself is **Stripe-rendered** (Stripe knows
  the actual trial config on the price). A hardcoded "Jun 28" / "Jul 14" in our UI would be fabrication.

**Verdict: MUST-NOT-HAND-BUILD. Replace the custom card panel with the existing redirect-to-Stripe
flow. The order-summary panel can be a real pre-checkout summary (plan + price from `tiers.ts`),
but any date/tax/"due today" line must come from Stripe or be omitted — never invented.**

---

## 3. State 3 — SUCCESS (`billing.html:187–199`) — **receipt = FABRICATED, gate it**

### Verbatim copy
- Healthy-green check **ring** (`.ring`, `--healthy-wash` bg, `:189`).
- H1 **"You're _Pro._"** (`:190`).
- Body (`:191`): **"Your hive just leveled up — _sync, the marketplace, and self-evolving skills_
  are live. Your trial runs 14 days; we'll remind you before the first charge."**
- Receipt card (`:192–197`):
  - **"Plan" — "Waggle Pro · Monthly"**
  - **"Trial ends" — "Jun 28, 2026"** (**fabricated date**)
  - **"Then" — "$19.00 / month"**
  - **"Receipt" — "Emailed →"** (honey, clickable; **no real email-receipt feature in-app**)
- CTA (`:198`): **"Start using Pro →"** (`data-go="home"`) + **"Manage billing"** (`data-go="manage"`).

### Reality check
- **The success *trigger* is REAL**: after Stripe redirect, the app detects `?session_id=` and calls
  `POST /api/stripe/sync` (`useBilling.ts:104–115` → `sync.ts:18–90`), which **payment-gates**
  (`session.payment_status === 'paid' || 'no_payment_required'`, `sync.ts:46`) and updates the tier.
  There IS a `/payment-success?session_id=…` success_url already (`checkout.ts:42`). So a real
  "You're Pro" confirmation **can** render off the synced tier.
- **The receipt block is fabricated.** `/api/stripe/sync` returns only `{ tier, customerId }`
  (`sync.ts:83`). **No "trial ends" date, no "$/mo then" line, no receipt number/email** is returned.
  "Trial ends Jun 28" and the "Emailed →" receipt link have **no data source** — rendering them as
  shown would invent facts. ("Receipt emailed" is even arguably true *only* if Stripe email receipts
  are enabled on the account — out of our control.)

**Verdict: Build the success state from the SYNCED TIER only ("You're Pro" + CTA buttons).
GATE OFF the receipt rows (Plan/Trial-ends/Then/Receipt) unless sourced from Stripe — they are
fabrication risks. Trial copy must be driven by real `trialDaysRemaining`, not a hardcoded "14 days
/ Jun 28."**

---

## 4. State 4 — MANAGE (`billing.html:201–218`) — **invoice list + payment method = FABRICATED; use Customer Portal**

### Verbatim copy
- H1 **"Billing"** (`:203`).
- Current-plan card (`:204–209`, honey border):
  - **"Waggle Pro"** / **"$19.00 / month · renews Jul 14, 2026"** + **"● Active"** badge (honey).
  - Row **"Billing cycle" — "Monthly  _Switch to annual (−20%)_"** (the `.chg` link is honey).
  - Row **"Payment method" — "VISA ···· 4242"  _Update_** (`:207`).
  - Row **"Next charge" — "$19.00 on Jul 14"** (`:208`).
- Invoices card (`:210–215`):
  - Header **"Invoices"**.
  - 3 rows, each: date · `$19.00` (mono) · **"Paid"** (healthy pill) · **"PDF ↓"** download link:
    - **Jun 14, 2026** · $19.00 · Paid · PDF
    - **May 14, 2026** · $19.00 · Paid · PDF
    - **Apr 14, 2026** · $19.00 · Paid · PDF
- Footer actions (`:216`): **"Change plan"** (ghost, `data-go="plans"`) + **"Cancel subscription"** (danger/red).
- Footer note (`:217`): **"Subscription managed securely via _Stripe_."**

### Reality check
- **`renews Jul 14`, `VISA ···· 4242`, `Next charge $19.00 on Jul 14`, and ALL 3 invoices are
  fabricated.** Grep confirms **no invoices route, no payment-method route, no `invoices.list` /
  `customers.retrieve` / `paymentMethods` call anywhere in `packages/server/src`.** `/api/stripe/sync`
  + `/api/tier` return **no renewal date, no card brand/last4, no next-charge, no invoice history.**
- **What IS real for Manage:** the **Stripe Customer Portal**. `createPortalSession()`
  (`adapter.ts:2675`) → `POST /api/stripe/create-portal-session` (`portal.ts:14–51`, `requireTier('PRO')`,
  reads `stripe_customer_id` from config.json) → returns hosted `billingPortal` URL. **The portal IS
  where "Update payment method, view invoices, cancel subscription" actually happens** — and the
  current SettingsApp already says exactly that (`SettingsApp.tsx:632`: *"Update payment method, view
  invoices, or cancel your subscription via the Stripe customer portal."*).
- **"Switch to annual (−20%)" / "Change plan" / "Cancel subscription"** → all **belong in the
  Customer Portal** (or a fresh checkout for an upgrade). Building in-app cancel/swap buttons that
  hit Stripe write-APIs directly is out of scope and risky; the portal is the sanctioned surface.

**Verdict: The Manage state's in-app "current plan / cycle / payment method / next charge / invoice
table" must be REPLACED by (a) a real current-plan header off `useBilling().tier` and (b) a single
"Manage subscription via Stripe" button that opens the Customer Portal. The fabricated invoice list,
card number, renewal/next-charge dates, and PDF links MUST be gated off — there is no data for them.**

---

## 5. The custom-card-form-vs-Stripe-Checkout tension (explicit, per task)

| Design HTML shows | Codebase reality | PR7 resolution |
|---|---|---|
| In-app 2-col card form (email/card/expiry/CVC/name/country) | No card-capture endpoint; PCI-out-of-scope by design (`checkout.ts` only mints a hosted session) | **Redirect to Stripe-hosted Checkout** (existing `startCheckout` → `window.open(session.url)`). Theme via Stripe Branding, not our DOM. |
| In-app promo `Apply`, live `Tax (est.)`, `Due today` | `allow_promotion_codes:true` (real) but applied on Stripe's page; tax/proration is Stripe-computed | Promo/tax/due-today live on the **hosted page**. An in-app pre-summary may show plan+list price from `tiers.ts` only. |
| In-app invoice table + PDF + payment method + cancel | No invoices/payment-method/cancel route exists | **Stripe Customer Portal** (existing `openPortal`). |
| Success receipt (#, trial-end, "emailed") | `/sync` returns `{tier, customerId}` only | Confirm off synced tier; **gate the receipt block**. |

`SCREENS.md:294` ("Use Stripe Checkout/Customer Portal where possible; theme to tokens") **is the
contract**: the HTML card form / invoice table are **fidelity mockups of Stripe's hosted surfaces**,
not a spec to reimplement. PR7 builds the **Plans** screen + the **two redirect entry points**
(Checkout → hosted; Manage → portal) + an **honest post-redirect success** state, all themed.

---

## 6. Fabrication-risk register (what PR7 could silently invent — gate OFF)

1. **Logged-in identity** — design hardcodes `mara@egzakta.com` / `Mara Kovač`. There is **no real
   account email** in any contract. The only display name available is `IdentityLayer.get().name`
   (memory-derived, often undefined — `home.ts:261–267`), surfaced as `HomeBriefing.userName`. **An
   email or "name on card" must NOT be invented.** (Note: Auth/Clerk is screen 13's job; until Clerk
   lands there is no authenticated email at all.)
2. **Invoice list** (3× $19 Paid + PDF) — **no invoices route; pure fabrication.** Gate off → Customer Portal.
3. **Payment method** (`VISA ···· 4242`) — **no payment-method route; fabrication.** Gate off → Portal.
4. **Receipt number / "Emailed →" / "Trial ends Jun 28"** — `/sync` has none of these. Gate off.
5. **Renewal / next-charge dates** (`renews Jul 14`, `Next charge $19.00 on Jul 14`) — no date in any
   contract. **Do not hardcode dates.** Trial dates only via real `trialDaysRemaining`/`trialStartedAt`.
6. **`$15` / `$39` annual prices** — these are the **design's** annual numbers (−20% rounded). The
   *authoritative* charge is whatever the `STRIPE_PRICE_*_ANNUAL` price says. Display the design's
   marketing number is fine; **the actual charged amount must come from Stripe**, never asserted by us.
7. **Test card `4242 4242 4242 4242`** — fine as a placeholder in a *mock*, but must never appear in
   the real (hosted) flow; it's Stripe's own test PAN.

---

## 7. REAL vs MUST-BUILD vs EXTERNAL-DEP (summary)

| Feature | Status | Evidence / note |
|---|---|---|
| Plans cards + prices ($0/$19/$49) | **REAL** | `tiers.ts:7–12`; rendered in `SettingsApp.tsx:543–558` + `UpgradeModal.tsx:163–165` |
| "Choose Pro/Teams" → checkout session | **REAL** | `checkout.ts:13–56`, `adapter.ts:2667`, `useBilling.ts:69–81` |
| Monthly/Annual toggle honored at checkout | **MUST-BUILD (small)** | backend ready (`index.ts:91–100`); adapter drops `billingPeriod` (`adapter.ts:2667`) |
| Hosted Stripe Checkout (card form) | **REAL (redirect)** + **EXTERNAL-DEP** | needs `STRIPE_SECRET_KEY` + price-id envs (`index.ts:29`, `checkout.ts:30`) |
| Promo code | **REAL (on hosted page)** | `allow_promotion_codes:true` (`checkout.ts:44`) |
| Post-checkout sync → tier flip | **REAL** | `sync.ts:18–90` (payment-gated), `useBilling.ts:104–115` |
| Success "You're Pro" off synced tier | **DERIVABLE** | from `useBilling().tier` after sync |
| Success receipt rows (#/trial-end/then) | **MUST-GATE (fabrication)** | `/sync` returns only `{tier, customerId}` (`sync.ts:83`) |
| Manage: current plan header | **DERIVABLE** | `useBilling().tier`, `tierResolved` |
| Manage: payment method / invoices / cancel / next-charge | **MUST-GATE → Customer Portal** | no route exists; `portal.ts:14–51` is the sanctioned surface; SettingsApp already does this (`SettingsApp.tsx:622–634`) |
| Stripe Customer Portal | **REAL** + **EXTERNAL-DEP** | `portal.ts`, needs `stripe_customer_id` in config.json + Stripe account |
| Authenticated user email/name | **EXTERNAL-DEP (Clerk, screen 13)** | no account email in any contract; `userName` is memory-derived only (`home.ts:261`) |
| BYO-key vs metered positioning ("pay for scale" copy) | **EXTERNAL-DEP (founder decision)** | BUILD-PLAN §7 #5 / DESIGN_POV §4 — **decide before PR7** |

---

## 8. Recommended PR7 shape for Billing (so the builder doesn't fabricate)

1. **Plans (real):** port the 3-card grid + monthly/annual toggle from `billing.html`; bind prices to
   `tiers.ts`; wire the toggle through a new `billingPeriod` arg on `createCheckoutSession`.
2. **Checkout (redirect):** "Choose Pro/Teams" → spinner → `window.open(session.url)`. Optional in-app
   pre-summary with plan + list price ONLY. **No card fields, no fake tax/dates.**
3. **Success (synced):** themed "You're Pro" off the post-`?session_id=` synced tier. **Receipt block
   omitted** (or shows only what `/sync` returns: tier). Trial line only from real trial fields.
4. **Manage (portal):** themed current-plan header (real tier) + one "Manage subscription via Stripe"
   button → Customer Portal. **No in-app invoice table / card / cancel.**
5. **Graceful degradation:** every state must handle Stripe-not-configured (503 `STRIPE_NOT_CONFIGURED`,
   `index.ts:5`) and unresolved tier (`tierResolved=false`, `useBilling.ts:16`) — already the SettingsApp pattern.

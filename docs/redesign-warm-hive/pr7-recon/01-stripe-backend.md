# PR7 Recon · 01 — Stripe / Billing BACKEND state

**Scope:** What is REAL vs MUST-BUILD for the 4 billing screen states (Plans / Checkout / Success / Manage) of **screen 14 (Billing)** — plus the auth-identity context that screen 13 (Auth) and "Manage" lean on.
**Method:** read + grep only, no product code changed. Every claim cites `file:line`.
**Target surface:** PR7 builds in **`apps/web`** (the React desktop cockpit) → talks to the **local Fastify sidecar** (`packages/server/src/local/index.ts`). This is a DIFFERENT server entry from the cloud/`apps/www` stack, and that distinction is the single most important fact below.

---

## 0. The two-stack split (read this first)

There are **two** server entry points and **two** Stripe/auth integrations. They must not be conflated:

| | **Local sidecar** (PR7 target) | **Cloud server / `apps/www`** (PR8 / not PR7) |
|---|---|---|
| Entry | `packages/server/src/local/index.ts` | cloud: `packages/server/src/index.ts`; landing: `apps/www/app/**` |
| Tier source | `config.json` on disk (`assert-tier.ts:21-32`) | Clerk `publicMetadata` + cloud DB |
| Auth | **none** — no Clerk plugin registered in `local/` (grep: 0 hits for `plugins/auth` in `src/local`) | Clerk: `packages/server/src/plugins/auth.ts` (only imported by `src/index.ts`); `apps/www` uses `@clerk/nextjs` |
| Stripe routes | `packages/server/src/stripe/**` (checkout/portal/sync/webhook) | `apps/www/app/api/stripe/checkout/route.ts` + `app/api/webhooks/stripe/route.ts` |
| Stripe ↔ identity link | customer id stored in **`config.json` `stripe_customer_id`** (`webhook.ts:60`, `portal.ts:28`) | customer id stored in **Clerk `publicMetadata.stripeCustomerId`** (`apps/www/.../checkout/route.ts:94-97`) |

`apps/web` consumes the **local sidecar** (adapter base = local URL; `apps/web/src/lib/adapter.ts` calls `/api/stripe/*`). So **PR7's backend is the `packages/server/src/stripe/**` set, NOT the richer `apps/www` Clerk-linked flow.** The `apps/www` flow (full Clerk identity + lazy Stripe Customer + lookup_key price resolution) is PR8 territory and should not be assumed available in the desktop cockpit.

---

## 1. Stripe backend inventory (local sidecar — the PR7 surface)

All routes registered via `stripeRoutes` at `packages/server/src/local/index.ts:128,2161`. All gate on `STRIPE_SECRET_KEY`; absent → **503 `STRIPE_NOT_CONFIGURED`** (`index.ts:25-43`, each route).

| Route | File:line | What it does | REAL? |
|---|---|---|---|
| `POST /api/stripe/create-checkout-session` | `checkout.ts:16` | Hosted Stripe Checkout session (`mode:'subscription'`), PRO/TEAMS only, period-aware price, returns `{url}` | **REAL** |
| `POST /api/stripe/create-portal-session` | `portal.ts:15` | Stripe **Customer Portal** session, `requireTier('PRO')` gated, needs `config.json.stripe_customer_id`, returns `{url}` | **REAL** |
| `POST /api/stripe/sync` | `sync.ts:21` | Poll-confirm after redirect (desktop behind NAT), retrieves session, **payment-gated** (`status==='complete' && paid`, `sync.ts:46-49`), writes tier to config | **REAL** |
| `POST /api/stripe/webhook` | `webhook.ts:74` | Signature-verified lifecycle handler — **flips tier in config.json** | **REAL** |
| `GET /api/tier` | `settings.ts:322` | Authoritative tier read (+ `trialDaysRemaining`, `trialExpired`) | **REAL** |
| `PATCH /api/tier` | `settings.ts:363` | Dev/testing tier override ("will be replaced by Stripe webhook") | REAL (dev) |
| `POST /api/tier/start-trial` | `settings.ts:401` | Atomic 15-day trial start | REAL |
| **invoice list** | — | **does not exist** (grep `invoice`/`invoices.list` in `packages/server` → 0 product hits; only a chat-keyword at `chat-helpers.ts:15`) | **MUST-BUILD** |
| **payment-method read/update** | — | **does not exist** (grep `paymentMethod`/`payment_method` → 0 hits) | **MUST-BUILD (or defer to Portal)** |

**Adapter methods already on the FE** (`apps/web/src/lib/adapter.ts`): `createCheckoutSession` (2667), `createPortalSession` (2675), `syncStripeCheckout` (2659), `getTier` (2682). The **`useBilling` hook already orchestrates the whole happy path** — `apps/web/src/hooks/useBilling.ts`: `startCheckout` opens the URL (69-81), `openPortal` opens the portal URL (84-96), `syncAfterCheckout` confirms (49-66), and it **auto-detects `?session_id=` on mount** to run sync (104-115). It also carries the honesty primitive `tierResolved` (16-21): until a real `getTier()` round-trip succeeds, the default `'FREE'` is a **placeholder, not a fact** — billing surfaces must render an unresolved state, not the FREE card.

### Webhook DOES flip tiers (REAL)
`webhook.ts:114-158` handles three events, all writing tier to `config.json` via `updateUserTier` (52-62):
- `checkout.session.completed` → grants tier **only if `payment_status` is `paid`/`no_payment_required`** (122) — unpaid sessions never grant.
- `customer.subscription.updated` → re-resolves tier from price id via `tierFromPriceId` (139).
- `customer.subscription.deleted` → **downgrades to FREE** (150).
Plus real hardening: raw-body signature verification (88-95), idempotency via `.stripe-processed-events.json` + a serialized critical section against TOCTOU double-processing (40-45, 102-165), atomic temp-file writes (25-29). CLAUDE.md §10 (E-10) confirms 17/17 webhook tests green.

---

## 2. Price wiring / env contract (REAL, documented)

`tierFromPriceId` (`index.ts:71-87`) and `priceIdForTier` (`index.ts:91-100`) resolve a **dual env contract**:
- **4-var** (matches `apps/www`): `STRIPE_PRICE_PRO_MONTHLY` / `_PRO_ANNUAL` / `_TEAMS_MONTHLY` / `_TEAMS_ANNUAL`.
- **legacy single-var** fallback: `STRIPE_PRICE_PRO` / `_TEAMS` / `_BASIC`(→PRO).
- final fallback: `TIER_CAPABILITIES[tier].stripePriceId` (`tiers.ts:122,143`, read from `STRIPE_PRICE_PRO`/`_TEAMS` env).

CLAUDE.md §10 (M7) records both **test (`acct_1SzHlbC0mmjh4oEM`) and live (`CNCrMQy1f7`)** Stripe accounts hold 2 products × 2 prices with lookup_keys `pro_monthly`/`pro_annual`/`teams_monthly`/`teams_annual`; live price IDs in `docs/launch/drafts/2026-05-12-apps-www-deployment-readiness.md`. **The price IDs/secret are EXTERNAL-DEP** (must be present in the sidecar's env at runtime). Pricing on the screen (Solo $0 / Pro $19 / Teams $49-seat, `SCREENS.md:294-295`) is **DERIVABLE** from `tiers.ts` doc-comment (`tiers.ts:7-12`) — but the literal dollar amounts are NOT machine-readable fields in `TIER_CAPABILITIES`; only `stripePriceId` is. So plan-card prices are static copy unless cross-checked against the Stripe dashboard.

---

## 3. Per-state verdict (screen 14 · Billing)

Screen spec: `SCREENS.md:282-295`. Note the explicit instruction: **"Use Stripe Checkout/Customer Portal where possible; theme to tokens."**

| State | Backend verdict | Evidence / what's needed |
|---|---|---|
| **Plans** (monthly/annual toggle, 3 cards) | **REAL (read) + DERIVABLE (copy)** | tier from `GET /api/tier` (`settings.ts:322`); current-plan highlight from `useBilling.tier` + `tierResolved`; prices are static copy derivable from `tiers.ts:7-12`. Upgrade buttons call existing `createCheckoutSession`. No new backend. |
| **Checkout** (custom card form: email, card 4242, expiry/CVC, country) | **MUST-NOT-BUILD as custom; redirect to HOSTED Checkout (REAL)** | The screen mock shows a **custom card form** (`SCREENS.md:287-289`), but the backend only produces a **hosted Stripe Checkout URL** (`checkout.ts:39-51`). There is **no card-tokenization / PaymentElement / Stripe.js** anywhere in `apps/web` (grep `CardElement`/`PaymentElement`/`4242` → 0 hits). **PCI/scope flag below.** Recommended: the "Checkout" segment is a themed **summary/preview that hands off to hosted Checkout**, not a real PAN field. |
| **Success** ("You're Pro", receipt, Manage) | **REAL** | Already wired: `useBilling` auto-runs `syncStripeCheckout` on `?session_id=` (`useBilling.ts:104-115`); sync is payment-gated (`sync.ts:46-49`). The post-redirect `/payment-success` URL is set at `checkout.ts:42`. "Receipt" line-items are **NOT returned by sync** (`sync.ts:83` returns only `{tier, customerId}`) → a real receipt would need a new fetch or Portal link → **MUST-BUILD or show generic confirmation**. |
| **Manage** (current plan, switch annual, payment method ···4242, next charge, **invoices PDF**, change/cancel) | **PARTLY REAL via Portal; the in-app detail is MUST-BUILD** | `createPortalSession` (`portal.ts:15`) gives a one-click jump to Stripe's **hosted Customer Portal**, which natively does payment-method update, invoice PDFs, plan change, cancel. **BUT** rendering those *inside* the cockpit (the "VISA ···4242", "next charge", invoice list with Paid+PDF in the mock, `SCREENS.md:291-292`) requires routes that **do not exist**: no invoice-list, no payment-method read, no subscription-detail route on the local sidecar. Also Portal requires `config.json.stripe_customer_id` to already be set (only written after a real paid checkout/webhook, `webhook.ts:60`) else **400 `NO_STRIPE_CUSTOMER`** (`portal.ts:32-34`). |

---

## 4. Auth context for screen 13 (and what "Manage" identity rests on)

Screen 13 spec (`SCREENS.md:269-278`): "Build with **Clerk** components themed to the tokens," with honest "account is optional / local-first" framing.

- **In `apps/web` (PR7 target): Clerk is NOT present.** grep `@clerk`/`ClerkProvider`/`useUser`/`signIn` in `apps/web` → **0 files**. The local sidecar registers **no auth plugin** (grep `plugins/auth` in `src/local` → 0). So **the desktop has no real logged-in identity** — tier lives in `config.json`, not behind a session.
- **Clerk IS wired, but only in the OTHER stack:** root dep `@clerk/fastify` (`package.json:45`) is consumed by `packages/server/src/plugins/auth.ts` (verifyToken + auto-provision) and `ws/gateway.ts:3` — both reachable **only from the cloud entry `src/index.ts`**, not the desktop sidecar. `apps/www` has the full Next.js Clerk surface (`sign-in`, `sign-up`, `account/page.tsx` using `<UserProfile>`, `@clerk/nextjs ^7.3.0` + `@clerk/themes ^2.4.57` in `apps/www/package.json:15-16`).
- **Therefore screen 13 in the desktop is EXTERNAL-DEP + design decision, not a wiring task.** Either (a) embed Clerk in `apps/web` for the first time (new provider, new keys, new session model — large, and contradicts "local-first / account optional"), or (b) make screen 13 a **themed informational/SSO-handoff** screen that links to `apps/www` Clerk and keeps the desktop accountless. The honesty contract leans hard toward (b): **do not render a logged-in identity (name/email/avatar) the desktop does not actually have.** (PR1 already flagged the `userName={null}` sidebar row, BUILD-PLAN.md:189.)

---

## 5. FABRICATION RISKS — must be gated off, never invented

1. **Invoices list (Manage).** No invoice route exists. A static "Invoice #1234 · Paid · PDF" list would be **fabricated billing history**. Gate: only show invoices if a real route is built against `stripe.invoices.list(customer)`; otherwise **link out to the hosted Portal** for invoices. (`SCREENS.md:292`)
2. **Payment method "VISA ···4242".** No payment-method route. The mock's "···4242" is literally Stripe's test PAN. Hardcoding it = **fake payment method**. Gate: render only from a real `paymentMethods.list`, else Portal-only. (`SCREENS.md:291`)
3. **"Next charge" / billing-cycle date.** Not returned by any local route (`sync.ts:83`, `getTier`). Inventing a date = fabrication. Gate: derive from a real subscription fetch or omit.
4. **Custom card form (4242 PAN field).** A real-looking PAN/CVC field that doesn't tokenize would be both fake AND a PCI-scope trap (see §6). Gate: never collect raw PAN in-app; hand off to hosted Checkout.
5. **Logged-in identity on Auth / sidebar (screen 13).** Desktop has no Clerk session. Showing a real name/email/avatar = fabricated identity. Gate: keep accountless or SSO-handoff; the `tierResolved`-style "unresolved" pattern (`useBilling.ts:16-21`) is the precedent.
6. **Tier shown as FREE before resolution.** `useBilling` already guards this with `tierResolved` (`useBilling.ts:36-46`) — the Plans "current plan" badge must honor it, not assume FREE.
7. **Receipt on Success.** `syncStripeCheckout` returns no receipt/amount (`sync.ts:83`). A "$19 charged" receipt line would be invented. Gate: generic "You're Pro" confirmation, or Portal link, until a real receipt fetch exists.

---

## 6. Custom card form vs hosted — PCI / scope implication (FLAG)

The screen mock shows a **custom card form** (email, card 4242, expiry/CVC, name, country — `SCREENS.md:287-289`), but the **backend only emits a hosted Stripe Checkout URL** (`checkout.ts:39-51`) and the screen note itself says **"Use Stripe Checkout/Customer Portal where possible"** (`SCREENS.md:294`).

**Implication:** A real custom PAN form means the card number touches the app's DOM → **PCI-DSS scope jumps from the trivial SAQ-A (hosted/redirect) to SAQ-A-EP or higher**, and would require Stripe.js Elements / PaymentElement client-side tokenization (none exists in `apps/web` today — grep confirms 0). For a Tauri desktop binary this is a material compliance + security burden for zero functional gain over the already-built hosted flow.

**Recommendation (for the build-plan decision):** treat the Checkout-segment card UI as a **themed visual preview/order-summary that redirects to hosted Stripe Checkout** (reuse `createCheckoutSession`), and treat "Manage" detail (payment method, invoices, cancel) as a **themed launchpad to the hosted Customer Portal** (reuse `createPortalSession`). Build new local routes (invoice-list / subscription-detail) ONLY if founder wants those rendered in-app — and even then, render strictly from live Stripe data, never placeholders.

---

## 7. One-line summary per question asked

- **create-checkout-session route?** YES — REAL (`checkout.ts:16`).
- **customer-portal route?** YES — REAL (`portal.ts:15`), but needs `stripe_customer_id` in config first.
- **invoice-list route?** NO — MUST-BUILD (or defer to hosted Portal).
- **Does the webhook flip tiers?** YES — REAL, payment-gated, idempotent (`webhook.ts:114-158`).
- **What does "Manage" need?** Either reuse the hosted Portal (REAL today) OR build 3 new local routes: invoice-list, payment-method, subscription-detail (none exist).
- **Hosted vs custom?** Hosted is the intended + already-built path; the mock's custom 4242 form is a PCI-scope trap — flag and prefer hosted.
- **Auth screen 13 backend?** Desktop has NO Clerk/identity (EXTERNAL-DEP + design call); Clerk only lives in the cloud server + `apps/www`.

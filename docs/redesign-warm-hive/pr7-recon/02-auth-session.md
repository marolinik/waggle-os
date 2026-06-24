# PR7 Recon · 02 — Current auth / session / identity model

> Recon-only. No product code touched. Every claim cites `file:line`.
> Scope: the substrate **PR7 Auth (screen 13, Clerk) and Billing (screen 14, Stripe)** must reconcile with.
> Honesty contract (PR3–PR6): every place PR7 could fabricate a logged-in identity, fake invoices/usage/payment methods is flagged for gate-off.

---

## 0. TL;DR — the architecture tension, stated plainly

Waggle today has **TWO unrelated "auth" systems**, and PR7's screen 13 belongs to neither cleanly:

1. **The local sidecar (what `apps/web` actually talks to)** authenticates with a **per-process random bearer token** — NOT a user login. There is **no account, no email, no password, no Clerk** on this path. "Who the user is" = a free-text **name** typed into onboarding (IdentityLayer), and "what tier" = a `tier` string in `config.json`. The local app runs **fully without any account** — this is literally true today, which matches the design's "an account is optional — Waggle runs fully local without one."
2. **A separate cloud/team Fastify server** (`packages/server/src/{plugins,routes,services,db}/`, distinct from `packages/server/src/local/`) **does** use **Clerk** (`@clerk/fastify`) with a real `users` DB table keyed by `clerkId`. This is the TEAMS/cloud-sync path — it is gated by `CLERK_SECRET_KEY` and is **not wired into the desktop `apps/web` UI at all**.

**Implication for PR7 Auth (screen 13):** there is **no existing login/signup UI in `apps/web`** and no client-side Clerk dependency. A "Sign in with Clerk" screen is a **MUST-BUILD net-new surface + an EXTERNAL-DEP** (Clerk publishable key + a decision about which server validates the session). The honest framing the design already calls for ("account optional, local-first") is not just copy — it is the actual current architecture, and PR7 must not regress it into a hard auth wall.

**Implication for PR7 Billing (screen 14):** the **entire Stripe flow already exists and is wired client→server** (checkout, portal, sync, tier read, trial). Billing is mostly **REAL/DERIVABLE** — the work is a themed UI over hooks that already work. The fabrication risk is the design's mocked **invoices / payment-method / "VISA ···4242"** content, which is NOT in any current API.

---

## 1. How the app authenticates TODAY (no account)

### 1.1 The token is a per-process secret, minted at sidecar boot — not a credential
- `packages/server/src/local/index.ts:1409` — `wsSessionToken: crypto.randomBytes(32).toString('hex')` is generated once when the sidecar's agent state is created. It is **process-lifetime**, tied to nothing about a user.
- `packages/server/src/local/index.ts:2039–2041` — registered into the security middleware as `sessionToken: server.agentState.wsSessionToken`.
- `packages/server/src/local/index.ts:2047–2051` — `GET /api/auth/session-token` returns `{ token: wsSessionToken }`, **auth-exempt** but **same-origin gated** via `isLocalRequest(request)` (cross-origin → 403). This is the bootstrap: the webview reads the token once, then sends it as a Bearer on every other call.

### 1.2 Server enforcement = "is this the current process's token?", nothing about identity
- `packages/server/src/local/security-middleware.ts:238` — `AUTH_EXEMPT_PATHS = ['/health', '/api/auth/session-token']`.
- `:340–377` — bearer check: any non-exempt `/api/*` request must carry `Authorization: Bearer <sessionToken>` or it 401s with `MISSING_TOKEN`/`INVALID_TOKEN`. There is **no user lookup** — token equality is the whole check.
- `:296–298` — D1: localhost is **no longer trusted by default** (`WAGGLE_TRUST_LOCALHOST=1` is the escape hatch) — because the desktop coexists with browsers/other local apps; the bearer token is what prevents any local process from driving the API.
- `:343–353` — non-API GETs (the SPA shell + static assets) load token-less (chicken-and-egg bootstrap); every `/api/*` and non-GET stays gated.
- `:249–254`, `:361–366` — SSE streams accept the same token via `?token=` (EventSource can't set headers). Still the same per-process token.

### 1.3 The client side: attach token, refresh on 401, never a login
- `apps/web/src/boot-connect.ts:16–18` — `adapter.connect()` fires as `main.tsx`'s first import, arming the deferral gate before any component fetch.
- `apps/web/src/lib/adapter.ts:298–308` — `fetchSessionToken()` GETs `/api/auth/session-token` on connect and stores `this.authToken` (best-effort).
- `apps/web/src/lib/adapter.ts:444–446` — every non-exempt request attaches `Authorization: Bearer ${issuedToken}`.
- `apps/web/src/lib/adapter.ts:316–337, 459–470` — on a 401 the adapter does ONE silent token refresh + retry (the token rotates every sidecar restart). **This is the only "session lifecycle" that exists** — it is process-rotation recovery, not user re-auth.
- `apps/web/src/lib/adapter.ts:49` — client mirror of `AUTH_EXEMPT_PATHS`.

**There is no signin/signup/logout anywhere on this path.** (grep for `SignIn|SignUp|useAuth|LoginPage` across `apps/web/src` returns only `AppShell.tsx` (a tier label) and a test file — see §4.)

---

## 2. What currently consumes "who is the user"

| Consumer | Today's source | File:line | For PR7 |
|---|---|---|---|
| **Display name** (Home greeting, sidebar user row) | `IdentityLayer.name` — a free-text name typed in onboarding, stored per-mind in SQLite | `home.ts:261–270` (briefing `userName`); `AppShell.tsx:98,102,321`; `identity.ts:62–100` | A Clerk identity would *supersede* this name, but the IdentityLayer name is **not** an account |
| **`HomeBriefing.userName`** (BUILD-PLAN §9 / PR1 LOW #2) | Same IdentityLayer name; optional, omitted when blank | `home.ts:406,411`; `adapter.getIdentity()` `adapter.ts:1090–1103` | This is the "user identity surface" the BUILD-PLAN points at — it is **identity, not auth** |
| **Tier** (everything gated) | `config.json` `tier` field (single local user) | `assert-tier.ts:21–39` `readTierFromDataDir`; `settings.ts:309–333` `GET /api/tier` | Tier is **device-local**, not account-bound — Billing/Auth reconciliation point (§5) |
| **Trial** | `config.json` `trialStartedAt`; effective tier downgrades TRIAL→FREE on expiry | `settings.ts:392–432`; `tiers.ts:191–204` | `startTrial` already exists client+server |
| **Stripe customer** | `config.json` `stripe_customer_id` (written by webhook/sync) | `webhook.ts:52–62`; portal reads it | The billing "who" — a Stripe customer id, again device-local, **not** a Clerk user |
| **Team identity (cloud only)** | Clerk `clerkId` → internal `users.id` UUID | `plugins/auth.ts:24–52`; `services/user-service.ts:12–58` | The ONLY place a real account identity exists today — and it's **not in `apps/web`** |

**Key reconciliation fact:** tier and Stripe customer live in **`config.json` on the local device, keyed to a single anonymous local user** (`assert-tier.ts:21`, `webhook.ts:52`). They are **not** keyed to a Clerk user id. If PR7 introduces a real Clerk login, the product must decide whether tier/billing stay device-local (today's model) or migrate to account-bound (the cloud server's model). This is unresolved and is the core architectural decision PR7 surfaces.

---

## 3. The Clerk substrate that DOES exist (cloud/team server — not apps/web)

- `package.json:45` — `@clerk/fastify": ">=3.1.16 <4"` (root dep).
- `apps/www/package.json:15–16` — `@clerk/nextjs": "^7.3.0"` + `@clerk/themes": "^2.4.57"` — but `apps/www` is the **landing page (Next.js), which is PR8**, not PR7's `apps/web` screen.
- `apps/web/package.json` — **NO Clerk dependency** (verified, grep returns nothing).
- `packages/server/src/plugins/auth.ts:3,21,31` — `createClerkClient` + `verifyToken`; auto-provisions an internal user from Clerk JWT claims on first auth (`:37–48`).
- `packages/server/src/services/user-service.ts` — `users` table CRUD keyed by `clerkId`; `upsertFromClerk`.
- `packages/server/src/local/security-middleware.ts:307–309` — **the local sidecar already references Clerk indirectly**: `const isTeamMode = !!process.env.CLERK_SECRET_KEY;` enables the 30-min session-inactivity timeout **only in team mode**. So "Clerk present" is already the team/cloud signal even on the local server, but it currently only toggles a timeout — it never establishes a logged-in user on the local path.

**Where a real Clerk identity slots in (PR7 Auth screen 13):** the design says "Build with Clerk components themed to the tokens" (`SCREENS.md:277`). For `apps/web` that means **adding `@clerk/clerk-react` (or `@clerk/clerk-js`) net-new**, mounting `<SignIn/>/<SignUp/>` themed to the warm tokens, and then deciding what the Clerk session *does*: (a) cosmetic/optional account that seeds the IdentityLayer name + (for Teams) unlocks cloud sync, or (b) a real session token the cloud server validates. Today nothing in `apps/web` consumes a Clerk session, so **(a) is the lower-risk, local-first-preserving path** and matches the design's "account is optional" framing.

---

## 4. Existing UI surfaces (what's there vs. what PR7 must build)

- **No Auth/Login/SignUp/Billing page exists in `apps/web`.** Glob `**/*{Auth,Login,SignIn,SignUp,Billing}*.tsx` → only `overlays/LoginBriefing.tsx`, which is the **"while you slept" overnight-work briefing overlay (SCREENS §05 hero), NOT authentication** (named "login" only because it shows on app open). Do not mistake it for an auth screen.
- `apps/web/src/components/os/AppShell.tsx:263–269` — `tierLabel` ("Trial · 9d" / "Pro") for the sidebar user row.
- `apps/web/src/components/os/AppShell.tsx:98–104,321` — `userName` from `adapter.getIdentity()`, degrades to "Account" when unconfigured. **This is the "user-identity surface lands (PR3)" hook the BUILD-PLAN PR1 LOW #2 deferred to** — it is fed by IdentityLayer, and PR7 Auth could optionally re-feed it from a Clerk profile.
- `apps/web/src/components/os/overlays/UpgradeModal.tsx` (imported `AppShell.tsx:37`) + `LockedFeature.tsx` — existing tier-gate upgrade prompts; `AppShell.tsx:411,422` call `adapter.createCheckoutSession(...)` directly. So an upgrade entry point already exists; PR7 Billing screen 14 is the **dedicated Plans/Checkout/Success/Manage surface** these can route into.
- `apps/web/src/test/p1b-authgate-surfaces.test.tsx` — tests the *adapter* auth gate (token/401), not a login UI.

---

## 5. Billing substrate — already REAL end-to-end (screen 14 is mostly a themed re-skin)

**Client (`apps/web`):**
- `apps/web/src/hooks/useBilling.ts` — full hook: `refreshTier` (`:34`), `syncAfterCheckout` (`:49`), `startCheckout` (`:69` → opens Stripe URL in new tab), `openPortal` (`:84`), auto-detects `?session_id=` post-checkout redirect (`:104–115`). Critically `tierResolved` (`:18`) means the UI must **not** present the default `'FREE'` as fact until a real `getTier()` round-trip succeeds — an existing honesty guard PR7 must honor.
- `apps/web/src/lib/adapter.ts:2658–2683` — `syncStripeCheckout`, `createCheckoutSession('PRO'|'TEAMS')`, `createPortalSession`, `getTier`; `:2742+` `startTrial`.

**Server (`packages/server/src/stripe/` + `local/routes/settings.ts`):**
- `checkout.ts:13–57` — `POST /api/stripe/create-checkout-session` → **Stripe-HOSTED Checkout** redirect (`session.url`), success→`/payment-success?session_id=…`, cancel→`/payment-cancelled` (`:42–43`). Matches design "Use Stripe Checkout/Customer Portal where possible" (`SCREENS.md:294`).
- `portal.ts` — `POST /api/stripe/create-portal-session` (Customer Portal) — covers the design's "Manage" state (payment method update / invoices / cancel) **for free**, no custom UI needed.
- `webhook.ts:64–169` — `checkout.session.completed` / `customer.subscription.updated` / `customer.subscription.deleted` → writes `tier` (+ `stripe_customer_id`) into `config.json`. Idempotent + serialized (`:40–45,105–165`). Only grants tier when `payment_status==='paid'|'no_payment_required'` (`:120–124`).
- `index.ts:71–100` — `tierFromPriceId` / `priceIdForTier` resolve the 4-var (`STRIPE_PRICE_PRO_MONTHLY/_ANNUAL`, `…TEAMS…`) + legacy contracts.
- `settings.ts:321–333` — `GET /api/tier` authoritative tier (+ trial days remaining).
- **All `/api/stripe/*` routes 503 `STRIPE_NOT_CONFIGURED` when `STRIPE_SECRET_KEY` is unset** (`index.ts:25–43`, `checkout.ts:17–20`) — so on a dev/local machine without keys, Billing must render an honest "not configured" state, not a fake checkout.

**Design-vs-build for screen 14:** the design's "Checkout: 2-col card form (card 4242…, expiry/CVC)" (`SCREENS.md:287–289`) is **NOT how the current backend works** — checkout is a hosted redirect, there is no card-form endpoint and no card data ever touches Waggle. PR7 should ship the **Plans** state (real, from `getTier` + tier table) + **Success** (real, from `syncAfterCheckout`) + **Manage** (real, via Customer Portal), and either (a) drop the inline card form in favor of hosted Checkout, or (b) build Stripe Elements net-new (larger scope, more PCI surface). Recommend (a) — it matches the existing wiring and the design's own "where possible" caveat.

---

## 6. Fabrication risks for PR7 (must gate off — never invent)

1. **A logged-in identity that isn't real.** The local app has no account. The sidebar/Home already degrade `userName` to "Account" when IdentityLayer is blank (`AppShell.tsx:98–104`). PR7 Auth must NOT show a fabricated "Signed in as …" when no Clerk session exists — show the optional/local-first state.
2. **Fake invoices / receipts.** No invoice API exists anywhere (`webhook.ts` writes only tier + customer id; no invoice list endpoint). The design's "invoices (Paid + PDF)" (`SCREENS.md:292`) has **no data source** — either omit, or surface them only via the **Stripe Customer Portal** (which renders real invoices), never as in-app mock rows.
3. **Fake payment method ("VISA ···4242").** No payment-method API in the sidecar. Must come from the Customer Portal or be omitted — never hardcoded.
4. **Fake usage numbers on Billing.** Tier is real (`getTier`); any "X of Y used" must come from a real source or be omitted.
5. **Presenting default `FREE` as the user's plan.** `useBilling.tierResolved` (`useBilling.ts:18`) exists precisely to prevent this — PR7 Billing must render the unresolved state while `!tierResolved`, not the FREE card.
6. **A working checkout when Stripe is unconfigured.** All `/api/stripe/*` 503 without `STRIPE_SECRET_KEY` — PR7 must render an honest disabled/"not configured" state, not a clickable fake "Subscribe".
7. **Auth gating local-first features behind a login.** The whole product runs token-only with no account today (§1). PR7 Auth must stay **optional** — wiring it as a mandatory gate would regress the local-first contract the design explicitly states.

---

## 7. REAL / DERIVABLE / MUST-BUILD / EXTERNAL-DEP summary

- **REAL** — Local bearer-token session + 401-refresh; per-process token; `GET /api/auth/session-token`; tier in `config.json` + `GET /api/tier` + trial; **entire Stripe checkout/portal/sync/webhook flow** + `useBilling` hook; IdentityLayer name → `userName`; existing `UpgradeModal`/`LockedFeature` upgrade entry points.
- **DERIVABLE** — Billing **Plans** card grid (from tier table + `getTier`); **Success** state (from `syncAfterCheckout`); **Manage** (delegate to Stripe Customer Portal). Sidebar "Signed in / Account" display from `getIdentity()`.
- **MUST-BUILD** — Themed Auth screen 13 UI (no login UI exists in `apps/web`); themed Billing screen 14 surface (no dedicated billing page exists). Decision logic for "what a Clerk session does on the local path."
- **EXTERNAL-DEP** — **Clerk** for `apps/web` (publishable key + new `@clerk/clerk-react` dep; root has only `@clerk/fastify`, `apps/www` has `@clerk/nextjs`); **Stripe** keys (`STRIPE_SECRET_KEY` + price-id env vars + `STRIPE_WEBHOOK_SECRET`) — without them all billing routes 503.

---

## 8. Open decisions PR7 must resolve (carry to the build plan)

1. **Does a Clerk login replace, supplement, or stay independent of the local token?** Today nothing in `apps/web` validates a Clerk session; the local token is what authorizes the API. Recommend: Clerk stays **optional/cosmetic + cloud-sync trigger**, local token remains the API authorizer — preserves local-first, lowest blast radius.
2. **Tier/billing keying: device-local (`config.json`, today) vs. account-bound (cloud `users` table)?** This is DESIGN_POV §4 (BUILD-PLAN §7 item 5, flagged as the PR7 blocker — "who pays for inference, BYO-key vs Waggle-metered"). Unresolved; founder decision.
3. **Checkout UI: hosted Stripe Checkout (matches current wiring) vs. inline Stripe Elements card form (matches design mock, larger scope)?** Recommend hosted — the backend already only supports it and the design says "where possible."
4. **Which server validates a Clerk session if used — the local sidecar (would need `@clerk/fastify` wired into `local/`, currently only `isTeamMode` toggle) or the separate cloud server (`packages/server/src/plugins/auth.ts`, not reachable from `apps/web`)?**

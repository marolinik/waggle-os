# PR7 Recon · 05 — Clerk Integration (themed, reconciled with local-first)

> Scope: Auth screen 13 (`auth.html`) of the warm-Hive redesign. RECON ONLY — no product
> code touched. Every claim cites `file:line` verified this session (2026-06-18).
> Topic: how to integrate Clerk into THIS stack (React 19 + TS + **Vite SPA** `apps/web`,
> React Router 6.30, also bundled into a Tauri desktop binary), themed to the warm tokens,
> reconciled with "account is optional / local-first."

---

## TL;DR verdict (the highest-uncertainty recon)

1. **Stack reality:** `apps/web` is a **Vite SPA** (`vite@^5.4.19`, `react-router-dom@^6.30.1`,
   declarative `<BrowserRouter>`/`<Routes>` — NO loaders, NO SSR). The correct Clerk package
   is **`@clerk/clerk-react`** (skill name `@clerk/react`), env **`VITE_CLERK_PUBLISHABLE_KEY`**.
   **NOT** `@clerk/react-router` (that is React-Router-v7 *framework* mode with
   middleware+`rootAuthLoader`, which this app does not use).
2. **Prior art exists and is excellent:** `apps/www` (the Next.js landing) already has a **full,
   themed Clerk integration** — `ClerkProvider` + `dark` baseTheme + Hive `appearance` map
   (`apps/www/app/layout.tsx:6-93,171`), hosted `/sign-in` + `/sign-up` catch-all routes,
   `/account`, `middleware.ts`. The server already verifies Clerk JWTs (`packages/server/src/plugins/auth.ts`).
   So Clerk is **REAL** in the repo — just **absent from `apps/web`** (the SPA target for screen 13).
3. **ARCHITECTURE VERDICT (founder decision required):** **Option (b) — optional Clerk sign-in
   that unlocks sync/Teams/billing; the local desktop stays fully accountless by default.**
   This is the only option consistent with both the design copy ("An account is optional — Waggle
   runs fully local without one", `SCREENS.md:273-274`) AND the verified backend (the desktop
   sidecar is accountless: `wsSessionToken` loopback auth + `config.json` tier, `local/index.ts:2047-2052`,
   `local/routes/settings.ts:309-331`). It also matches the **prior ratified decision** that Tauri
   Clerk is a "Phase 2 fast-follow, NOT Day 0" (`2026-05-03…brief:225`).
4. **EXTERNAL-DEP the founder must provide:** a Clerk **publishable key** for the SPA
   (`VITE_CLERK_PUBLISHABLE_KEY=pk_…`). Keys already exist for `apps/www`/server
   (`pk_test_ZWxlZ2FudC1jYW1lbC04…` in `…brief:143`; secret **rotated 2026-05-12** per
   `docs/launch/drafts/2026-05-12-apps-www-deployment-readiness.md:161`). The desktop default
   path needs **no key** (accountless).

---

## 1. Stack verification (what `apps/web` actually is)

| Claim | Evidence |
|---|---|
| Vite SPA, not Next | `apps/web/package.json:7` `"dev":"vite"`, `:95` `"vite":"^5.4.19"`; entry `apps/web/src/main.tsx:18` `createRoot(...).render(<App/>)` |
| React 19 | `apps/web/package.json:59` `"react":"^19.2.0"`, `:61` react-dom 19.2 |
| React Router **6.30**, declarative | `apps/web/package.json:64` `"react-router-dom":"^6.30.1"`; `apps/web/src/App.tsx:2,60,62-102` `<BrowserRouter>`/`<Routes>` — NO `createBrowserRouter`, NO loaders |
| shadcn/ui installed | `apps/web/components.json` exists (verified); BUILD-PLAN §2 "shadcn/ui fully installed" |
| Tauri serves the SAME `apps/web` dist | `app/src-tauri/tauri.conf.json:7` `"frontendDist":"../../apps/web/dist"`, `:8` `devUrl http://localhost:8080` |
| `VITE_` env prefix already used | `apps/web/.env.example:11` `VITE_POSTHOG_KEY=…` |
| **No Clerk in `apps/web` today** | `grep '@clerk' apps/web/package.json` → none; `grep -rln 'ClerkProvider|SignIn|useSignIn' apps/web/src` → **0 files**. Clean slate for screen 13. |

`@clerk/react` IS present under `node_modules/@clerk/react` but only as a **transitive** dep of
`@clerk/nextjs` (apps/www) — not a direct `apps/web` dependency. PR7 must add it explicitly.

---

## 2. Clerk in the repo today (prior art — REAL)

| Surface | What exists | Evidence |
|---|---|---|
| `apps/www` (Next.js landing) | `@clerk/nextjs@^7.3.0` + `@clerk/themes@^2.4.57`; `ClerkProvider` in `<body>` with `baseTheme:dark` + full Hive `appearance.variables`+`elements` map | `apps/www/package.json:15-16`; `apps/www/app/layout.tsx:6-7,35-93,171-173` |
| `apps/www` hosted auth | `<SignIn/>` at catch-all `/sign-in/[[...sign-in]]/page.tsx`, `/sign-up`, `/account` | `apps/www/app/sign-in/[[...sign-in]]/page.tsx:1,17-23` |
| `apps/www` middleware | `clerkMiddleware()` (all routes public, per-route `auth.protect()`) | `apps/www/middleware.ts:6,16` |
| Server JWT verify | `@clerk/fastify` `verifyToken` + `createClerkClient`; `authenticate` decorator; auto-provisions internal user from Clerk claims (`upsertFromClerk`) | `packages/server/src/plugins/auth.ts:3,21,31-48` |
| Server config | `clerkSecretKey`/`clerkPublishableKey` from env (empty string default = solo mode) | `packages/server/src/config.ts:6-7,26-27` |
| Env contract | `CLERK_SECRET_KEY` / `CLERK_PUBLISHABLE_KEY` documented across `.env.example:32-33`, `render.yaml:47-49`, `docker-compose.production.yml:8-9,35-36` |
| **Team-mode gate** | Clerk-dependent server behavior activates **only when `CLERK_SECRET_KEY` is set**; absent ⇒ "solo/desktop mode" | `packages/server/src/ws/gateway.ts:46-54`; `packages/server/tests/local/session-timeout.test.ts:166-179` |

**Themed-Clerk pattern is already solved once** (`apps/www/layout.tsx`). PR7's SPA work is to port
that appearance approach to `@clerk/clerk-react`, recolored to the **warm** tokens (apps/www uses the
**old cooler** Hive hex `#08090c`/`#e5a000`; apps/web is now warm `#14110b`/`#e9a52c`).

---

## 3. Local-first crux — why the desktop must stay accountless

The desktop sidecar (`packages/server/src/local/`) authenticates with a **machine-local loopback
token**, NOT a Clerk identity:

- `GET /api/auth/session-token` returns `server.agentState.wsSessionToken` — "auth-exempt but
  same-origin gated… The Tauri webview reads this once on connect() and sends it as a Bearer"
  (`local/index.ts:2043-2052`). This is a **device** token, not a **user**.
- Tier resolves from a local file, default **FREE**, with PATCH noting "will be replaced by Stripe
  webhook" (`local/routes/settings.ts:309-318,322-331,360`). There is **no logged-in user identity
  on the desktop today.**
- The SPA adapter already injects `Authorization: Bearer <token>` on every non-exempt request
  (`apps/web/src/lib/adapter.ts:445`), bootstrapping the token in `connect()`
  (`adapter.ts:254-260,298-308`) with a 401→refresh→retry leg (`adapter.ts:311-321,465`).

**This is the seam Clerk plugs into.** `useAuth().getToken()` from `@clerk/clerk-react` returns the
Clerk session JWT in exactly the `Bearer` shape the adapter + `packages/server/src/plugins/auth.ts`
already consume — so an *optional* Clerk sign-in can swap the device token for a user JWT **only when
the user opts into cloud/Teams**, leaving the accountless local path untouched.

---

## 4. ARCHITECTURE VERDICT — does Clerk fit "account is optional"?

**Recommend Option (b): optional Clerk sign-in that unlocks sync / Teams / billing; local desktop
stays accountless by default.**

| Option | Fit | Why |
|---|---|---|
| (a) Clerk only on SaaS cloud (`apps/www`), desktop never signs in | Partial | Already true today, but screen 13 lives in `apps/web` (the SPA the desktop loads). A pure-(a) reading means screen 13 is a **cloud-only** surface and the desktop shows no auth at all — contradicts having an Auth screen in the app shell. |
| **(b) Optional Clerk in the SPA; accountless is the default; sign-in unlocks sync/Teams/billing** | **Best** | Matches design copy ("account is optional", `SCREENS.md:273-274`), matches the accountless sidecar (`local/index.ts:2047-2052`), matches the prior "Tauri Clerk = Phase 2 fast-follow, NOT Day 0" decision (`…brief:225`), and matches the existing `useBilling` tier flow that already gates upgrade behind a server tier. Clerk renders only when `VITE_CLERK_PUBLISHABLE_KEY` is present; absent ⇒ screen 13 shows the local-first "you're running fully local" state with no fake identity. |
| (c) Full Clerk gate (must sign in to use the app) | **Reject** | Directly violates local-first + "account is optional"; breaks the accountless desktop boot (`/api/tier` defaults FREE with no user). Do not build. |

**Open sub-question for the founder (genuinely unknown):** in Option (b), does desktop Clerk sign-in
even run inside the **Tauri WebView**? Clerk's hosted OAuth/Account-Portal flow assumes a browser
redirect; in a desktop WebView the SSO redirect (Google/Apple) may need a system-browser + deep-link
loopback, or Clerk's custom-flow (`useSignIn`) with email OTP only. This is the same unknown the prior
brief deferred to "Phase 2." **Recommendation:** ship screen 13 as the **web/cloud-served** surface
first (browser context, where the apps/www pattern is proven), and treat in-WebView desktop sign-in as
an explicit follow-up requiring a Tauri deep-link/OAuth spike. Flag, don't guess.

---

## 5. The minimal, correct THEMED integration (for Option b)

### 5.1 Package + env (EXTERNAL-DEP)
- Add `@clerk/clerk-react` (current SDK, pairs with apps/www's `@clerk/nextjs` v7) + `@clerk/themes`.
- `VITE_CLERK_PUBLISHABLE_KEY=pk_…` (founder provides; reuse the existing `apps/www` instance key).
  Vite SPA = **publishable key only**; the secret stays server-side (`CLERK_SECRET_KEY`, already wired).

### 5.2 ClerkProvider placement
- Wrap `<App/>` (or just the auth-aware subtree) in `apps/web/src/main.tsx` — same level as the
  existing `createRoot(...).render(<App/>)` (`main.tsx:18`). `ClerkProvider` must sit **above**
  `react-query`/router but the design only needs auth in the screen-13 route + the sidebar user row,
  so it can wrap inside `<App/>` if a no-key fallback is desired.
- **No-key guard (local-first):** if `import.meta.env.VITE_CLERK_PUBLISHABLE_KEY` is undefined, render
  children **without** ClerkProvider and show the accountless state — never crash, never fabricate a user.

### 5.3 Appearance → warm CSS tokens (the themed part)
- **shadcn theme first.** `apps/web/components.json` exists, so per `clerk-custom-ui` the correct first
  step is `appearance={{ theme: shadcn }}` (`@clerk/themes` shadcn, current SDK). Clerk's shadcn theme
  reads the shadcn HSL vars — which PR1 already repointed to warm values:
  `--primary:38 81% 54% (#e9a52c)`, `--background:40 29% 6% (#14110b)`, `--ring:38 81% 54%`
  (`apps/web/src/index.css:20,29,46`). So most theming is **automatic**.
- Thin override on top, mirroring apps/www's pattern but with warm hex:
  `variables:{ colorPrimary:'#e9a52c', colorBackground:'#14110b', colorText:'#…', borderRadius:'8px'
  (=--r-sm, index.css:176), fontFamily:'Hanken Grotesk, system-ui' }`.
- Light/dark: Clerk's default theme respects CSS `color-scheme`; `apps/web/src/index.css:185` sets
  `color-scheme:dark` (+ a `[data-theme="light"]` block at `:192`). Theme stacking
  `[shadcn, dark]` or `color-scheme`-driven both work; reconcile with the existing `ThemeProvider`.
- apps/www's `layout.tsx:31-34` carries a real gotcha to copy: **do NOT use `as const`** on the
  appearance object (over-narrows Clerk's `Appearance` union and silently drops `baseTheme`).

### 5.4 Prebuilt vs custom-flow components (what the design needs)
Screen 13 (`SCREENS.md:269-278`) wants: split brand panel + form; **Sign in (Google/Apple SSO +
email/password)**, **Sign up**, **6-box OTP Verify (auto-advance, backspace nav)**, **SSO/enterprise**.

| Design element | Clerk mapping | Real/Build |
|---|---|---|
| Sign in / Sign up form | Prebuilt `<SignIn/>` / `<SignUp/>` (themed) — cheapest, proven in apps/www | REAL component, themed = small build |
| Google/Apple SSO | Clerk social connections (config in Clerk dashboard) — rendered by prebuilt comps automatically | EXTERNAL-DEP (OAuth creds in dashboard) |
| Email/password | Clerk default — prebuilt | REAL |
| **6-box OTP Verify** | This is Clerk's **email-code verification step**, which `<SignIn/>`/`<SignUp/>` render *as their own UI*. The design's bespoke 6-box auto-advance widget = **custom flow** via `useSignIn`/`useSignUp` (`clerk-custom-ui` core-3) **only if** they want the exact 6-box look; otherwise accept Clerk's built-in code input. | DERIVABLE (prebuilt) or MUST-BUILD (custom 6-box) — **founder choice** |
| SSO/SAML/SCIM → Teams/KVARK | Clerk **Organizations/Enterprise SSO** (`clerk-orgs`) — a "note → Teams/KVARK", not a live SAML flow in PR7 | note only; Orgs are a later/Teams concern |
| User row in sidebar (PR1 left `userName={null}`, BUILD-PLAN §9) | `<UserButton/>` (prebuilt popover) or `useUser()` to thread `HomeBriefing.userName` | DERIVABLE |

**Recommendation:** use **prebuilt `<SignIn/>`/`<SignUp/>` themed** for v1 (matches apps/www, lowest risk,
"Build with Clerk components themed to the tokens" is literally the design note, `SCREENS.md:277-278`).
Only drop to `useSignIn` custom flow if the founder insists on the pixel-exact 6-box OTP widget.

---

## 6. Billing half of PR7 (screen 14) — mostly already REAL (brief note; not my topic)

Flagged because PR7 bundles Auth+Billing and the honesty contract spans both:
- `apps/web/src/hooks/useBilling.ts` **already exists** — `getTier`, `createCheckoutSession('PRO'|'TEAMS')`,
  `createPortalSession`, `syncStripeCheckout(sessionId)`, post-redirect `?session_id=` auto-sync
  (`useBilling.ts:34-115`). Adapter methods at `adapter.ts:2658-2676`.
- Server Stripe module exists: `packages/server/src/stripe/{checkout,portal,webhook,sync,index}.ts`.
- ⇒ Screen 14 is largely a **re-skin of the existing flow to warm tokens** + Stripe-hosted
  Checkout/Customer-Portal (open in browser). **No card form is implemented in-app** today and the
  design's "card 4242…, expiry/CVC" panel must **not** be hand-rolled — route to Stripe Checkout.
- **Blocked decision (DESIGN_POV §4, `DESIGN_POV.md:62-70`):** BYO-key vs Waggle-metered inference.
  This reshapes Billing/Onboarding/Usage and "must be settled before Billing goes live"
  (`DESIGN_POV.md:89`). Surface to founder before building screen 14.

---

## 7. FABRICATION RISKS (must be gated off — honesty contract)

PR7 is the **highest fabrication-risk PR** because Auth+Billing both render identity/money:

1. **Fake logged-in identity.** With no `VITE_CLERK_PUBLISHABLE_KEY`, the SPA must show the
   **accountless** state, never a placeholder "signed-in" user, name, avatar, or email. The sidebar
   user row already correctly renders "Account"/"W" when `userName={null}` (BUILD-PLAN §9) — keep that
   honest; only populate from a **real** `useUser()` / `HomeBriefing.userName`.
2. **Fake invoices / receipts.** Screen 14 "invoices (Paid + PDF)" must come from Stripe
   (Customer Portal), never a hardcoded invoice list. If no Stripe customer exists → empty/"manage in
   portal", not invented rows.
3. **Fake payment method.** "VISA ···4242, Update" must reflect a real Stripe payment method or render
   the empty/portal state. Do NOT ship a literal `···4242` as if it were the user's card.
4. **Fake usage / "Due today $19".** Trial-aware amounts must come from the real tier
   (`useBilling.tierResolved`, `useBilling.ts:16-22` — it explicitly forbids presenting the `FREE`
   default as fact) and Stripe price data, never a static string.
5. **Fake card-entry form.** The design shows a card form ("encrypted & secure, Powered by Stripe").
   Collecting card data in-app is both a fabrication trap and a PCI risk — **use Stripe Checkout**,
   render the form only as Stripe's hosted/embedded element.
6. **Fake SSO success.** SSO buttons must do a real Clerk redirect; never simulate "Signed in with
   Google" without a Clerk session.
7. **Tier never silently FREE.** Already enforced by `useBilling.tierResolved` — keep any new auth/billing
   surface honoring it (render "unresolved", not the FREE upgrade grid, until a real round-trip).

---

## 8. What's REAL vs DERIVABLE vs MUST-BUILD vs EXTERNAL-DEP

| Feature | Status | Note |
|---|---|---|
| Clerk JS SDK + JWT model | REAL | `@clerk/fastify` server verify (`plugins/auth.ts`), `@clerk/nextjs` themed (`apps/www/layout.tsx`) |
| Clerk in `apps/web` SPA | MUST-BUILD | add `@clerk/clerk-react` + `ClerkProvider` in `main.tsx`; **none today** |
| Themed appearance (warm tokens) | DERIVABLE | shadcn theme auto-reads warm shadcn vars (`index.css:20,29,46`) + thin `variables` override; pattern proven in `apps/www/layout.tsx:35-93` |
| Prebuilt `<SignIn/>`/`<SignUp/>`/`<UserButton/>` | REAL (Clerk) | design says "Build with Clerk components themed" (`SCREENS.md:277`) |
| Bespoke 6-box OTP widget | MUST-BUILD (optional) | only if not accepting Clerk's built-in code step; `useSignIn` custom flow |
| `getToken()` → existing Bearer adapter | DERIVABLE | adapter already sends `Authorization: Bearer` (`adapter.ts:445`); server already verifies (`plugins/auth.ts:31`) |
| Accountless local-first default | REAL | sidecar loopback token + FREE config (`local/index.ts:2047-2052`, `settings.ts:318`) |
| Billing flow (checkout/portal/sync/tier) | REAL | `useBilling.ts` + adapter + `server/src/stripe/*` all exist |
| In-app card form | EXTERNAL-DEP (Stripe-hosted) | do not hand-roll; Stripe Checkout |
| Google/Apple SSO, SAML/SCIM | EXTERNAL-DEP | OAuth creds + Clerk Orgs/Enterprise config in Clerk dashboard |
| `VITE_CLERK_PUBLISHABLE_KEY` for SPA | EXTERNAL-DEP | **founder must provide**; instance/keys already exist for apps/www/server |
| In-WebView desktop sign-in (Tauri) | UNKNOWN / spike | redirect/OAuth in WebView unproven; prior brief deferred to "Phase 2" (`…brief:225`) |

---

## 9. Decisions the founder must make before PR7 builds screen 13

1. **Architecture:** confirm Option **(b)** — optional Clerk, accountless default. (Recommended.)
   Blast radius: defines `main.tsx` provider wrapping + the no-key fallback for the whole SPA.
2. **Surface scope:** does screen 13 ship as a **browser/cloud-served** surface first (proven), with
   **in-WebView Tauri sign-in** as an explicit follow-up spike? (Recommended yes.)
3. **OTP UI:** accept Clerk's built-in verification step (cheap, prebuilt) vs MUST-BUILD the pixel-exact
   6-box widget via `useSignIn`. (Recommend prebuilt for v1.)
4. **EXTERNAL-DEP:** provide `VITE_CLERK_PUBLISHABLE_KEY` (reuse existing instance) + confirm
   Google/Apple social connections are enabled in the Clerk dashboard.
5. **Billing prerequisite (DESIGN_POV §4):** BYO-key vs Waggle-metered — settle before screen 14.

---

## 10. Honesty log / discrepancies surfaced

- The task framing assumed `clerk-react-router-patterns` might apply. It does **not** — that skill is
  for React-Router **v7 framework mode** (SSR loaders + `clerkMiddleware`). This app is RR6 SPA ⇒
  `@clerk/clerk-react` (`clerk-react-patterns`) is the correct skill. Documented to prevent a wrong build.
- apps/www's themed Clerk uses the **old cooler** Hive hex (`#08090c`/`#e5a000`,
  `apps/www/layout.tsx:38-44`). Copy the *pattern*, not the *hex* — apps/web is warm
  (`#14110b`/`#e9a52c`, `index.css:20,29`).
- `@clerk/react` is in `node_modules` (transitive via nextjs) but **not** an apps/web dep — do not
  assume it's "already installed" for the SPA.
- Server `authenticate`/team-mode is gated on `CLERK_SECRET_KEY` presence; the desktop default (no key)
  is the accountless path. PR7 must not assume Clerk is always on.

# CC Sesija E Brief — Clerk Auth + Stripe-Clerk Linkage + FR Pass8-A Logo Fix

**Date:** 2026-05-03 (nedelja popodne)
**Status:** READY for paste — Marko ratifikovao svih 4 sub-decisions ("sve ok po tvom predlogu")
**Predecessors:** CC Sesija D CLOSED 2026-05-02 (apps/www Next.js 15 production-ready, all 16 amendment §3 acceptance PASS)
**Authority:** PM session 2026-05-03 (Clerk arhitektura Opcija B ratified, Min auth scope + Modal sign-in + /account placeholder + Connected Stripe-Clerk)
**Cost cap:** $15 hard / $12 halt — Clerk install + auth flow + middleware + Stripe webhook + logo fix; expected $2-5 LLM spend
**Repo:** D:\Projects\waggle-os (apps/www workspace)

---

## §0 — Marko-side action sequence pre CC kickoff

**(a) Rotate Clerk secret key (1 min):**
- Clerk Dashboard → API Keys → 3-dot menu pored "Secret key" → Regenerate
- Copy novi `sk_test_*` (NE u chat — paste u .env.local kasnije per §1.3 below)

**(b) Install Clerk skills za CC (optional, 1 min):**
- `npx skills add clerk/skills`
- Skills give CC native Clerk knowledge without doc lookup overhead

**(c) Verify Clerk Dashboard sub-config (5 min):**
- User & Authentication → Email, Phone, Username → ensure **Email** + **Password** enabled
- User & Authentication → Social Connections → enable **Google** + **GitHub** (Clerk-shared OAuth keys default OK za dev; production OAuth credentials post Day 0 minus 1)
- Customization → Branding → upload Waggle bee SVG (path: D:\Projects\waggle-os\apps\www\public\brand\waggle-logo.svg) + application name "Waggle"

**(d) Confirm Stripe Dashboard ready za webhook setup:**
- Marko može da preskoči ovo dok ne uradi Stripe live keys (sutra ponedeljak), ali će CC pripremiti webhook handler skeleton — Marko paste-uje webhook secret u .env.local kad bude imao live Stripe webhook configured

---

## §1 — Implementation scope (3 work units)

### §1.1 — Clerk integration (Min scope)

**Per ratifikacija 2026-05-03:**

- **Auth scope:** Min — sign-in + sign-up + middleware za protected routes
- **Surface:** Modal sign-in/sign-up (`<SignInButton mode="modal">`, `<SignUpButton mode="modal">`)
- **Account management:** `/account` page sa Clerk's `<UserProfile>` prebuilt component
- **Sign-in destination:** Top nav "Sign in" button (currently placeholder per amendment §3 #4 Sesija D carryover) → opens Clerk modal

**Code structure:**

```
apps/www/
├── app/
│   ├── account/
│   │   └── page.tsx                    # NEW — server component sa <UserProfile>
│   ├── sign-in/
│   │   └── [[...sign-in]]/
│   │       └── page.tsx                # NEW — fallback page (modal je primary)
│   ├── sign-up/
│   │   └── [[...sign-up]]/
│   │       └── page.tsx                # NEW — fallback page (modal je primary)
│   ├── api/
│   │   └── webhooks/
│   │       └── clerk/
│   │           └── route.ts            # NEW — Clerk webhook handler za Stripe linkage
│   ├── layout.tsx                      # MODIFY — wrap sa <ClerkProvider>
│   └── _components/
│       └── Navbar.tsx                  # MODIFY — replace placeholder "Sign in" sa Clerk components
├── proxy.ts                            # NEW — clerkMiddleware() per Clerk Next.js docs (newer naming convention)
└── .env.local                          # MODIFY — add Clerk env vars
```

**Per Clerk docs (Marko-paste-ovani snippet):**
- `proxy.ts` ne `middleware.ts` (newer Clerk convention)
- `clerkMiddleware()` from `@clerk/nextjs/server`
- `<ClerkProvider>` inside `<body>` u `app/layout.tsx`
- `<Show when="signed-in">` / `<Show when="signed-out">` ne deprecated `<SignedIn>` / `<SignedOut>`
- Imports samo from `@clerk/nextjs` ili `@clerk/nextjs/server`

**Navbar integration:**

```typescript
// apps/www/app/_components/Navbar.tsx (excerpt)
import { Show, SignInButton, UserButton } from '@clerk/nextjs';

// Replace placeholder "Sign in" CTA sa:
<Show when="signed-out">
  <SignInButton mode="modal">
    <button className="...">Sign in</button>  // Use existing styled button class
  </SignInButton>
</Show>
<Show when="signed-in">
  <UserButton afterSignOutUrl="/" />
</Show>
```

**Pricing tier CTA integration:**

Per amendment §1.6, Pricing has 3 CTAs:
- Solo: "Download for {os}" → no auth needed (Solo offline-first per Opcija B arhitektura)
- Pro: "Start free trial" → MORA Clerk authenticated user pre Stripe checkout
- Teams: "Start team trial →" → MORA Clerk authenticated user pre Stripe checkout

Update Pricing.tsx Pro/Teams CTAs:
```typescript
import { Show, SignUpButton } from '@clerk/nextjs';
import { useUser } from '@clerk/nextjs';

// Pro tier CTA:
<Show when="signed-out">
  <SignUpButton mode="modal" forceRedirectUrl="/api/stripe/checkout?tier=pro">
    <button>Start free trial</button>
  </SignUpButton>
</Show>
<Show when="signed-in">
  <button onClick={() => /* call /api/stripe/checkout?tier=pro */}>Start free trial</button>
</Show>
```

### §1.2 — Stripe-Clerk Connected linkage

**Per ratifikacija 2026-05-03 ("Connected"):** Stripe Customer ID stored u Clerk user.publicMetadata.

**Flow:**
1. User signs up via Clerk → Clerk webhook fires `user.created` event
2. `app/api/webhooks/clerk/route.ts` handler kreira Stripe Customer (kroz Stripe SDK) sa user email + metadata
3. Updates Clerk user.publicMetadata.stripeCustomerId = `cus_*`
4. User klikne "Start free trial" (Pro/Teams) → `/api/stripe/checkout` route čita Clerk userId → fetches user.publicMetadata.stripeCustomerId → creates Stripe Checkout Session sa pre-existing customer
5. Posle Stripe checkout success, Stripe webhook fires `checkout.session.completed` → `/api/webhooks/stripe/route.ts` updates Clerk user.publicMetadata sa subscription tier (`pro` | `teams`) + status (`active` | `canceled`)

**Webhook handlers needed:**

```
/api/webhooks/clerk/route.ts   — handles user.created (creates Stripe Customer)
/api/webhooks/stripe/route.ts  — handles checkout.session.completed + customer.subscription.updated
```

**Webhook signature verification:**
- Clerk webhook signature uses `svix` library — verify via `CLERK_WEBHOOK_SECRET` env var
- Stripe webhook signature uses `stripe-signature` header — verify via `STRIPE_WEBHOOK_SECRET` env var
- Both secrets are Marko-side post-launch action (set up webhooks in respective dashboards, paste secrets u .env.local)

### §1.3 — Environment variables

Update `apps/www/.env.local` (gitignored, NEVER committed):

```bash
# Clerk (Marko fills publishable + secret keys after rotation)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_ZWxlZ2FudC1jYW1lbC04LmNsZXJrLmFjY291bnRzLmRldiQ
CLERK_SECRET_KEY=sk_test_REPLACE_AFTER_ROTATION

# Clerk webhook signing secret (Marko-side post-Clerk webhook setup)
CLERK_WEBHOOK_SECRET=whsec_REPLACE_AFTER_WEBHOOK_SETUP

# Clerk redirect URLs
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/account
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/account

# Stripe (existing per CC Sesija D §3.1; Marko-side ponedeljak finance)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_REPLACE_ME
STRIPE_SECRET_KEY=sk_test_REPLACE_ME
STRIPE_WEBHOOK_SECRET=whsec_REPLACE_ME
STRIPE_PRICE_PRO_MONTHLY=price_REPLACE_ME
STRIPE_PRICE_PRO_ANNUAL=price_REPLACE_ME
STRIPE_PRICE_TEAMS_MONTHLY=price_REPLACE_ME
STRIPE_PRICE_TEAMS_ANNUAL=price_REPLACE_ME
```

**CC creates `.env.local.example` skeleton** sa svim placeholder-ima + dodaje `.env.local` u `.gitignore` ako nije već.

**Marko-side action posle CC ships:**
- Paste rotated secret key direct u `.env.local` (replace `sk_test_REPLACE_AFTER_ROTATION`)
- Setup Clerk webhook (Dashboard → Webhooks → Add endpoint `https://localhost:3001/api/webhooks/clerk` for dev or production URL) → paste webhook secret u `CLERK_WEBHOOK_SECRET`

### §1.4 — FR Pass8-A logo asset fix

**Bug:** Top nav shows "Wac" placeholder text umesto SVG bee logo (per PM Pass 8 verifikacija 2026-05-02).

**Diagnosis steps for CC:**
1. Inspect `apps/www/app/_components/Navbar.tsx` (or wherever logo render lives)
2. Look for `<Image src="..." alt="Waggle" />` or similar — verify path is `/brand/waggle-logo.svg` (NOT `/waggle/brand/...` Vite-relative legacy)
3. Verify `apps/www/public/brand/waggle-logo.svg` exists
4. If image asset missing, check ako jeste copy iz src/components legacy ili da li se referencira hive-mind subtree
5. Likely fix: simple path correction OR `next/image` `<Image>` component sa correct `width`/`height` prop required by Next.js 15

**Acceptance:** Top nav renders SVG bee logo cleanly. Verified via npm run dev + browser load.

---

## §2 — Acceptance criteria

CC Sesija E ships kada:

1. ✅ `npm install @clerk/nextjs` clean
2. ✅ `proxy.ts` exports `clerkMiddleware()` u apps/www root
3. ✅ `<ClerkProvider>` wraps `app/layout.tsx` body content
4. ✅ Top nav "Sign in" CTA opens Clerk modal (`<SignInButton mode="modal">`)
5. ✅ Sign up flow creates Clerk user + fires Clerk webhook → creates Stripe Customer → updates Clerk user.publicMetadata.stripeCustomerId
6. ✅ `/account` route renders Clerk's `<UserProfile>` for signed-in user (redirects to sign-in if not authenticated)
7. ✅ Pro/Teams pricing CTAs use `<SignUpButton mode="modal" forceRedirectUrl="/api/stripe/checkout?tier=pro">` for signed-out users
8. ✅ `/api/stripe/checkout` reads Clerk userId via `auth()`, fetches Stripe Customer ID from user.publicMetadata, creates Checkout Session
9. ✅ `/api/webhooks/stripe` handles checkout.session.completed → updates Clerk user.publicMetadata sa subscription tier + status
10. ✅ FR Pass8-A logo asset fix: top nav renders SVG bee logo cleanly
11. ✅ next build clean (no warnings beyond Clerk recommendation messages)
12. ✅ npx tsc --noEmit clean
13. ✅ npx vitest run all tests passing (existing 10 BrandPersonasCard tests + any new)
14. ✅ Lighthouse rerun: Performance ≥85 / Accessibility ≥95 / SEO ≥95 (allow drop from 96/96/100 ako Clerk modal adds JS overhead, but stay above floor)
15. ✅ `.env.local.example` updated sa svim Clerk + Stripe env vars + comments
16. ✅ Final commit summary sa 5-8 commits manifest

---

## §3 — Halt-and-PM triggers

CC HALT + report ako:

- Clerk webhook signature verification ne radi → halt + diagnostic
- Stripe Customer creation ne radi → halt + check Stripe SDK setup (sigurno postoji od Sesija D §3.1)
- Auth middleware blocks legitimate routes (e.g., `/`, `/docs/methodology`, `/sign-in`, `/sign-up`) → halt + middleware config review
- next build break > 30 min retry → halt + diagnostic
- Cumulative spend > $12 → halt + report
- Lighthouse drop below 85/95/95 → halt + perf review
- Logo fix requires non-trivial asset migration (e.g., SVG file missing) → halt + Marko-side asset provision

---

## §4 — Out of scope (eksplicitno, ne raditi)

- Desktop Tauri Clerk integration — Phase 2 fast-follow, NOT Day 0 (per Opcija B arhitektura)
- Custom domain configuration `clerk.waggle-os.ai` — Production instance setup, post Day 0 minus 1
- Production OAuth credentials (Google + GitHub Cloud Console / Developer settings) — Day 0 minus 1, koristi Clerk-shared dev keys za sad
- Multi-factor authentication (MFA) — Day-2 polish ili Phase 2
- Organizations (Teams) Clerk feature — currently single-user only za Day 0; Teams comes post-launch
- KVARK enterprise sovereign auth integration — separate track, custom on-prem auth
- Email customization (welcome emails, password reset templates) — Day-2 polish
- Custom sign-in UI (replace Clerk's default Account Portal sa branded version) — Day-2 polish, Standard scope upgrade

---

## §5 — Sequencing inside CC sesija

CC executes po ovom redu (each step ratifies before proceeding to next):

1. **§5.0 Preflight evidence dump (HALT-AND-PM):** git status + npm run build clean baseline + verify Clerk publishable key works (curl test) + verify Stripe SDK already installed → PM ratifies
2. **§5.1 Clerk install + scaffold:** npm install @clerk/nextjs + create proxy.ts + wrap ClerkProvider in layout + add Clerk env vars → commit "feat(www): scaffold Clerk integration"
3. **§5.2 Auth UI:** Modify Navbar.tsx + create /sign-in + /sign-up fallback routes + create /account page → commit "feat(www): wire Clerk auth UI in navbar + account page"
4. **§5.3 Stripe-Clerk linkage:** Create /api/webhooks/clerk + modify /api/stripe/checkout (add Clerk auth check + Customer ID fetch) + create /api/webhooks/stripe → commit "feat(www): connect Stripe Customer to Clerk user metadata"
5. **§5.4 Pricing CTAs:** Update Pro/Teams pricing CTAs to require Clerk auth → commit "feat(www): gate Pro/Teams checkout behind Clerk signup"
6. **§5.5 Logo asset fix:** Diagnose + fix FR Pass8-A → commit "fix(www): correct Waggle logo asset path in navbar"
7. **§5.6 Final verification:** Lighthouse rerun + tsc + vitest + screenshot demo flow (signed-out → sign-up → /account → signed-in nav state) → commit "test(www): Sesija E final verification + screenshots"

Each commit triggers Marko ratification via PM (paste-ready format ako CC needs ratification mid-flight).

---

**End of brief. Marko paste-uje paste-ready CC kickoff prompt iz §6 below.**

---

## §6 — Paste-ready CC Sesija E kickoff prompt

```
=== CLAUDE CODE SESSION E — Clerk auth + Stripe-Clerk linkage + FR Pass8-A logo fix ===

Mode: SUPPORT (work main branch directly, commit per logical milestone, halt-and-PM on listed triggers)

REPOSITORY CONTEXT
- Working repo: D:\Projects\waggle-os
- Target subfolder: D:\Projects\waggle-os\apps\www
- Current state: Sesija D CLOSED (12 commits, 16/16 acceptance, Lighthouse 96/96/100, all v3.2 copy locks live)
- Migration target: Clerk auth integration + Stripe-Clerk Connected linkage + logo asset fix

BRIEF (read before starting)
- D:\Projects\PM-Waggle-OS\briefs\2026-05-03-cc-sesija-E-clerk-stripe-linkage-logo-fix.md (full §1-§5 spec)

CLERK CONFIG (env-ready)
- Publishable key: pk_test_ZWxlZ2FudC1jYW1lbC04LmNsZXJrLmFjY291bnRzLmRldiQ
- Secret key: Marko paste-uje DIRECT u .env.local posle rotation (CC ne tu-ches secret key value, samo references)
- Dev domain: elegant-camel-8.clerk.accounts.dev (auto-verified)
- Production custom domain: deferred post-Day-0

REFERENCE DOCS (Marko-supplied)
- Clerk Next.js App Router quickstart (paste-ovan u session, NEW conventions: proxy.ts not middleware.ts, <Show> not <SignedIn>)
- Per Clerk docs Rules:
  ALWAYS: clerkMiddleware() in proxy.ts | <ClerkProvider> inside <body> in layout.tsx | imports from @clerk/nextjs | App Router | <Show> components
  NEVER: authMiddleware() | _app.tsx | pages router | <SignedIn>/<SignedOut> deprecated
- Optional: Marko ran `npx skills add clerk/skills` pre kickoff (CC has native Clerk knowledge)

SEQUENCING (strict, halt-and-PM after each)

§5.0 — PREFLIGHT EVIDENCE DUMP (HALT-AND-PM)
1. git status + git log -10 origin/main..HEAD (verify clean, sync with origin)
2. npm run build --workspace=apps/www (verify Sesija D baseline still green)
3. curl -X GET https://api.clerk.com/v1/users (with secret key — quick API liveness check; or use SDK ping)
4. Check ako stripe@^21.0.1 dependency u apps/www/package.json (per Sesija D §3.1)
5. Check ako .env.local exists u apps/www (create skeleton ako ne)
6. Check apps/www/public/brand/ za waggle-logo.svg (FR Pass8-A diagnosis)

After §5.0 → STOP. Output findings as numbered list. Wait for PM ratifikaciju.

§5.1 — CLERK INSTALL + SCAFFOLD
- npm install @clerk/nextjs --workspace=apps/www
- Create apps/www/proxy.ts sa clerkMiddleware() + matcher config
- Modify apps/www/app/layout.tsx — wrap <ClerkProvider> inside <body>
- Update apps/www/.env.local sa Clerk env vars (publishable key value, secret key as REPLACE_AFTER_ROTATION placeholder)
- Update apps/www/.env.local.example mirror sa svim placeholder vars
- Verify .env.local in .gitignore
- Commit: "feat(www): scaffold Clerk integration"

§5.2 — AUTH UI
- Modify apps/www/app/_components/Navbar.tsx — replace placeholder "Sign in" sa <Show when="signed-out"><SignInButton mode="modal" /></Show> + <Show when="signed-in"><UserButton /></Show>
- Create apps/www/app/sign-in/[[...sign-in]]/page.tsx — fallback page sa <SignIn />
- Create apps/www/app/sign-up/[[...sign-up]]/page.tsx — fallback page sa <SignUp />
- Create apps/www/app/account/page.tsx — server component sa <UserProfile />
- Apply Hive DS tokens (hive-950 bg, hive-100 fg, honey-500 accent) to Clerk components via appearance prop ili CSS variables
- Commit: "feat(www): wire Clerk auth UI in navbar + account page"

§5.3 — STRIPE-CLERK LINKAGE
- Create apps/www/app/api/webhooks/clerk/route.ts — handles user.created event, creates Stripe Customer, updates Clerk user.publicMetadata.stripeCustomerId
- Modify apps/www/app/api/stripe/checkout/route.ts — add Clerk auth() check (return 401 if signed-out), fetch Stripe Customer ID from user.publicMetadata, create Checkout Session for that customer
- Create apps/www/app/api/webhooks/stripe/route.ts — handles checkout.session.completed + customer.subscription.updated, updates Clerk user.publicMetadata sa subscription tier + status
- Use svix (Clerk webhook lib) for signature verification on Clerk webhook
- Use stripe.webhooks.constructEvent() for Stripe webhook
- Commit: "feat(www): connect Stripe Customer to Clerk user metadata"

§5.4 — PRICING CTAs
- Update apps/www/app/_components/Pricing.tsx — Pro + Teams CTAs use <SignUpButton mode="modal" forceRedirectUrl="/api/stripe/checkout?tier=pro"> for signed-out, direct fetch for signed-in
- Solo CTA unchanged (offline-first, no auth needed)
- Commit: "feat(www): gate Pro/Teams checkout behind Clerk signup"

§5.5 — LOGO ASSET FIX (FR Pass8-A)
- Diagnose Navbar.tsx logo render — verify <Image src="/brand/waggle-logo.svg" /> path
- Fix path or component as needed
- Verify visual: top nav renders SVG bee logo cleanly
- Commit: "fix(www): correct Waggle logo asset path in navbar (FR Pass8-A)"

§5.6 — FINAL VERIFICATION
- npm run build clean (no warnings beyond Clerk recommendation messages OK)
- npx tsc --noEmit clean
- npx vitest run all tests passing
- Lighthouse rerun: ≥85/95/95
- Take screenshots: signed-out homepage + sign-up modal + signed-in /account + signed-in homepage (UserButton visible)
- Update apps/www/SESIJA-E-MANIFEST.md sa 5-8 commits manifest + acceptance grid
- Commit: "test(www): Sesija E final verification + screenshots"

ACCEPTANCE per §2 brief — 16 criteria. PM Pass 9 will run after CC notification.

HALT-AND-PM TRIGGERS per §3
OUT OF SCOPE per §4 (do NOT do)

Cost cap: $15 hard / $12 halt. Standing by za §5.0 preflight evidence dump.
```

---

**End of brief. CC ships ready-to-paste prompt above. PM Pass 9 will follow CC notification.**

# Sesija E Manifest — Clerk auth + Stripe-Clerk linkage + branding fixes

**Date:** Started 2026-05-03, last entry 2026-05-04
**Branch:** main (SUPPORT mode — work main directly, commit per logical milestone)
**Brief:** CC Sesija E — Clerk auth + Stripe-Clerk linkage + FR Pass8-A logo fix
**Cost cap:** $15 hard / $12 halt
**Status:** §5.0–§5.3 COMPLETE · §5.4 / §5.5 / §5.6 PENDING

---

## Commit ledger (4 commits to date — extends through §5.6)

| # | SHA | Phase | Description |
|---|---|---|---|
| 1 | `4365897` | §5.0 | Scaffold Clerk integration (deps + middleware + ClerkProvider in layout) |
| 2 | `d281a86` | §5.1 + §5.2 | Wire Clerk auth UI in navbar + account page (`SignedIn` / `SignedOut`, `/account` `UserProfile`) |
| 3 | `0147d6c` | §5.3 Phase A | Provision Stripe test-mode prices via CLI — Path A idempotent reuse, no new products created |
| 4 | `a087cf6` | §5.3 Phase C | Connect Stripe Customer to Clerk user.publicMetadata via lazy-create pattern; add webhook handler |
| 5 | (this) | §5.3 Phase E | Manifest + smoke-test instructions |

---

## §5.3 Stripe catalog state (test mode, account `acct_1SzHlbC0mmjh4oEM`)

| Lookup key | Price ID | Amount | Product | Metadata |
|---|---|---|---|---|
| `pro_monthly` | `price_1TNZfkC0mmjh4oEMGAZ2PDbc` | $19/mo | `prod_UMIG4B7V0Ke6zQ` (Waggle Pro) | tier=pro, billing=monthly |
| `pro_annual` | `price_1TTN4FC0mmjh4oEMyaEX40Kl` | $190/yr | `prod_UMIG4B7V0Ke6zQ` (Waggle Pro) | tier=pro, billing=annual |
| `teams_monthly` | `price_1TNZfpC0mmjh4oEMH10c02YB` | $49/mo | `prod_UMIGZ99xtazCAs` (Waggle Teams) | tier=teams, billing=monthly, seat_minimum=3 |
| `teams_annual` | `price_1TTN4HC0mmjh4oEMsgKwV1MY` | $490/yr | `prod_UMIGZ99xtazCAs` (Waggle Teams) | tier=teams, billing=annual, seat_minimum=3 |

**Archived in Phase A** (older 2026-04-08 duplicates, no longer active):

- `prod_UG0WP8RCBvaiQ2` (Waggle Teams 2026-04-08, wrong amount)
- `prod_UG0Wk4DLVpsRwf` (Waggle Basic 2026-04-08, no longer in tier roadmap)

Recreating these IDs on a new Stripe account: see `apps/www/.env.local.example` for the CLI provisioning command template.

---

## §5.3 Phase B — Local webhook listener (Marko-side, separate terminal)

For local dev webhook testing, run in a terminal separate from `next dev`:

```powershell
cd D:\Projects\waggle-os
stripe listen --forward-to localhost:3001/api/webhooks/stripe --print-secret
```

Stripe CLI prints the signing secret (`whsec_...`) on first run — paste
it into `apps/www/.env.local` as `STRIPE_WEBHOOK_SECRET=whsec_...`. Leave
the listener running for the duration of the test session; the secret
itself is stable across restarts of the same `stripe listen` invocation.

**Why CC didn't run this:** `stripe listen` is a long-running process. CC
sessions can't host indefinitely-blocking foreground commands without
losing the rest of the conversation, so this is documented for Marko to
run instead. The webhook handler at `apps/www/app/api/webhooks/stripe/route.ts`
is fully implemented and waiting to receive deliveries once the secret
is pasted and the listener is up.

**Production webhook setup is Marko-side ponedeljak 14:00:**

1. Stripe Dashboard → Developers → Webhooks → "Add endpoint".
2. Endpoint URL: `https://waggle-os.ai/api/webhooks/stripe` (or whichever production deploy URL).
3. Subscribe to events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
4. Copy the new endpoint's signing secret into the production env as
   `STRIPE_WEBHOOK_SECRET=whsec_...` (production secret is **different**
   from the local `stripe listen` secret).
5. Live key swap: replace `STRIPE_SECRET_KEY=sk_test_...` with
   `STRIPE_SECRET_KEY=sk_live_...` in production env. The route accepts
   both `sk_test_*` and `sk_live_*` automatically — no code changes
   required.

---

## §5.3 Phase E — End-to-end smoke test

**Pre-conditions** (run once, then leave running):

| | Action |
|---|---|
| 1 | `STRIPE_SECRET_KEY=sk_test_*` (real value, not placeholder) is in `apps/www/.env.local` |
| 2 | `STRIPE_WEBHOOK_SECRET=whsec_*` (from `stripe listen --print-secret`) is in `apps/www/.env.local` |
| 3 | All 4 `STRIPE_PRICE_*` IDs in `apps/www/.env.local` (already done in §5.3 Phase A) |
| 4 | Terminal 1 — `cd D:\Projects\waggle-os && npx next dev -H 0.0.0.0 -p 3001 --workspace=apps/www` is running |
| 5 | Terminal 2 — `stripe listen --forward-to localhost:3001/api/webhooks/stripe` is running |

**Browser walkthrough:**

1. Visit `http://localhost:3001` → click **Sign up** in the navbar → complete Clerk sign-up (any test email, any password ≥ 8 chars).
2. Land on `/pricing` (or scroll to the pricing section on `/`).
3. On the **Pro** tier card, click "Start free trial" (or whatever the CTA is — see `landing.pricing.tiers.pro.cta` in `messages/en.json`).
4. The button currently POSTs to `/api/stripe/checkout` and opens the returned URL in a new tab. (§5.4 will migrate this to a GET-based redirect flow.)
5. On Stripe Checkout, use test card `4242 4242 4242 4242` (any future expiry, any 3-digit CVC, any ZIP).
6. After payment, Stripe redirects to `/account?checkout=success&session_id=cs_...`.

**Verify state:**

| Check | Where | Expected |
|---|---|---|
| Clerk user metadata | Clerk Dashboard → Users → your user → "Public metadata" tab | `stripeCustomerId: cus_...` · `subscriptionTier: pro` · `subscriptionStatus: active` |
| Stripe customer | Stripe Dashboard test mode → Customers → newest customer | `metadata.clerkUserId = <your Clerk user id>` |
| Webhook delivery | Terminal 2 (`stripe listen` log) | `checkout.session.completed [200]` · `customer.subscription.created [200]` · `customer.subscription.updated [200]` |
| Subscription on customer | Stripe Dashboard → Customers → your customer → Subscriptions | One active subscription on the price you selected (Pro monthly = `price_1TNZfkC0mmjh4oEMGAZ2PDbc`) |
| Checkout Session metadata | Stripe Dashboard → Payments → newest session → Metadata | `clerkUserId`, `tier`, `billing` all populated |

If any check fails: see Troubleshooting below.

---

## §5.3 Troubleshooting (smoke-test failure modes)

| Symptom | Likely cause | Fix |
|---|---|---|
| Pricing button click → 401 alert "Sign in required" | You haven't signed up / signed in yet | Sign up first via the navbar, then retry |
| Pricing button click → 503 "configuration required" | `STRIPE_SECRET_KEY` is still placeholder (`REPLACE_AFTER_ROTATION`) | Paste real `sk_test_*` from `stripe config --list` into `apps/www/.env.local`, restart `next dev` |
| Pricing button → 503 "No active Stripe price found" | `lookup_key` not set on the price (or env var is wrong) | Re-run §5.3 Phase A `stripe prices update` for the missing tier |
| Checkout completes but Clerk metadata stays empty | Webhook listener not running OR signature secret mismatch | Confirm `stripe listen` is up, secret in `.env.local` matches `--print-secret` output, restart `next dev` after pasting |
| `checkout.session.completed [400]` in `stripe listen` log | "Signature verification failed" — listener restarted with a new secret while old one is still in env | Copy fresh secret from listener's startup line, paste into `.env.local`, restart `next dev` |
| Webhook fires but Clerk metadata doesn't update | Session metadata missing `clerkUserId` (rare — only if checkout was created outside this app) | Inspect the offending session's metadata in Stripe Dashboard; the route always sets it on new sessions |
| Stripe customer created but Clerk `stripeCustomerId` not saved | Clerk publicMetadata write failed silently | Check `next dev` logs for Clerk errors; verify `CLERK_SECRET_KEY` is the freshly rotated key, not stale |

---

## §5.3 Phase D — Why no Clerk webhook is needed

The **lazy-create pattern** attaches a Stripe Customer at first paid
checkout, not at user creation. As a result:

- No `user.created` Clerk webhook handler is needed.
- `apps/www/app/api/webhooks/clerk/` is **not** created in §5.3.
- `CLERK_WEBHOOK_SECRET` in `.env.local` stays as
  `REPLACE_AFTER_WEBHOOK_REGISTERED` indefinitely (or remove the line).

**Trade-off:** a user who signs up and never reaches checkout has no
`stripeCustomerId` in their publicMetadata. That's correct — they
shouldn't have a Stripe customer record until they convert. The
checkout route's `ensureStripeCustomer` handles the gap on first pay.

If we later decide to support pre-paid features (e.g. trial without a
card), pre-creating Stripe customers eagerly via Clerk webhook becomes
useful. For now, lazy-create is simpler and avoids the
"orphan Stripe customer" failure mode.

---

## Out of scope (locked for §5.4+)

- **Pricing.tsx CTA gating** — §5.4 will migrate from `POST` + `window.open` to:
  - Signed-in users: GET `/api/stripe/checkout?tier=...&billing=...` → 303 to Stripe Checkout
  - Signed-out users: open `<SignUpButton>` modal with `forceRedirectUrl=/api/stripe/checkout?tier=...&billing=...` so they land on Stripe Checkout immediately after sign-up
- **POST backward-compat shim removal** — once §5.4 migrates Pricing.tsx, the POST handler in `/api/stripe/checkout/route.ts` is dead code and should be deleted.
- **FR Pass8-A logo fix** — §5.5 (filename mismatch in HeroVisual asset reference, root cause isolated in §5.0 brief).
- **§5.6 final verification** — full landing-page screenshot diff vs. Sesija D baseline + visual confirmation that Hive DS hasn't regressed.
- **Live keys + production webhook endpoint** — Marko-side ponedeljak 14:00.

---

## Day-2 polish backlog (post §5.6)

| Item | Severity | Source | Notes |
|---|---|---|---|
| Remove POST shim from `/api/stripe/checkout` | low | §5.3 Phase C | Once §5.4 migrates Pricing.tsx to GET, the POST handler is dead code — delete the function + its `runCheckout` POST branch. |
| Stripe customer email sync | medium | observed in route | `ensureStripeCustomer` sets email from Clerk's `primaryEmailAddress` once. If user changes email in Clerk, Stripe customer email goes stale. Consider a Clerk `user.updated` webhook OR periodic sync (low priority — Stripe's email is mainly used for receipts, which can be customized). |
| `subscriptionStatus: 'paused'` collapsed to `canceled` | low | `webhooks/stripe/route.ts` `mapStatus` | Stripe's `paused` is not technically canceled. If we ever support paid-tier pausing in the UI, distinguish. Current collapse is the "UI shows it as inactive" semantic. |
| Webhook idempotency | medium | best practice | Stripe can deliver the same event twice (rare but documented). Current handlers are idempotent for the metadata fields they touch (last-write wins is fine for status). If we add side effects like email sends, gate on `event.id` dedup table. |
| Production env vars | high (pre-launch) | §5.3 Phase B | Replace test-mode keys with `sk_live_*` + production `whsec_*`. Production prices may differ from test-mode prices — re-provision via CLI on the live account, capture new IDs, update production env. |
| Subscription receipts customization | low | Stripe default | Stripe sends receipts to `customer.email` by default. Verify with Marko whether the brand wants Stripe-default receipts or a custom outbound. |

---

## §5.3 acceptance criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Stripe catalog has 2 active products (Pro + Teams) with proper lookup_keys + metadata, no duplicates added | ✅ | Path A applied; `stripe products list --active=true \| grep -i waggle` shows exactly 2 |
| 2 | All 4 prices have `lookup_key` matching `${tier}_${billing}` and `metadata[tier]` + `metadata[billing]` set | ✅ | `stripe prices list \| jq '.data[] \| select(.lookup_key \| startswith("pro_") or startswith("teams_"))'` confirms |
| 3 | `apps/www/.env.local` has all 4 real `STRIPE_PRICE_*` IDs (no placeholders) | ✅ | gitignored; verified by Marko paste of secret + this commit's env update |
| 4 | `apps/www/.env.local.example` documents the 4 keys + CLI provisioning command | ✅ | Commit `0147d6c` |
| 5 | `/api/stripe/checkout` enforces auth, lazy-creates Stripe Customer, resolves price by lookup_key with env-pin fallback | ✅ | Commit `a087cf6` |
| 6 | `/api/webhooks/stripe` verifies signature + handles 3 event types + maps to Clerk publicMetadata | ✅ | Commit `a087cf6` |
| 7 | No Clerk webhook handler created (lazy-create pattern) | ✅ | `apps/www/app/api/webhooks/clerk/` does not exist |
| 8 | TypeScript compiles clean (`npx tsc --noEmit`) | ✅ | Verified post-Phase-C |
| 9 | Manifest documents Phase B (local listener) + Phase E (smoke test) + production webhook plan | ✅ | This document |
| 10 | Smoke test executable end-to-end | ⏸ Pending | Requires Marko to run with `stripe listen` — see Phase E walkthrough above |

**9 / 10 PASS · 1 pending Marko-side smoke run.**

# Stripe Smoke Test — Local End-to-End Verification

**Purpose:** Verify Waggle's Stripe integration works end-to-end without a production Stripe account. Uses the `stripe-cli` (https://github.com/stripe/stripe-cli) + Marko's Egzakta sandbox to simulate real webhook events against our local server.

**Scope:** Closes H-33 in `docs/plans/BACKLOG-MASTER-2026-04-18.md`.

**Status (2026-04-18):** ✅ **EXECUTED — 7/7 green.** See [Executed results](#executed-results-2026-04-18) at the bottom. The canonical automated replay is `packages/server/tests/stripe/smoke-e2e.test.ts` — run the one-liner in that section to re-verify at any time.

---

## Prerequisites

- Stripe CLI installed: `stripe --version` should report ≥ 1.40.0. Already present at `C:/Users/MarkoMarkovic/bin/stripe`.
- Stripe CLI logged in: `stripe config --list` should show `account_id` (Egzakta sandbox is fine).
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` set in the local environment or `.env`. The webhook secret is printed by `stripe listen` — copy it per the workflow below.
- Waggle sidecar running locally on `http://127.0.0.1:3333`.

## Test-mode price IDs

For local smoke you need two test-mode prices. Create once per sandbox:

```sh
# Pro tier — $19/mo
stripe prices create \
  --unit-amount=1900 \
  --currency=usd \
  --recurring="interval=month" \
  --product-data="name=Waggle Pro"

# Teams tier — $49/mo/seat
stripe prices create \
  --unit-amount=4900 \
  --currency=usd \
  --recurring="interval=month" \
  --product-data="name=Waggle Teams"
```

Set the returned `price_*` IDs as `STRIPE_PRICE_PRO` and `STRIPE_PRICE_TEAMS` env vars before starting the sidecar. These match the canonical tier names in `packages/shared/src/tiers.ts`.

## Smoke flow

### 1 · Start the webhook forwarder

In one terminal, forward live test events to your local server:

```sh
stripe listen --forward-to localhost:3333/api/stripe/webhook
```

Stripe CLI prints a webhook signing secret like `whsec_abc...` — copy it to `STRIPE_WEBHOOK_SECRET` in the sidecar's environment and restart the sidecar. The signing secret is stable across reconnects of the same CLI session.

### 2 · Trigger a checkout-completed event

In a second terminal:

```sh
stripe trigger checkout.session.completed
```

Expected: sidecar logs `event: checkout_completed`, and `config.json` at the data directory gains (or updates) `tier: 'PRO'` (default for the trigger template) plus `stripe_customer_id`. Verify with:

```sh
cat "$WAGGLE_DATA_DIR/config.json"
```

### 3 · Trigger a subscription-updated event

```sh
stripe trigger customer.subscription.updated
```

Expected: sidecar logs `event: subscription_updated`. If the triggered price matches `STRIPE_PRICE_PRO` or `STRIPE_PRICE_TEAMS`, `config.json.tier` updates accordingly. Otherwise the tier field stays unchanged (we only update on known price IDs).

### 4 · Trigger a subscription-cancelled event

```sh
stripe trigger customer.subscription.deleted
```

Expected: sidecar logs `event: subscription_cancelled`; `config.json.tier` becomes `FREE`.

### 5 · Idempotency check

Re-fire the same event:

```sh
stripe trigger checkout.session.completed
```

Expected: sidecar logs `event: webhook_duplicate_skipped` with the event ID. No config mutation on the second run (the `.stripe-processed-events.json` dedup file ensures this).

### 6 · Checkout session creation

From the web app or via curl:

```sh
curl -X POST http://127.0.0.1:3333/api/stripe/create-checkout-session \
  -H 'Content-Type: application/json' \
  -d '{"tier": "PRO"}'
```

Expected: `{ "url": "https://checkout.stripe.com/..." }`. Opening that URL should render Stripe's hosted checkout for the Pro test price.

### 7 · Billing portal

```sh
curl -X POST http://127.0.0.1:3333/api/stripe/create-portal-session
```

Expected: `{ "url": "https://billing.stripe.com/..." }`. Requires the user to have a `stripe_customer_id` in their config — set by flow 2 above.

## Checklist

- [ ] `stripe listen` active and forwarding to `/api/stripe/webhook`
- [ ] `checkout.session.completed` → tier updated + customer ID stored
- [ ] `customer.subscription.updated` → tier reflects new price
- [ ] `customer.subscription.deleted` → tier reverts to `FREE`
- [ ] Duplicate event ID is skipped, config unchanged
- [ ] `/api/stripe/create-checkout-session` returns a valid Stripe URL
- [ ] `/api/stripe/create-portal-session` returns a valid portal URL
- [ ] Existing Vitest suite green: `npx vitest run packages/server/tests/stripe`

## Next steps after smoke passes

- Promote to production: Marko creates production products + prices in Stripe dashboard ([M]-01).
- Swap sandbox → production price IDs in the production environment.
- Run the same smoke flow against production once.
- Wire the upgrade CTA in SettingsApp.tsx (already integrated with `useBilling.startCheckout`).

## Known gaps

- Production Stripe products don't exist yet ([M]-01 blocker). The sandbox smoke covers signature validation, tier mapping, idempotency, and routing. Production price IDs must be plugged in for real customer checkouts.
- Windows code-signing cert ([M]-08) needed before distribution; unrelated to Stripe smoke.

## Executed results (2026-04-18)

Egzakta sandbox `acct_1SzHlbC0mmjh4oEM` (test mode, CLI key expires 2026-05-11).

**Test-mode price IDs** — created via `stripe prices create` during the H-33 execution:

| Tier | Amount | Price ID |
|---|---|---|
| PRO   | $19 USD/mo | `price_1TNZfkC0mmjh4oEMGAZ2PDbc` |
| TEAMS | $49 USD/mo | `price_1TNZfpC0mmjh4oEMH10c02YB` |

These are sandbox-only. Production price IDs will be separate ([M]-01).

**Execution transcript** (from `packages/server/tests/stripe/smoke-e2e.test.ts`):

```
=== H-33 Stripe smoke checklist ===
  [x] 1. checkout.session.completed — tier=PRO + customer=cus_smoke_1
  [x] 2. customer.subscription.updated — PRICE_TEAMS → tier=TEAMS
  [x] 3. customer.subscription.deleted — tier reverted to FREE
  [x] 4. duplicate event dedup — resending evt_smoke_checkout_1 left tier on TEAMS (duplicate skipped)
  [x] 5. signature validation — bogus signature → 400 INVALID_SIGNATURE
  [x] 6. create-checkout-session — URL = https://checkout.stripe.com/c/pay/cs_test_b1...
  [x] 7. create-portal-session — customer=cus_<live> · URL = https://billing.stripe.com/p/session/test_...
```

**Coverage:** Signature validation, tier mapping (checkout-metadata + price-id paths), FREE revert on cancellation, dedup via `.stripe-processed-events.json`, 403 tier gate before checkout/portal, real Stripe API reachability (both checkout.sessions.create and billingPortal.sessions.create round-tripped cleanly).

### Re-running the smoke

```sh
# Required env — never commit these values.
STRIPE_KEY=$(stripe config --list | awk -F"'" '/test_mode_api_key/{print $2}')
cd D:/Projects/waggle-os

STRIPE_SECRET_KEY="$STRIPE_KEY" \
STRIPE_PRICE_PRO="price_1TNZfkC0mmjh4oEMGAZ2PDbc" \
STRIPE_PRICE_TEAMS="price_1TNZfpC0mmjh4oEMH10c02YB" \
WAGGLE_STRIPE_SMOKE=1 \
  npx vitest run packages/server/tests/stripe/smoke-e2e.test.ts
```

Without `WAGGLE_STRIPE_SMOKE=1` + the env vars the suite self-skips so CI stays green on developer machines that don't have a Stripe sandbox wired up.

### Production cutover checklist ([M]-01)

1. Create production products + prices in the Stripe dashboard. Use the canonical tier names — `Waggle Pro` ($19) and `Waggle Teams` ($49).
2. Replace `STRIPE_PRICE_PRO` / `STRIPE_PRICE_TEAMS` in the production env with the new `price_...` IDs.
3. Configure a production webhook endpoint at `https://<prod-host>/api/stripe/webhook` with signing secret piped into `STRIPE_WEBHOOK_SECRET`.
4. Re-run this smoke against production **exactly once**, then archive the price IDs in `docs/OPS/stripe-production.md` (new).
5. Wire the upgrade CTA in `SettingsApp.tsx` — already integrated via `useBilling.startCheckout`.

# P0 Readiness — Stripe + Windows Code Signing

**Drafted:** 2026-04-15
**Scope:** Backlog items #21 (Stripe) and #22 (Windows code signing + Tauri updater key). Both are **code-complete**; both are blocked on external credentials Marko has to obtain or supply.

This memo captures the exact state and the exact steps left to ship.

---

## #21 — Stripe products + webhook wiring

### Code state: COMPLETE (401 LOC across 5 files)

| File | LOC | Purpose |
|---|---|---|
| `packages/server/src/stripe/index.ts` | 81 | Price resolution (reads `STRIPE_PRICE_PRO` + `STRIPE_PRICE_TEAMS` from env), client init |
| `packages/server/src/stripe/checkout.ts` | 58 | POST checkout session → returns Stripe-hosted payment URL |
| `packages/server/src/stripe/webhook.ts` | 130 | Webhook handler — parses `checkout.session.completed`, `customer.subscription.updated`, `.deleted` → updates user tier |
| `packages/server/src/stripe/portal.ts` | 51 | Customer portal redirect (manage subscription) |
| `packages/server/src/stripe/sync.ts` | 81 | Back-fill stale subscription state (reconcile after downtime) |

### What Marko has to do (external, code can't do)

1. **Stripe Dashboard — create products + prices:**
   - Product 1: "Waggle Pro" — recurring monthly subscription, price $19 USD/mo
   - Product 2: "Waggle Teams" — recurring monthly subscription, price $49 USD/mo *per seat*
   - Copy the price IDs (look like `price_1Abc...`) from each product page

2. **Stripe Dashboard — webhook endpoint:**
   - Add endpoint: `https://<production-host>/api/stripe/webhook`
   - Subscribe to events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
   - Copy the signing secret (starts with `whsec_...`)

3. **Environment variables — production deployment:**
   ```
   STRIPE_SECRET_KEY=sk_live_...       # from Stripe → Developers → API Keys
   STRIPE_PUBLISHABLE_KEY=pk_live_...  # from same page
   STRIPE_WEBHOOK_SECRET=whsec_...     # from the webhook endpoint page
   STRIPE_PRICE_PRO=price_...          # from step 1
   STRIPE_PRICE_TEAMS=price_...        # from step 1
   ```
   For Vercel (per session-start guidance): use `vercel env add` for each.

4. **Post-setup smoke test:**
   - Trigger a Stripe test-card checkout (card `4242 4242 4242 4242`) against a staging env
   - Verify the webhook fires and the test user's tier upgrades in the `users` table
   - Verify the portal link works and can cancel the subscription
   - Verify downgrade path: after cancel, the tier falls back to FREE at period end

### Why this blocked this session

No Stripe dashboard access. No live secret keys in my scope. The smoke test needs a real Stripe account + payment source — this is Marko's step.

---

## #22 — Windows code signing + Tauri updater key

### Code state: UPDATER WIRED, SIGNING NOT CONFIGURED

**Wired (good):**
- `packages/server/src/index.ts` + `app/src-tauri/src/lib.rs` — Tauri updater plugin integrated (`tauri_plugin_updater::Builder::new().build()`)
- `app/src-tauri/tauri.conf.json:56-60` — `updater` block with a **pubkey** (base64-encoded). The corresponding private key is NOT in this repo (correctly).
- Updater permissions granted in `app/src-tauri/capabilities/` (allow-check, allow-download, allow-install)

**Missing:**

- `tauri.conf.json.bundle.windows.signingIdentity` (or `certificateThumbprint` + `digestAlgorithm` + `timestampUrl`)
- The actual `.pfx` code-signing certificate file (out-of-repo; lives on Marko's signing machine or in a cloud HSM)
- The updater's *private* signing key matched to the pubkey already in tauri.conf.json
- `latest.json` — the updater manifest (currently empty per the S2 handoff)

### What Marko has to do

1. **Obtain a Windows code-signing certificate.**
   - EV cert (Extended Validation, ~$300-500/yr): zero SmartScreen warnings from day one, highest trust. Recommended for an enterprise play with KVARK.
   - OV cert (~$100-200/yr): works but SmartScreen will warn until reputation builds (~weeks to months depending on download volume).
   - Vendors: DigiCert, SSL.com, Sectigo. Plan 1-3 days for EV (identity verification is manual).

2. **Store the cert outside the repo:**
   - Windows machine: import into cert store, note the thumbprint
   - OR: store `.pfx` in a secure location with a strong password in a secret manager (1Password, Hashicorp Vault, Windows DPAPI)
   - Never commit the cert or its password to git. Add the cert path and password reference to the build machine's env only.

3. **Generate the updater signing keypair** (if not already generated):
   ```
   npm run tauri signer generate -- -w ~/.tauri/waggle-updater.key
   ```
   This writes a keypair; the public key is what's in `tauri.conf.json:60` today, the private key stays local to the release machine. **Verify** the pubkey in `tauri.conf.json` matches the public half of the keypair Marko generates — if not, he'll need to update `tauri.conf.json` with the new pubkey and sign releases with the new private key. (A fresh keypair is simpler than backtracking which pubkey is in the current `tauri.conf.json`.)

4. **Update `tauri.conf.json`** — add a `bundle.windows` block:
   ```json
   "bundle": {
     "windows": {
       "certificateThumbprint": "<SHA1 thumbprint from step 2>",
       "digestAlgorithm": "sha256",
       "timestampUrl": "http://timestamp.digicert.com"
     }
   }
   ```

5. **Configure the build/release pipeline:**
   - Build machine needs: the cert, the updater private key, the pubkey-to-sign-against
   - CI: never store these in-repo. Use encrypted CI secrets (GitHub Actions repo secrets, Vercel env) and load at build time
   - Release workflow signs the installer via `tauri build` AND generates the updater signature for the `.nsis` / `.msi` artifact
   - Output `latest.json` is regenerated per release; hosted at a stable URL the updater polls

6. **Smoke test:**
   - Build a release with the cert wired
   - Right-click the `.msi` → Properties → Digital Signatures: should list Marko's org as signer, no warning
   - Install on a clean Windows VM: should NOT prompt "unknown publisher"
   - Bump the version number, build again, publish `latest.json`, run the installed app → should detect the update and install without user friction

### Why this blocked this session

No cert. No access to a Windows signing machine. The `tauri.conf.json` edits are trivial once the cert exists but meaningless without it.

---

## Suggested sequence once credentials are in hand

1. **Stripe first** (faster: ~1 day end-to-end once dashboard access is ready)
2. **Code signing second** (slower: EV cert verification takes 1-3 days; schedule in parallel with Stripe work)
3. Once both are live, tie them together in the "Teams tier live" launch: Stripe produces the subscription event → webhook updates the tier → signed binary is what users download → updater keeps them current.

## Rollback notes

- **Stripe:** webhook endpoint can be disabled in the dashboard in 30 seconds; tier updates stop; existing users keep their current tier until next renewal. Revenue loss but no data loss.
- **Code signing:** if a cert is compromised, revoke immediately with the issuing CA, generate a new one, rebuild, push a new `latest.json`. Existing installations continue to work (signed with the old cert); only NEW installs see the new signer.

## Summary

| Item | Code | Credentials | Action |
|---|---|---|---|
| #21 Stripe | ✅ Complete | Pending Marko | Create products → get price IDs → add env vars → smoke test |
| #22 Signing | ⚠️ Partial | Pending Marko | Buy cert → generate keypair → update `tauri.conf.json` → wire CI |

Both unblocked on my end. Both ready to ship within 1-3 business days of credentials in hand.

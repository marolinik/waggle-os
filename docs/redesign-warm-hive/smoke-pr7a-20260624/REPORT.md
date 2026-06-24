# PR7a Billing — Live Smoke (2026-06-24)

Branch `feature/warm-hive-pr7a`. Live-driven via chrome-devtools against a freshly-started
dev stack: sidecar **:3333** (`tsx src/local/start.ts`, TRIAL tier, **Stripe NOT configured** —
no `STRIPE_SECRET_KEY`) + vite **:8080** (proxies `/api` → 3333). Dark + light. **0 console errors throughout.**

The Stripe-unconfigured dev env is the *ideal* condition to prove the F8 honest state end-to-end.

## Verdict
**PASS.** Every adversarially-confirmed review fix verified against the running app. The smoke also
**caught a real regression the unit tests could not**: finding #4's glow fix (a Tailwind class swap)
still rendered `box-shadow: none` — a Tailwind v4 arbitrary-shadow gotcha. Fixed live to the proven
inline-style pattern and re-verified.

## What was verified (file:evidence)

| Finding / behavior | Expected (honest) | Live result | ✓ |
|---|---|---|---|
| **D12** `/settings?tab=billing` deep-link | snaps to Plan tab | Plan tab `aria-selected=true` | ✅ |
| **#7** §14 subhead | "Memory is free forever. You only pay for scale…" | renders (dark + light) | ✅ |
| **#6** TRIAL "Current" | trial ≠ purchasable plan → Solo NOT "Current"/"Your plan" | tier=TRIAL → Solo shows **"Included"**, no "Current" badge anywhere | ✅ |
| **#8** a11y | honest `aria-pressed` toggle buttons (not a false radiogroup) | Monthly/Annual are `button[aria-pressed]`; clicking flips pressed-state | ✅ |
| **#3 / F8** Stripe-not-configured | upgrade CTAs disabled **pre-click**, not a 503 after | probe `GET /api/stripe/status` → `configured:false` → Pro/Teams CTAs **"Unavailable" disabled** | ✅ |
| **#4** Pro "Most popular" glow | honey glow on the focal card | **was `none` even after class swap** → fixed to inline `boxShadow:var(--shadow-honey)` → renders `rgba(233,165,44,.25) 0 0 0 1px, rgba(233,165,44,.35) 0 8px 30px -10px` (dark + light) | ✅ (fixed in smoke) |
| Annual toggle (D8/F9 display) | price swaps to the real annual labels | Monthly $19/$49 → Annual **$15 / mo · billed yearly**, **$39 / seat · yearly** | ✅ |
| **F5** `/payment-success` no-fabrication | no completed checkout → honest, never a fake receipt | headline **"Nothing to confirm"**; no "You're Pro", **zero** receipt rows (no Trial-ends / Emailed / Receipt / $19.00 / VISA / ···4242) | ✅ |
| Console | 0 errors/warnings | clean on `/settings?tab=billing` (dark+light) and `/payment-success` | ✅ |

## The regression the smoke caught (#4 glow)
`shadow-[var(--shadow-honey)]` (Tailwind v4 arbitrary class) computed to `box-shadow: none` on the
Pro card — verified twice incl. a hard reload (`ignoreCache`). The sibling `border-[var(--honey-line)]`
from the *same* class string DID apply, so it's specific to the arbitrary-shadow-with-CSS-var utility,
not staleness. Injecting `style.boxShadow='var(--shadow-honey)'` resolved to the full glow, so the fix
is the **BenchmarkApp inline-style pattern** (`BenchmarkApp.tsx:367`). Re-verified: glow renders in
dark and light. (AskBar/ChatApp use `focus-within:shadow-[var(--shadow-honey)]` — unverified here,
flagged as possibly the same latent gotcha; out of PR7a scope.)

## Evidence
- `01-billing-plans-dark-annual.png` — dark, Annual selected: 3 cards, Pro glow, F8 "Unavailable" CTAs.
- `02-billing-plans-light.png` — light (warm paper `rgb(247,241,228)`): glow + tokens + F8 hold.

## Not exercised (no honest data source in this env)
- **Paid Success ("You're Pro") + Manage Portal launchpad** — needs a PRO/TEAMS tier + a real Stripe
  customer; covered by unit tests (`pr7a-billing.test.tsx`: synced-tier confirmation, success-race guard).
- **Enabled checkout CTAs / hosted-Checkout redirect** — needs `STRIPE_SECRET_KEY` in the sidecar env;
  the disabled F8 path is the honest state here and was the one under test.

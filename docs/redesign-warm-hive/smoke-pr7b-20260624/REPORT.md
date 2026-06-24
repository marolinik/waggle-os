# PR7b Auth (screen 13) — Live Smoke (2026-06-24)

Branch `feature/warm-hive-pr7b`. Live-driven via chrome-devtools against the dev stack
(sidecar :3333 + vite :8080). Clerk shared instance **elegant-camel-8** (`pk_test_…`).
Dark + light. **0 console errors throughout.**

## Verdict
**PASS.** Both phases verified against the running app.

## B1 — pre-shell route + accountless state (no Clerk SDK)
| Behavior | Live result | ✓ |
|---|---|---|
| `/auth` renders OUTSIDE AppShell | no Primary nav present | ✅ |
| Honest local-first state | "you're running fully local" + "you don't need this to start" | ✅ |
| Brand panel verbatim trust copy | "An account is optional…" + "Your memory stays yours…" | ✅ |
| No fabricated identity | no demo email, no fake SSO button (F1/F10) | ✅ |
| Continue → /home | navigates into the fully-local app | ✅ (unit) |

Evidence: `01-auth-b1-accountless-dark.png`.

## B2 — optional Clerk (D2(b)), themed
With `VITE_CLERK_PUBLISHABLE_KEY` present, the key-gate flips `/auth` from the accountless
notice to the **real** prebuilt Clerk form, app-wide `WaggleClerkProvider` mounted.

| Behavior | Live result | ✓ |
|---|---|---|
| Key-gate (accountless → Clerk) | `clerkMounted=true`, accountless notice gone | ✅ |
| Real prebuilt `<SignIn/>` (D13) | `.cl-rootBox` mounted; email field present | ✅ |
| Social buttons = dashboard config (no fabrication) | **Google + GitHub** render; **Apple absent** (not enabled) — honest (F10) | ✅ |
| Warm theming (dark) | Clerk primary button `rgb(233,165,44)` = honey `#e9a52c` | ✅ |
| Warm theming (light, theme-reactive) | primary `rgb(181,125,18)` = light honey `#b57d12` (tracked `useTheme`) | ✅ |
| Sign in ↔ Sign up toggle | own toggle switches; §2b honey local-first note shows on Sign up | ✅ |
| Redirect after auth | `<SignIn forceRedirectUrl="/home">` | ✅ (unit + props) |
| Enterprise = sales CTA, not live SAML | "Talk to sales → kvark.ai"; no SAML field (F11/D15) | ✅ |
| Router-integrated provider | `routerPush/replace → useNavigate` (no flicker) | ✅ |

Evidence: `02-auth-b2-clerk-signin-dark.png`, `03-auth-b2-clerk-signin-light.png`.

## Honesty / no-fabrication
- Social buttons render **only what the dashboard enables** (prebuilt `<SignIn/>`), so the
  Google+Apple→Google+GitHub design/instance mismatch resolves itself — enable Apple in the
  dashboard and it appears with zero code change. No invented provider.
- No-key path (production builds without the key) → the accountless local-first state, never a
  fake identity. The local sidecar still authorizes with its device token; Clerk is NOT the
  local API authorizer (the `getToken()`→Bearer cloud-sync seam is left for a later opt-in).

## Not exercised (needs a real account / manual QA)
- A full sign-in/sign-up round-trip (Google/GitHub OAuth redirect, email-code verify) — needs
  real credentials. The component renders + themes + redirects-on-success are wired; the live
  OAuth round-trip (esp. inside a Tauri WebView, D4) is the documented follow-up spike.
- `<UserButton/>` / `useUser()` feeding the sidebar user row — deferred (BUILD-PLAN §9).

---

## Adversarial review + fixes (2026-06-24, commit 0e0dc48e)

4-dim review (correctness/Clerk · no-fabrication-of-identity · design-fidelity · security/local-first)
→ per-finding verify → synthesis. **3 confirmed: 1 CRITICAL, 1 MEDIUM, 1 LOW** — all fixed.

| # | Sev | Issue | Fix | Verified |
|---|-----|-------|-----|----------|
| 1 | **CRITICAL** | A malformed/placeholder `VITE_CLERK_PUBLISHABLE_KEY` (incl. the `.env.example` placeholder) blanked the WHOLE app at boot — ClerkProvider throws synchronously in render, and `WaggleClerkProvider` sits above `AppErrorBoundary` (uncatchable). Unit tests missed it (they mock ClerkProvider); the first smoke used a real key. | Shape-validate the key in `lib/clerk.ts` (prefix + base64→host-ending-`$`), **inlined** (the monorepo resolves multiple `@clerk/shared` majors). `.env.example` placeholder blanked. | **Live, real ClerkProvider:** with `pk_test_REPLACE_ME` the app **boots fully** (sidebar, routes to /home, /auth = accountless) — no blank, no error boundary. Valid key restored → Clerk form back. |
| 2 | MEDIUM | Brand-panel hide breakpoint was `lg` (1024px); design hides < 820px → split lost across 820–1023px. | `min-[820px]` arbitrary variant (AuthBrandPanel + AuthScreen). | tsc + design intent |
| 3 | LOW | Wordmark `font-semibold`/18px vs design 700/19px. | `font-bold`/`text-[19px]`. | Live: weight 700, size 19px |

**No identity-fabrication issues** found by the review: sidebar stays "Account"/"W", social buttons
are dashboard-driven (prebuilt), no live SAML form, no demo identity, and the device-token adapter
path is untouched (Clerk is not the local API authorizer).

Post-fix gates: FE tsc 0 · pr7b-auth **9/9** (+3 key-shape-gate tests) · full FE **1156/1156** ·
prod build green · live smoke valid **+ invalid** key, dark+light, **0 console errors**.

**PR7b is review-clean and ready to merge.**

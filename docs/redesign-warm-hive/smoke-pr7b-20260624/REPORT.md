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

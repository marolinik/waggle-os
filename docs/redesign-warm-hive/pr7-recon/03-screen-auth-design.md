# PR7 Recon · Screen 13 — Auth (Clerk, themed) · DESIGN spec

> RECON ONLY. No product code touched. Every claim cites `file:line`.
> Scope: faithful component-level breakdown of the Auth screen design so a build
> agent can implement it against the warm token system, PLUS the REAL-vs-BUILD
> reality of auth in this monorepo (which is the load-bearing surprise here).

Sources read in full:
- `docs/design_handoff_waggle_app/design-files/screens/auth.html` (181 lines)
- `docs/design_handoff_waggle_app/SCREENS.md` §13 (lines 269-278)
- `docs/design_handoff_waggle_app/design-files/styles/waggle.css` (155 lines, token grounding)
- `docs/redesign-warm-hive/BUILD-PLAN.md` §6 (PR7 row) + §7.5 (the BYO/metered gate)
- Codebase auth reality: `packages/server/src/plugins/auth.ts`, `…/local/security-middleware.ts`,
  `…/services/user-service.ts`, `apps/web/src/components/os/AppShell.tsx`,
  `apps/web/src/lib/adapter.ts`, `apps/www/app/sign-in/[[...sign-in]]/page.tsx`,
  `apps/www/app/api/stripe/checkout/route.ts`

---

## 0. The headline (read this before building)

**The desktop app (`apps/web`) — PR7's build target — has NO authenticated user
identity and NO Clerk React SDK today.** Auth screen 13 is therefore overwhelmingly
**EXTERNAL-DEP + decision-gated**, not a re-skin of something already wired.

Two distinct server modes coexist; the design's "Clerk" assumption only matches ONE
of them, and it's NOT the one the desktop talks to:

| Mode | Auth mechanism | Has a real user account? | Where the design's screen would live |
|---|---|---|---|
| **Local sidecar** (what the Tauri desktop / `apps/web` talks to) | per-process **machine bearer token** via `GET /api/auth/session-token`, exchanged so loopback callers can't drive the API. NOT a login. (`packages/server/src/local/security-middleware.ts:235-377`, `:238`) | **No.** "Identity" is the local IdentityLayer name the user types in onboarding (`adapter.getIdentity()` → `/api/identity`, `IdentityResponse.name`), a memory record, not an account. (`apps/web/src/lib/adapter.ts:1090-1095`; `tauri-bindings.ts:133-145`) | n/a today — there is no `/auth` route in `apps/web` (grep for `'/auth'`/`appId.*auth` → **No matches**) |
| **Cloud / Team server** (`packages/server/src/index.ts` + `plugins/auth.ts`) | **real Clerk** — `verifyToken()`, `clerkClient.users.getUser()`, Drizzle `users` table, auto-provision on first auth (`packages/server/src/plugins/auth.ts:3,19-52`; `services/user-service.ts:30-58`) | Yes (Clerk user → internal UUID) | n/a in `apps/web` either |
| **`apps/www`** (Next.js landing) | **real Clerk UI**, hosted `<SignIn/>`/`<SignUp/>` catch-all pages, themed via `<ClerkProvider>` (`apps/www/app/sign-in/[[...sign-in]]/page.tsx:1,17-23`); `@clerk/nextjs@^7.3.0` + `@clerk/themes@^2.4.57` (`apps/www/package.json:15-16`) | Yes | **This is the only place Clerk's themeable React UI already exists.** |

So the build decision PR7 must surface: **does screen 13 ship as a real auth flow in
the desktop at all, or is desktop auth always optional/local and "sign in for sync"
links out to the `apps/www` Clerk flow?** The design copy itself ("account is optional —
Waggle runs fully local without one") leans toward the latter. See §6 Decisions.

---

## 1. Exact layout (split: brand-panel left + form right)

From `auth.html`:

- **Top control bar** (`.controls`, `auth.html:78-87`) — concept-harness chrome: a label
  `Auth · Clerk · state` (`:79`), a 4-way segmented state switcher
  `Sign in / Sign up / Verify / SSO` (`:80-85`), and a theme toggle button (`:86`).
  **This bar is concept scaffolding for previewing states — NOT product UI.** In the
  real build the "state" is route/Clerk-flow-driven, not a manual segmented control.
- **Split grid** (`.split`, `:89`; CSS `:20`) — `grid-template-columns: 1.05fr 1fr`
  (brand panel slightly wider than the form).
- **Left brand panel** (`.brandside`, `:90-101`; CSS `:22-33`):
  - 56px padding, `linear-gradient(160deg, var(--bg-2), var(--bg))`, right border
    `--line-soft`, full-bleed honeycomb texture `.comb` masked by a radial gradient
    at 30%/30% (CSS `:23`).
  - Three vertical zones via `justify-content:space-between`: **brand lockup** (hex "W"
    mark + "Waggle" wordmark, `:92`), **pitch** (h2 + p, `:93-96`), **trust lines**
    (`:97-100`).
  - **Hidden below 820px** — `@media (max-width:820px){ .brandside{display:none} }`
    (CSS `:73`). Mobile = form only.
- **Right form panel** (`.formside`, `:103-152`; CSS `:36-37`): centered, `max-width:380px`
  card, scrollable. Holds the four state views (`.view`, only one `.on` at a time, CSS `:72`).

---

## 2. Every state — verbatim copy + behavior

### 2a. Sign in (`data-view="signin"`, `auth.html:106-117`) — default
- Heading **"Welcome back"**; sub **"New to Waggle? Create an account"** (link → signup) (`:107`).
- **SSO block** (`.sso`, `:108-111`): two buttons — **"Continue with Google"** (mono "G"
  badge) and **"Continue with Apple"** (mono "⌥" badge).
- Divider **"or"** (`.divider`, `:112`).
- **Email** field, demo value `mara@egzakta.com` (`:113`).
- **Password** field with a `lrow` header: label + **"Forgot?"** link (→ verify view in
  the demo; in product → Clerk reset) (`:114`).
- Primary **"Sign in"** button (`data-go="home"` → routes to Home) (`:115`).
- Fineprint: **"By continuing you agree to the Terms & Privacy Policy."** (`:116`).

### 2b. Sign up (`data-view="signup"`, `:120-132`) — carries the local-first note
- Heading **"Create your hive"**; sub **"Already have an account? Sign in"** (`:121`).
- **`.localnote` honey banner** (`:122`; CSS `:67-70`) — THE load-bearing trust copy:
  > **"You don't need this to start."** Waggle works locally right away — create an
  > account only when you want sync or a team.
- **SSO block**: single **"Sign up with Google"** (`:124`).
- Divider **"or"** (`:126`).
- Fields: **Name** (demo `Mara Kovač`), **Email** (placeholder `you@company.com`),
  **Password** (placeholder **"At least 10 characters"**) (`:127-129`).
- Primary **"Create account"** (→ verify) (`:130`).
- Fineprint: **"We'll send a code to verify your email."** (`:131`).

> Password rule "At least 10 characters" (`:129`) is design copy. Real minimum is
> Clerk-policy-driven — do NOT hardcode "10" in validation; mirror whatever the Clerk
> instance enforces, or omit the count.

### 2c. Verify — 6-box OTP (`data-view="verify"`, `:135-140`)
- Heading **"Check your email"**; sub **"We sent a 6-digit code to mara@egzakta.com"**
  (the email is bolded in `--text-2`) (`:136`).
- `.otp` row of **6 single-char inputs** (`:137`; CSS `:60-64`): 48×56px, mono 22px,
  `maxlength=1`, `inputmode="numeric"`; a `.filled` class flips border + text to honey
  on a non-empty box.
- **Auto-advance / backspace nav** (the explicit design requirement), in the demo script
  (`:163-169`): `input` event focuses the next box when filled; `keydown` Backspace on an
  empty box focuses the previous box. The demo pre-fills boxes 0-2 with `[2,4,9]`.
- Primary **"Verify & continue"** (→ Home) (`:138`).
- **"Didn't get it? Resend code · Use a different email"** (→ back to sign in) (`:139`).

### 2d. SSO / enterprise (`data-view="sso"`, `:143-150`)
- Heading **"Single sign-on"**; sub **"Use your organization's identity provider."** (`:144`).
- Field **"Work email or organization"** (placeholder `you@company.com`) (`:145`).
- Primary **"Continue with SSO"** (`:146`).
- Divider **"enterprise"** (`:147`).
- **Muted `.localnote`** (neutral, not honey — `background:var(--bg-2)`) (`:148`), verbatim:
  > SAML, SCIM provisioning, and audit logs are available on **Teams** and **KVARK**.
  > **Talk to sales →**
- Back link **"← Back to sign in"** (`:149`).

### 2e. Brand-panel pitch + trust copy (verbatim, `:93-100`)
- h2: **"Your work follows you, *everywhere.*"** ("everywhere." in honey via `em`, CSS `:29`).
- p: **"Sign in to sync your hive across devices, collaborate with a team, and pick up any
  project exactly where you left off — on any machine."**
- Trust line 1 (shield icon): **"An account is optional — Waggle runs fully local without one"**
- Trust line 2 (arrow icon): **"Your memory stays yours; sign-in only adds sync"**

---

## 3. Warm tokens + primitives used (for faithful build)

All from `waggle.css` (dark `:9-61`, light `:63-101`). The auth HTML uses these named
tokens directly:

| Primitive | Tokens (from `auth.html` `<style>` + `waggle.css`) |
|---|---|
| Brand-panel bg | `linear-gradient(160deg, --bg-2, --bg)`; border `--line-soft` (`auth.html:22`) |
| Honeycomb texture | `.comb` data-URI honey @ 5% stroke, radial mask (CSS `:119-122`) |
| Hex mark | `.hex` clip-path (`waggle.css:117`) + `linear-gradient(150deg,--honey-bright,--honey-deep)` + `--honey-glow` (`auth.html:25`) |
| SSO buttons | `--surface` bg, `--line-strong` border; hover → `--honey-line` + `--surface-2` (`auth.html:44-45`) |
| Divider | flex rule, `--line-soft` lines, mono `--text-dim` label (`auth.html:47-48`) |
| Inputs | `--surface` bg, `--line` border, `--r:11px`; focus → `--honey-line` + `--honey-glow` (`auth.html:52-53`) |
| OTP boxes | mono, `--r:12px`; `.filled` → `--honey-line` + honey text (`auth.html:62-64`) |
| Primary submit | `--honey` bg, text `#1a1407`; hover → `--honey-bright` (`auth.html:56-57`) |
| Honey trust banner | `.localnote` → `--honey-wash` bg + `--honey-line` border (`auth.html:68`) |
| Neutral enterprise banner | `.localnote` overridden to `--bg-2` + `--line-soft` (`auth.html:148`) |
| Links / accents | `--honey`; fineprint `--text-dim` (`auth.html:41,55,58`) |
| Focus ring (global) | `:focus-visible{outline:2px solid --honey}` (`waggle.css:125`) |
| Fonts | `--sans` Hanken Grotesk, `--mono` JetBrains Mono (`waggle.css:51-53`) |

In the real build these map to the **PR1-landed warm tokens** in `apps/web`
(`BUILD-PLAN.md §3.1`, already shipped per MEMORY.md — `index.css` carries the verbatim
`waggle.css` names + the shadcn HSL recolor). So **no new tokens are needed** — the build
re-skins Clerk/custom components against the already-present token set. Honey "#1a1407"
button-foreground is the same `--primary-foreground` PR1 set (`BUILD-PLAN.md:67`).

`#1a1407` (honey-button text) and `data-theme` theming are app-global; the screen
inherits dark default + the warm-paper light variant for free.

---

## 4. Clerk's themeable components vs custom

Per SCREENS.md §13: **"Build with Clerk components themed to the tokens."** Mapping the
design's pieces to what Clerk's `appearance` API covers:

| Design piece | Clerk coverage | Notes |
|---|---|---|
| Sign in (Google/Apple SSO + email/pw) | **`<SignIn/>`** | Social buttons, email/pw, "Forgot?" reset are first-class. Theme via `appearance.variables` (`colorPrimary` ← `--honey`, `colorBackground` ← `--surface`, etc.) + `elements` overrides. `@clerk/themes` already a www dep (`apps/www/package.json:16`). |
| Sign up + local-first note | **`<SignUp/>`** + **custom** | The form is Clerk; the **honey `.localnote` "you don't need this to start"** banner is custom chrome placed above/around `<SignUp/>`. |
| Verify 6-box OTP (auto-advance/backspace) | **Clerk built-in** | Clerk's email-code step renders its own OTP input with auto-advance. Re-skinning to the exact 48×56 honey boxes needs `elements.otpCodeField*` overrides (or Clerk Elements / a fully custom flow if pixel-parity is required). |
| SSO / enterprise (SAML/SCIM → Teams/KVARK) | **partial Clerk + custom** | Clerk Enterprise SSO exists but is a paid Clerk feature + per-org config. The design's panel is mostly a **custom "Talk to sales" CTA** (KVARK funnel), not a live SAML form. Safe build: custom panel, link to sales. |
| Left brand panel + pitch + trust lines | **fully custom** | Pure layout chrome around the Clerk `<SignIn/>`/`<SignUp/>` card. |

**To match the warm design, two integration styles are possible:**
1. **Themed Clerk prebuilt** (`<SignIn appearance={…}/>`) wrapped in the custom split
   layout — fastest, matches SCREENS.md's instruction, but OTP/element pixel-parity is
   limited to what `appearance.elements` exposes.
2. **Clerk Elements / headless** (`useSignIn`, `useSignUp`) feeding the design's exact
   custom inputs/OTP/buttons — full visual control, more code, the only way to get the
   exact 48×56 honey OTP boxes + custom SSO buttons.

The brand panel, dividers, local-first banner, and enterprise→sales CTA are **custom in
either case**.

---

## 5. Honesty contract — where Auth could fabricate (MUST be gated off)

Auth is the single highest-risk screen for fabrication because the desktop has no real
account. Each of these must be **real or absent — never invented**:

1. **A logged-in identity that isn't real.** The demo hardcodes `mara@egzakta.com` /
   `Mara Kovač` (`auth.html:113,127,136`). A build MUST NOT pre-fill or display a fake
   signed-in user. The desktop's only "identity" is the local IdentityLayer name
   (`adapter.getIdentity()`, `apps/web/src/lib/adapter.ts:1090`), which is **not** an
   authenticated account and must never be rendered as "signed in".
2. **Fake SSO success.** Google/Apple/SSO buttons that "succeed" without a real Clerk
   (or any) provider configured are fabrication. If Clerk isn't wired in the desktop,
   these buttons must be honestly disabled / "coming soon" / route to `apps/www`, not
   fake a session. (No Clerk publishable key path exists in `apps/web` today.)
3. **Fake OTP verification.** The demo's "Verify & continue" advances on any input
   (`auth.html:138,164`). Real verify must check a real code via Clerk; otherwise the
   verify state must not claim to have verified anything.
4. **"Continue → Home" as a real auth boundary.** In the demo all submits just navigate
   to Home (`auth.html:171-172`). The desktop already has a **real structural auth gate**
   (the session-token `ensureReady()` contract, `adapter.authgate.test.ts`) — but that
   gates the *local sidecar*, not a user login. The Auth screen must not imply a login
   happened when only the local app opened.
5. **SAML/SCIM as live.** The enterprise panel names SAML/SCIM/audit logs
   (`auth.html:148`). These are Teams/KVARK/Clerk-Enterprise features — the panel is a
   **sales CTA**, and must stay one unless those are genuinely provisioned. Do not render
   a SAML form that does nothing.

**Gate-off rule:** if Clerk is not configured for the desktop, the entire authenticated
path (SSO, email/pw, OTP, SSO/org) should degrade to the honest local-first framing the
design itself already provides ("an account is optional — Waggle runs fully local") and
a single "Sign in for sync →" link to the real flow, rather than a non-functional
look-alike.

---

## 6. Decisions a build agent must get answered first

1. **Does desktop auth ship at all, or link out?**
   - Options: (a) full Clerk in `apps/web` (add `@clerk/clerk-react` + publishable key +
     a `/auth` route — none exist today); (b) desktop stays local-only, "Sign in for sync"
     deep-links to the existing `apps/www` Clerk flow (`apps/www/app/sign-in/...`); (c)
     embed/redirect to `apps/www` in a webview.
   - Recommendation: **(b)** for first ship — matches "account is optional", reuses the
     real, already-themed `apps/www` Clerk surface, and avoids standing up a second Clerk
     React integration + token bridge into the local sidecar (which currently authenticates
     with a *machine* token, not a *user* token).
   - Blast radius: large if (a) — new dep, new route, new token-exchange between Clerk
     user-JWT and the local bearer; small if (b)/(c).

2. **BYO-key vs Waggle-metered (DESIGN_POV §4 / BUILD-PLAN §7.5 #5).** Explicitly flagged
   as **blocking Billing/PR7** (`DESIGN_POV.md:62-70`, `:88-90`; `BUILD-PLAN.md:165-166`).
   It reshapes whether "sign in" is even required to use models (BYO = local key, no
   account needed; metered = account + payment up front). **Settle before building 13/14.**
   - Blast radius: shapes Auth (is sign-in required for inference?), Onboarding model gate,
     Billing, Usage. Founder decision, not a build choice.

3. **OTP fidelity: themed Clerk prebuilt vs Clerk Elements/headless.** Pixel-exact 48×56
   honey OTP boxes need headless; "good enough" needs only `appearance` overrides.
   - Recommendation: themed prebuilt first (ships SCREENS.md's instruction), upgrade to
     Elements only if review demands the exact boxes. Blast radius: small/local.

4. **SSO/enterprise panel = sales CTA only (no live SAML).** Recommendation: keep it a
   custom "Talk to sales → KVARK/Teams" panel; do not implement live SAML in PR7.
   Blast radius: small.

---

## 7. REAL vs DERIVABLE vs MUST-BUILD vs EXTERNAL-DEP (screen 13)

| Feature | Status | Evidence / note |
|---|---|---|
| Warm tokens + primitives the screen needs | **REAL** | PR1 landed verbatim `waggle.css` tokens in `apps/web` (`BUILD-PLAN.md §3.1`, MEMORY.md PR1). No new tokens. |
| Split brand panel, pitch, trust lines, dividers, local-first banner, enterprise CTA | **MUST-BUILD** (custom chrome, low risk) | Pure layout/copy; no backend. All copy verbatim in §2/§4 above. |
| Clerk `<SignIn/>`/`<SignUp/>`/OTP UI in `apps/web` | **EXTERNAL-DEP** | No `@clerk/clerk-react` in `apps/web`; no publishable key; no `/auth` route (grep: no matches). Clerk React UI exists ONLY in `apps/www` (`apps/www/app/sign-in/[[...sign-in]]/page.tsx`). |
| Real user account / login / session | **EXTERNAL-DEP** | Real Clerk auth lives in cloud/team server (`packages/server/src/plugins/auth.ts:3,31-48`) + `users` table (`services/user-service.ts`). Desktop sidecar auth is a **machine bearer token**, not a user (`local/security-middleware.ts:235-377`). |
| Local "identity" (name) for the user row | **REAL but NOT an account** | `adapter.getIdentity()` → `/api/identity` → IdentityLayer name (`adapter.ts:1090`; `tauri-bindings.ts:133-145`); used in `AppShell.tsx:98-108`, degrades to "Account". Must NOT be shown as "signed in". |
| SSO with Google/Apple | **EXTERNAL-DEP** | Clerk social providers; need Clerk + OAuth app config. Not wired in desktop. |
| SAML / SCIM (enterprise) | **EXTERNAL-DEP** (Teams/KVARK/Clerk-Enterprise) | Design panel is a sales CTA, not a live form (`auth.html:148`). |
| "Continue → Home" navigation | **DERIVABLE** | Routes to `/home`; desktop already has the structural sidecar auth gate (`adapter.authgate.test.ts`) but that is not a user login. |
| Theme toggle / segmented state switcher (top bar) | **N/A — concept scaffolding** | `.controls` is harness chrome for previewing states (`auth.html:78-87`), not product UI. |

---

## 8. One-paragraph build brief (for the implementer)

Build screen 13 as a **custom warm split layout** (left brand panel: hex "W" + honeycomb
`.comb` + verbatim pitch/trust copy from §2e; right: a centered `max-width:380px` card)
in `apps/web`, against the **already-present PR1 warm tokens** (no new tokens). The form
itself is **EXTERNAL-DEP on Clerk**, which is wired only in `apps/www` today — so the
**first, honest ship is local-first**: the desktop stays usable without an account
(reuse the design's own "you don't need this to start" `.localnote`), and a single
**"Sign in for sync →"** links to the real, already-themed `apps/www` Clerk flow rather
than a non-functional Clerk look-alike in the desktop. If founder confirms full in-app
Clerk (decision §6.1a), add `@clerk/clerk-react` + a publishable key + a `/auth` route +
a user-JWT→local-sidecar token bridge, and theme `<SignIn/>`/`<SignUp/>`/OTP via
`appearance` (Elements only if pixel-exact OTP boxes are required). **Never** render a
fabricated signed-in identity, fake SSO/OTP success, or a dead SAML form (§5). The
**BYO-vs-metered decision (§6.2) blocks this screen and Billing** and must be settled
first.

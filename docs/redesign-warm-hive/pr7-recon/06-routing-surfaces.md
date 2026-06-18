# PR7 Recon — 06 · Routing & Surfaces (Auth /auth + Billing /billing)

> Topic: where `/auth` and `/billing` routes + entries live, reusing the PR1–PR6 shell
> patterns. RECON ONLY — no product code touched. Every claim cites `file:line`.
> Verified against `origin/main @ 3764bc13` (PR1–PR6 all shipped).

---

## TL;DR (the two registration shapes)

1. **`/auth` (screen 13) is SPECIAL — it is the ONE pre-shell, full-screen route.** Every
   prior warm-Hive screen mounts INSIDE the `<AppShell>` layout route (`App.tsx:63-101`);
   `/auth` must NOT. It belongs as a **sibling `<Route>` at the top level, outside the
   `path="/"` AppShell element** — no Sidebar, no StatusBar, no ChatHost, no boot gate. It
   is the only screen in the whole redesign that breaks the "child-of-AppShell" rule.

2. **`/billing` (screen 14) is NOT a new top-level route at all.** A complete Stripe billing
   surface ALREADY EXISTS as **Settings → "Plan" tab** (`SettingsApp.tsx:511-655`), wired to
   the real `useBilling` hook → real adapter Stripe calls → real server routes. PR7's billing
   work is **(a) reskin that existing tab to the warm tokens + the SCREENS §14 4-state layout,
   and (b) make it deep-linkable** (today `/settings` always opens on the Models tab and has
   **no `?tab=` reader** — see the breadcrumb/deep-link gap below). A standalone themed
   `/billing` route is OPTIONAL and only justified if the design wants the full-screen
   Plans/Checkout/Success/Manage flow outside the Settings chrome.

---

## 1. The route table today (`apps/web/src/App.tsx`)

`App.tsx:52-110` — a SINGLE layout route owns everything:

```
<Route path="/" element={<AppShell />}>
   <Route index element={<IndexRedirect />} />
   …all 28 child routes (home, workspaces, memory, …, benchmarks, platform)…
   <Route path="*" element={<NotFound />} />   // App.tsx:100
</Route>
```

- **Every** screen is a child of `<AppShell>` (`App.tsx:63`). There is currently **no
  top-level route outside the shell** at all.
- Imports come from the `@/routes` barrel (`App.tsx:12-39`); the catch-all `*` must stay last
  (`App.tsx:99` comment "ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL").
- PR6a added the two ⌘K-only static surfaces directly here: `benchmarks` (`App.tsx:97`) and
  `platform` (`App.tsx:98`).
- **No `/auth`, `/billing`, `/login`, `/sign-in`, `/payment-success`, `/payment-cancelled`
  routes exist** (verified by grep — zero hits in `App.tsx` / `routes/index.ts`).

---

## 2. The PR6 route-wrapper pattern (to copy)

A PR6 ⌘K-only surface is 3 small pieces. `BenchmarkRoute.tsx:1-11` is the template:

```tsx
/** PR6a route wrapper — `/benchmarks` → BenchmarkApp (static, ⌘K-only surface). */
import BenchmarkApp from '@/components/os/apps/BenchmarkApp';
import SurfaceBoundary from './SurfaceBoundary';
const BenchmarkRoute = () => (
  <SurfaceBoundary appName="Benchmarks"><BenchmarkApp /></SurfaceBoundary>
);
export default BenchmarkRoute;
```

The three pieces for any in-shell surface:
1. **`routes/<Name>Route.tsx`** — thin wrapper that renders the App component inside
   `<SurfaceBoundary appName="…">` (`SurfaceBoundary.tsx:10-17` wraps in `AppErrorBoundary`,
   `onClose` → `navigate('/home')`).
2. **`routes/index.ts` barrel export** (`routes/index.ts:56-59` — PR6 lines).
3. **`<Route path="…" element={<…Route/>}/>` in `App.tsx`** under the AppShell layout
   (`App.tsx:96-98` — the PR6a block).

> **PR7 BILLING (if a standalone `/billing` is wanted)** follows this exact 3-step pattern
> — a `BillingRoute` wrapper → barrel → child route under AppShell. **PR7 AUTH does NOT** —
> see §4: it is a sibling route, not an AppShell child, and `SurfaceBoundary`'s
> `onClose → /home` is wrong for a pre-login screen.

---

## 3. Command-catalog entries (`apps/web/src/lib/command-catalog.ts`)

The ⌘K catalog is built by `buildCommandCatalog()` (`command-catalog.ts:59-118`), grouped
**Jump to / Do / Power tools** (+ Pro "★ Pinned"). Entry shape `CatalogCommand`
(`command-catalog.ts:22-40`): `{ id, group, name, subtitle, icon, to?, action?, meta?,
minBillingRank?, pinned? }`. Each routes to a REAL `to:` or fires `action:'spawn'`.

**Billing is already represented in the catalog — but points at the wrong place:**
- `command-catalog.ts:75` — `Settings · "models · failover · permissions · plan"` → `to:"/settings"`
- `command-catalog.ts:76` — **`"Upgrade to Pro"` · `"plans · billing · invoices"` → `to:"/settings"`**

Both land on `/settings` (which opens on the **Models** tab, NOT Plan — see §6 gap). PR7
should retarget these to whatever the billing entry point becomes (`/settings?tab=billing`
once a `?tab=` reader exists, or a new `/billing`).

**Auth has NO catalog entry and should NOT get one** — sign-in is a pre-login full-screen
route reached by redirect, not a ⌘K jump from inside the authenticated shell.

The catalog's tier-gating mechanism to reuse: `gate()` (`command-catalog.ts:99-100`) filters
on `minBillingRank` (FREE 0 / TRIAL 1 / PRO 2 / TEAMS 3 / ENT 4, `command-catalog.ts:36`); Pro
"★ Pinned" floats `pinned:true` items (`command-catalog.ts:104-111`). Catalog is consumed in
`AppShell.tsx:272-279` (`buildCommandCatalog` + `handleCatalogSelect`).

---

## 4. `/auth` — the pre-shell, full-screen registration (THE special case)

### Why it can't be an AppShell child
`<AppShell>` (`AppShell.tsx:436-466`) wraps everything in `<ShellProvider>` →
`<ShellLayout>` (`AppShell.tsx:68`), which renders the BootScreen gate, the Sidebar
(`AppShell.tsx:314-323`), StatusBar (`AppShell.tsx:303-309`), ChatHost, all overlays, and the
onboarding takeover (`AppShell.tsx:285-296`). A sign-in screen must show **none of that**.
Mounting `/auth` as a child of `path="/"` would draw the whole authenticated chrome behind
the login form.

### Recommended shape (sibling route, outside the shell)
```tsx
<Routes>
  <Route path="/auth" element={<AuthRoute />} />        {/* NEW — sibling, pre-shell */}
  <Route path="/" element={<AppShell />}>
     …existing 28 children…
  </Route>
</Routes>
```
- `AuthRoute` is a **standalone full-screen component** — it MUST NOT use `SurfaceBoundary`
  (its `onClose → navigate('/home')` assumes an authenticated home, `SurfaceBoundary.tsx:13`).
  Wrap in a plain `AppErrorBoundary` if any, with `onClose → window.location.reload()` (the
  same pattern `App.tsx:61` uses at the root).
- Theme still applies: `data-theme` is set pre-paint in `main.tsx` (per BUILD-PLAN §4) and
  `<ThemeProvider>` wraps `<BrowserRouter>` at `App.tsx:53`, so `/auth` inherits warm tokens
  even though it's outside AppShell. Good — no extra wiring needed for theming.

### Honesty gate (CRITICAL — auth is the #1 fabrication risk)
There is **no real user-identity auth in the product today.** What exists is a **same-origin
local sidecar session-token** (`adapter.ts:295-308` `fetchSessionToken`, refreshed at
`adapter.ts:316-331`; server route `local/index.ts:2047` `/api/auth/session-token`, auth-exempt
`security-middleware.ts:238`). That is a *dev/desktop bootstrap Bearer*, NOT a logged-in human.
The only "Clerk-gated" surface is the **CLOUD** server (`local/routes/agents.ts:12` comment:
"`/api/agents/*` CRUD exists only on the Clerk-gated CLOUD server"), which the local app does
not run.

So `/auth` is **EXTERNAL-DEP / MUST-BUILD**: real Clerk components need a `CLERK_PUBLISHABLE_KEY`
+ the `@clerk/clerk-react` provider (neither present — zero `@clerk` imports in `apps/web/src`).
**Until that wiring is real, the auth screen must NOT show a fake signed-in identity, a fake
name/avatar, or pretend a session exists.** The design's own framing helps here: SCREENS §13
(`SCREENS.md:271-278`) says "An account is optional — Waggle runs fully local without one" and
"Continue routes to Home." A PR7-honest auth screen can render the themed Clerk UI but, with no
key configured, must degrade to the local-first "continue without an account → Home" path
rather than inventing a logged-in user. (The sidebar user row already degrades to "Account" +
"W" avatar when `getIdentity()` returns no name — `AppShell.tsx:98-109`, PR1 LOW #2 — so the
"no real identity" state is already an accepted, non-fabricated UI.)

The `clerk-setup` / `clerk-react-patterns` / `clerk-billing` skills are available for the build PR.

---

## 5. `/billing` — reuse the EXISTING Settings "Plan" tab (do not rebuild from zero)

### What is already REAL (verified, fully wired)
- **Settings "Plan" tab** — `SettingsApp.tsx:41` (`{ id:'billing', label:'Plan', icon:DollarSign }`);
  renders at `SettingsApp.tsx:511-655` (`activeTab === 'billing'`).
- **`useBilling` hook** — `hooks/useBilling.ts:24-124`: `startCheckout('PRO'|'TEAMS')`
  (`useBilling.ts:69-81`), `openPortal()` (`useBilling.ts:84-96`), `syncAfterCheckout`
  (`useBilling.ts:49-66`), auto-detects `?session_id=` on return (`useBilling.ts:104-115`).
  P1b honesty already baked in: `tierResolved=false` until a real `getTier()` succeeds; the
  default 'FREE' is NEVER shown as fact (`useBilling.ts:13-22, 38-43`; rendered unresolved
  state at `SettingsApp.tsx:525-536`).
- **Adapter Stripe layer** — `adapter.ts:2658-2680`: `syncStripeCheckout`,
  `createCheckoutSession`, `createPortalSession`.
- **Server Stripe routes (REAL)** — `packages/server/src/stripe/{checkout,portal,sync,webhook}.ts`.
  `checkout.ts` returns **`503 STRIPE_NOT_CONFIGURED`** when no `STRIPE_SECRET_KEY`
  (`checkout.ts:19-20`); success/cancel URLs are `/payment-success?session_id=…` and
  `/payment-cancelled` (`checkout.ts:42-43`). Webhook handler + 4 price-var resolution shipped
  per CLAUDE.md §10 (E-10).
- **CoverageCompassCard** value-prop card already renders above the tier card
  (`SettingsApp.tsx:520`).

### What is a build GAP for the SCREENS §14 design (`SCREENS.md:282-295`)
| §14 design element | Status | Evidence |
|---|---|---|
| Plans state (3 cards, Pro popular) | DERIVABLE — upgrade buttons exist | `SettingsApp.tsx:579-619` |
| **Monthly / annual toggle (−20%)** | **MUST-BUILD on FE** — server already accepts `billingPeriod` (`checkout.ts:14,29`) but adapter `createCheckoutSession(tier)` does **not pass it** (`adapter.ts:2667`); `useBilling.startCheckout` has no period arg (`useBilling.ts:69`) | grep: zero `billingPeriod`/`annual`/`monthly` in adapter+useBilling |
| Checkout state (card form) | EXTERNAL-DEP — use **Stripe Checkout** (hosted), per SCREENS §14 "Use Stripe Checkout/Customer Portal where possible" (`SCREENS.md:294`) | `checkout.ts` creates hosted `session.url` |
| Success state | **MUST-BUILD route** — `success_url` points at `/payment-success` which **does not exist** as a route (grep: 0 hits in App.tsx); today only `?session_id=` is read by `useBilling.ts:104-115` on whatever page is mounted | `checkout.ts:42` vs App.tsx |
| Manage state (portal, invoices, PDF) | REAL — "Manage Subscription" → `openPortal()` → Stripe Customer Portal (`SettingsApp.tsx:621-635`, `useBilling.ts:84-96`). **Invoices/PDF are inside Stripe's portal, not our UI** — do NOT render fake invoice rows in-app. |

### Recommended registration for billing
- **Primary:** keep billing as the **Settings → Plan tab**, reskinned to warm tokens + the
  §14 segmented 4-state layout. Add the **`/payment-success`** route (and optionally
  `/payment-cancelled`) — these CAN be AppShell children using the PR6 wrapper pattern (the
  user is back inside the app post-checkout), OR a tiny standalone confirmation. Wire ⌘K
  `upgrade`/`settings` entries to deep-link the Plan tab.
- **Optional standalone `/billing`:** only if design wants the full Plans/Checkout/Success/Manage
  flow outside Settings chrome. If so, follow the §2 PR6 wrapper pattern (AppShell child —
  billing IS post-login, unlike auth). Reuse `useBilling` verbatim; do not duplicate Stripe calls.

### BYO-vs-metered (BLOCKER — founder decision before billing ships)
BUILD-PLAN §7 item 5 (`BUILD-PLAN.md:165-166`) and DESIGN_POV §4 (`DESIGN_POV.md:62-70`) flag
**who pays for inference (BYO-key vs Waggle-metered)** as the decision that "quietly reshapes
Billing, Onboarding, and Usage" and "should be settled before Billing goes live"
(`DESIGN_POV.md:89-90`). This is a **decision gate for PR7**, not a code question — the current
billing tab supports either ("supports either but commits to neither", `DESIGN_POV.md:70`).

---

## 6. The breadcrumb / `matchNavRoute` label gap (must NOT repeat for /billing)

### How the breadcrumb label is derived
`AppShell.tsx:224-229`:
```ts
const labelEntries = flattenAppEntries(getDockForTier('power', billingTier));   // 224
const activeRoute  = matchNavRoute(location.pathname, labelEntries.map(e=>e.route)…); // 225
const surfaceLabel = labelEntries.find(e => e.route === activeRoute)?.label ?? null;  // 229
```
`surfaceLabel` is passed to `<StatusBar focusedWindowLabel={surfaceLabel}>`
(`AppShell.tsx:304`). `matchNavRoute` (`routes.ts:146-154`) is a longest-prefix match against
the **dock-tiers route table only**.

### The gap (this is the handoff "P3 / PR6 ⌘K-only routes show a fuzzy fallback label" note)
`dock-tiers.ts` `POWER_CONFIG` (`dock-tiers.ts:64-118`) does **NOT contain `/benchmarks` or
`/platform`** (confirmed by grep — zero hits in dock-tiers.ts). So for those routes
`matchNavRoute` returns `null` → `surfaceLabel = null` → **the StatusBar breadcrumb simply
does not render** (it is gated `{focusedWindowLabel && (…)}` at `StatusBar.tsx:84`). The
PR6 ⌘K-only surfaces therefore show **no breadcrumb at all** (not literally a wrong/fuzzy
string — the label is null and the breadcrumb chip is hidden). Either way the surface is
unlabeled in the status bar.

### Requirement for PR7
**`/billing` (and `/payment-success`, and conceptually `/auth`) MUST get a breadcrumb label
so they don't repeat the unlabeled-surface gap.** The label map (`labelEntries`) is sourced
ONLY from `getDockForTier(...)` — i.e. from `dock-tiers.ts`. Two options:
1. **Add a dock-tiers entry** (with `route` + `label`) for the billing surface so
   `matchNavRoute` resolves it — same fix PR6 should have applied to benchmarks/platform. But
   billing lives under `/settings` today (Settings already has a dock entry `dock-tiers.ts:108`,
   label "Settings"), so a `?tab=billing` deep-link inherits the "Settings" breadcrumb already
   — acceptable. A standalone `/billing` would need its own entry.
2. **`/auth` needs NO breadcrumb** — it renders outside AppShell (§4), so `AppShell.tsx`'s
   StatusBar never mounts for it. The gap is irrelevant for auth by construction.

> Net: the breadcrumb gap is an AppShell-internal concern. `/auth` sidesteps it (no shell).
> `/billing` should either ride the existing "Settings" entry (deep-link path) or, if
> standalone, add a `dock-tiers.ts` route+label entry — do **not** ship it label-less.

### Deep-link gap that BLOCKS the "/settings?tab=billing" approach (verified)
`SettingsApp` initializes `activeTab` to **`'models'`** (`SettingsApp.tsx:53`) and has **NO
`?tab=` / `useSearchParams` reader** (grep: zero `tab=`/`useSearchParams`/`searchParams`/
`initialTab` in `SettingsApp.tsx`). So today `/settings?tab=billing` and even the existing
`APP_ROUTES.backup = '/settings?tab=backup'` (`routes.ts:52`) **silently open on Models, not the
requested tab.** For PR7 to deep-link billing from ⌘K / Upgrade buttons, SettingsApp needs a
small **`?tab=` initializer** (read once on mount, snap `activeTab`). This is a real, small
MUST-BUILD — without it the catalog "Upgrade to Pro" / UpgradeModal-fallback `navigate('/settings')`
(`AppShell.tsx:411-413, 422`) lands a user on Models, not Plan.

---

## 7. Existing upgrade entry points (where "Upgrade"/"Manage plan" link today)

| Surface | Action | Target | Evidence |
|---|---|---|---|
| Settings → Plan tab, FREE/TRIAL | Pro / Teams cards | `billing.startCheckout('PRO'\|'TEAMS')` → Stripe Checkout | `SettingsApp.tsx:583-598` |
| Settings → Plan tab, PRO | "Upgrade to Teams" | `startCheckout('TEAMS')` | `SettingsApp.tsx:604-619` |
| Settings → Plan tab, PRO/TEAMS | **"Manage Subscription"** | `billing.openPortal()` → Stripe Customer Portal | `SettingsApp.tsx:621-635` |
| Settings → Plan tab, non-ENT | Enterprise CTA | external link `https://www.kvark.ai` | `SettingsApp.tsx:638-652` |
| `UpgradeModal` overlay | `onUpgrade(tier)` | `adapter.createCheckoutSession(...)`, **fallback `navigate('/settings')`** | `AppShell.tsx:404-415` |
| `TrialExpiredModal` overlay | `onUpgrade(tier)` | `adapter.createCheckoutSession(...)`, fallback `navigate('/settings')` | `AppShell.tsx:417-424` |
| ⌘K catalog | "Upgrade to Pro" / "Settings" | `to:"/settings"` | `command-catalog.ts:75-76` |
| Sidebar user row | tier label "Trial · 9d" / "Pro" | (display only; row → Settings) | `AppShell.tsx:264-269, 321-322` |

All upgrade paths converge on Stripe checkout (real) or land on `/settings` (which mis-opens
on Models per §6). The "Manage plan" affordance is the existing **"Manage Subscription"**
button → Stripe Customer Portal. There is **no `KvarkNudge` component in `apps/web/src`**
(grep: 0 hits; CLAUDE.md §9 references it but it is not in the web app today — Enterprise CTA
is the inline kvark.ai link at `SettingsApp.tsx:644-651`).

---

## 8. Fabrication risks for PR7 (gate-off candidates — HONESTY CONTRACT)

1. **A logged-in identity that isn't real.** No Clerk/user-auth exists; the session-token is a
   local dev Bearer. The auth screen must not render a fake signed-in user/name/avatar or
   claim a session. Degrade to the design's local-first "continue without an account" path
   when no `CLERK_PUBLISHABLE_KEY` is configured. (`adapter.ts:295-308`, `local/index.ts:2047`,
   `AppShell.tsx:98-109` accepted "Account" fallback.)
2. **Fake invoices / PDFs.** SCREENS §14 lists "invoices (Paid + PDF)". Those live inside the
   **Stripe Customer Portal**, not our UI. Do NOT render invented invoice rows or fake
   "Download PDF" links in-app — route to `openPortal()` (`useBilling.ts:84-96`).
3. **Fake payment method ("VISA ···4242").** That `…4242` string in SCREENS §14 is design
   filler. Real card-on-file data lives in Stripe's portal. Do not display a hardcoded masked
   card in the Manage state.
4. **Fake "next charge" / usage / due-today numbers.** SCREENS §14 Checkout shows "Due today
   $19 / won't be charged until …". Those must come from the real Stripe session, not be
   string-literal'd. Prefer hosted Stripe Checkout (`checkout.ts:39-50`) which renders the real
   amounts itself.
5. **Presenting tier as fact before it resolves.** Already guarded by `tierResolved`
   (`useBilling.ts:13-22`); PR7 must preserve that — never show "Free plan" as fact while
   unresolved (`SettingsApp.tsx:525-536`).
6. **A fake monthly/annual price.** The −20% annual toggle is a build gap (§5); when added it
   must resolve through a real annual price var (server `priceIdForTier(tier, 'annual')`,
   `checkout.ts:29`) — not a client-side `$19 × 0.8` cosmetic number that doesn't match what
   Stripe charges.

---

## 9. File index (everything PR7 routing touches)

| Concern | File:line |
|---|---|
| Route table (add `/auth` sibling, optional `/billing` child, `/payment-success`) | `apps/web/src/App.tsx:52-110` |
| Route-wrapper pattern to copy | `apps/web/src/routes/BenchmarkRoute.tsx:1-11`; `routes/SurfaceBoundary.tsx:10-17` |
| Barrel | `apps/web/src/routes/index.ts:33-59` |
| AppId→URL table (`/auth`,`/billing` are NOT here yet; `backup` deep-link precedent) | `apps/web/src/lib/routes.ts:25-53, 70-80`; `matchNavRoute` `routes.ts:146-154` |
| ⌘K catalog (retarget upgrade entry) | `apps/web/src/lib/command-catalog.ts:62-97` |
| Shell breadcrumb derivation + label-source gap | `apps/web/src/components/os/AppShell.tsx:224-229, 304`; `StatusBar.tsx:84-93` |
| Dock label table (no benchmarks/platform/billing entries) | `apps/web/src/lib/dock-tiers.ts:64-118` |
| Existing Billing surface (REUSE) | `apps/web/src/components/os/apps/SettingsApp.tsx:36-47, 511-655` |
| Billing hook (REUSE) | `apps/web/src/hooks/useBilling.ts:24-124` |
| Adapter Stripe + session-token | `apps/web/src/lib/adapter.ts:2658-2680, 295-331` |
| Server Stripe routes | `packages/server/src/stripe/{checkout,portal,sync,webhook}.ts` (checkout `checkout.ts:13-58`) |
| Server local session-token (only "auth" today) | `packages/server/src/local/index.ts:2043-2047`; `security-middleware.ts:238` |
| SCREENS specs | `docs/design_handoff_waggle_app/SCREENS.md:269-295` |
| BYO-vs-metered decision gate | `docs/design_handoff_waggle_app/DESIGN_POV.md:62-70, 89-90`; `BUILD-PLAN.md:165-166` |

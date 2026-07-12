# T13 Public Launch Funnel UX Analysis

Status: focused local fixes implemented for signed-out checkout continuation, checkout cancel recovery, the public-site hydration issue badge, legal placeholder/stale-tier copy, the empty-release download dead-end, mobile download label honesty, and the public-site deployment workflow target. Canonical DNS, real signed installer publication, deployed Vercel/DNS proof, deployed Clerk/Stripe proof, and formal legal sign-off remain open launch gates.

Scope: `apps/www`, public download, public pricing, auth handoff, Stripe checkout handoff, checkout cancel recovery, account redirect, legal/trust pages, and launch deployment.

## Why This Matters

The installed cockpit can score well and still fail the complete-product UX goal if a founder, buyer, reviewer, or mobile executive cannot get from the public site to a trustworthy download, account, or checkout path. T13 therefore remains a final-product gate unless the user explicitly scopes the public launch funnel out of the five-persona score.

## Current Evidence

| Check | Result | Notes |
|---|---|---|
| `npm run test -w apps/www -- --reporter=dot` | Pass | Current focused coverage is 7 files / 19 tests: `BrandPersonasCard`, Pricing checkout links/recovery, Stripe checkout route cancel URL, layout hydration contract, legal launch-copy guard, controlled download path, mobile/desktop download label detection, and public-site deployment workflow guard. |
| `npx tsc --noEmit --project apps/www/tsconfig.json` | Pass | No TypeScript errors. |
| `npm run build:www` | Pass | Next.js 15.5.18 build succeeds. Routes include static public pages plus dynamic `/account`, `/api/stripe/checkout`, `/api/webhooks/stripe`, `/sign-in`, and `/sign-up`. Build warns that the Next.js ESLint plugin is not detected. |
| Build/deploy artifact shape | Improved locally | `Test-Path apps/www/dist` = `False`; `Test-Path apps/www/.next` = `True`; `Test-Path apps/www/out` = `False`. `.github/workflows/deploy-www.yml` now uses Vercel production `pull`, `build`, and `deploy --prebuilt --prod` instead of GitHub Pages static artifact upload. Deployed Vercel/DNS proof remains open. |
| Live public domain smoke | Fail | Current external refresh on 2026-07-08: all checked `https://waggle-os.ai/*` URLs failed DNS resolution from this environment; `nslookup waggle-os.ai` returned `Non-existent domain`. |
| Local prod route/API smoke | Improved | Current post-fix `next start --hostname localhost --port 34205` returned 200 for `/`, `/?checkout=cancelled`, and `/docs/methodology`; signed-out `GET /api/stripe/checkout?tier=teams&billing=monthly` returned 303 to sign-in with a checkout redirect target. Historical `/pricing?checkout=cancelled` remains a non-route, but the app no longer emits it from Stripe cancel recovery. |
| Signed-out checkout API/UI smoke | Improved | Pricing now uses the canonical GET checkout route instead of POST, so signed-out users enter the route's auth redirect flow. POST remains a backward-compat JSON shim for older clients. |
| Download target | Improved | Public Download CTAs and footer Product > Download now route to `/download`, a controlled status page that explains Windows/macOS installers are being prepared and links to source/contact instead of an empty GitHub Releases page. Mobile/tablet OS detection now keeps CTAs generic instead of labeling iOS/Android as desktop installers. The release workflow now builds packages before Windows/macOS sidecar packaging, but real signed installer publication remains open. Current production smoke returned 200 for `/download` and found no `releases/latest` target in `/` or `/download`. |
| Fresh rendered Browser smoke | Improved | In-app Browser verified `http://localhost:34204/?checkout=cancelled#pricing`: pricing rendered, cancelled-checkout recovery notice appeared, monthly Team CTA and retry link used `/api/stripe/checkout?tier=teams&billing=monthly`, annual toggle updated both links to annual, the Next dev issue badge disappeared after the layout fix, and console warnings/errors were empty. Browser DOM snapshot still failed with the known `incrementalAriaSnapshot` mismatch, so evidence used targeted DOM evaluation plus screenshots. |
| Web Interface Guidelines lens | Mixed | Latest guideline source checked on 2026-07-08: <https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md>. Public page has skip link, focus-visible outline, reduced-motion handling, semantic sections, explicit image dimensions in key inspected paths, fixed checkout recovery next steps, and guarded legal placeholder copy. Download/release truth, deployed checkout proof, and formal legal sign-off remain outside the local UI copy fix. |

Local smoke output summary:

```text
/ -> 200
/#pricing -> 200
/privacy -> 200
/terms -> 200
/cookies -> 200
/eu-ai-act -> 200
/sign-in -> 200
/sign-up -> 200
/docs/methodology -> 200
/account -> 307 location=/sign-in
/pricing?checkout=cancelled -> 404
/methodology -> 404
GET checkout signed-out -> 303 location=http://localhost:3426/sign-in?redirect_url=%2Fapi%2Fstripe%2Fcheckout%3Ftier%3Dteams%26billing%3Dmonthly
POST checkout signed-out -> 401 body={"message":"Sign in required","signInUrl":"http://localhost:3426/sign-in?redirect_url=%2Fapi%2Fstripe%2Fcheckout%3Ftier%3Dteams%26billing%3Dmonthly"}
```

Live external refresh summary:

```text
https://waggle-os.ai/ -> DNS resolution failed
https://waggle-os.ai/#pricing -> DNS resolution failed
https://waggle-os.ai/pricing?checkout=cancelled -> DNS resolution failed
https://waggle-os.ai/docs/methodology -> DNS resolution failed
https://waggle-os.ai/privacy -> DNS resolution failed
https://waggle-os.ai/terms -> DNS resolution failed
https://waggle-os.ai/cookies -> DNS resolution failed
https://waggle-os.ai/eu-ai-act -> DNS resolution failed
https://waggle-os.ai/sign-in -> DNS resolution failed
https://waggle-os.ai/sign-up -> DNS resolution failed
https://waggle-os.ai/account -> DNS resolution failed
https://api.github.com/repos/marolinik/waggle-os/releases/latest -> 404
https://api.github.com/repos/marolinik/waggle-os/releases -> []
```

Rendered Browser smoke summary:

```text
Build: npm run build:www -> pass; .next dynamic app generated, Next ESLint plugin warning remains
Server: npm run start -w apps/www -- --hostname localhost --port 3491
Browser page identity: http://localhost:3491/ -> title "Waggle — The AI workspace that remembers"
Console health: homepage 0 warnings/errors; pricing checkout-error state 0; mobile menu state 0
Desktop screenshot: output/playwright/www-t13-3491/www-t13-home-desktop.png
Pricing screenshot: output/playwright/www-t13-3491/www-t13-pricing-checkout-error-desktop.png
Mobile screenshots: output/playwright/www-t13-3491/www-t13-home-mobile.png and www-t13-mobile-menu-open.png
Summary JSON: output/playwright/www-t13-3491/www-t13-rendered-summary.json
/pricing?checkout=cancelled -> 404
/methodology -> 404
/docs/methodology -> rendered
Signed-out pricing CTA -> stays on / and shows only "Sign in required"
GET checkout monthly/annual -> 303 to /sign-in with redirect_url
Download CTAs -> https://github.com/marolinik/waggle-os/releases/latest
External refresh: waggle-os.ai and www.waggle-os.ai NXDOMAIN; GitHub latest release 404; releases list []
```

Post-fix focused evidence:

```text
Pricing route contract:
  npm run test -w apps/www -- __tests__/Pricing.test.tsx __tests__/stripe-checkout-route.test.ts --reporter=dot
  -> 2 files / 3 tests passed

Hydration contract:
  npm run test -w apps/www -- __tests__/layout.test.tsx --reporter=dot
  -> 1 file / 1 test passed

Public-site suite:
  npm run test -w apps/www -- --reporter=dot
  -> 7 files / 19 tests passed

TypeScript:
  npx tsc --noEmit --project apps/www/tsconfig.json
  -> pass

Build:
  npm run build:www
  -> pass; .next output generated; /download route included; Next ESLint plugin warning remains

Rendered Browser:
  http://localhost:34204/?checkout=cancelled#pricing
  -> recovery notice visible; monthly Team CTA + retry href = /api/stripe/checkout?tier=teams&billing=monthly
  -> annual toggle updates both hrefs to /api/stripe/checkout?tier=teams&billing=annual
  -> no Next issue badge after layout suppressHydrationWarning; no console warnings/errors

Local production smoke:
  next start --hostname localhost --port 34205
  / -> 200
  /?checkout=cancelled -> 200
  /docs/methodology -> 200
  /api/stripe/checkout?tier=teams&billing=monthly -> 303 to /sign-in?redirect_url=...

Legal copy guard:
  npm run test -w apps/www -- __tests__/legal-copy.test.ts --reporter=dot
  -> 1 file / 1 test passed
  rg -n "Day-0|\[Day-0 launch date\]|Pro or Teams|to be filled before public launch|\[to be designated" 'apps/www/app/(legal)'
  -> no matches

Download path:
  npm run test -w apps/www -- __tests__/download-path.test.tsx --reporter=dot
  -> 1 file / 3 tests passed
  rg -n "releases/latest|https://github.com/marolinik/waggle-os/releases" apps/www/app apps/www/messages/en.json apps/www/__tests__
  -> no matches
  next start --hostname localhost --port 34206
  /download -> 200, contains installer-status copy, no releases/latest target
  / -> 200, no releases/latest target

Deployment workflow:
  npm run test -w apps/www -- __tests__/deployment-workflow.test.ts --reporter=dot
  -> 1 file / 1 test passed
  .github/workflows/deploy-www.yml now uses Vercel production pull/build/deploy and no longer references GitHub Pages or apps/www/dist.

Desktop release workflow:
  npx vitest run packages/server/tests/tauri-config.test.ts --reporter=dot
  -> 1 file / 19 tests passed
  .github/workflows/release.yml now runs npm run build:packages before both Windows and macOS sidecar bundle steps.
```

## What Is Already Working

- Homepage IA is coherent: hero, problem, how it works, memory, proof, features, trust, persona brand moment, open source, pricing, and final CTA.
- `page.tsx` includes a skip link and a real `<main id="main">`.
- Navbar anchors use absolute section URLs, so legal pages can navigate back to homepage sections.
- Global CSS provides `:focus-visible`, heading `scroll-margin-top`, and reduced-motion handling.
- Pricing copy now uses Solo/Teams/Enterprise in the main pricing component.
- The newer checkout GET route can redirect signed-out users into sign-in with a return target.
- Pricing now uses that GET route directly for Team checkout, preserving monthly/annual billing in the URL.
- Cancelled checkout returns to the homepage pricing section with an inline recovery notice and retry link.
- Public legal pages no longer expose Day-0 launch placeholders, bracketed launch-date placeholders, retired "Pro or Teams" copy, or the named pre-launch address/representative placeholders caught by the launch-copy guard.
- Public download CTAs no longer send visitors directly to an empty GitHub Releases page; `/download` is a controlled status page until signed installers exist.
- Account page redirects signed-out users before mounting Clerk account UI.
- Fresh rendered desktop/mobile localhost smoke shows no current-page console errors or warnings for homepage, mobile menu, or signed-out checkout-error state.

## Correction Candidates

### T13-0: Public domain does not currently resolve

Evidence:
- Current external smoke from this environment on 2026-07-08 could not resolve `waggle-os.ai`.
- `nslookup waggle-os.ai` returned `Non-existent domain`.
- Fresh refresh also shows `www.waggle-os.ai` has no A or CNAME record from this environment.
- `apps/www/app/layout.tsx:137-141`, `apps/www/app/docs/methodology/page.tsx:36`, `apps/www/app/robots.ts:17`, and `apps/www/app/sitemap.ts:3` treat `https://waggle-os.ai` as canonical production.

Impact:
- A founder, buyer, reviewer, or mobile executive cannot reach the public acquisition, pricing, legal, download, auth, or account surfaces at the canonical domain.
- Local build success does not prove the public launch funnel exists.

Correction:
- Configure DNS for `waggle-os.ai` and deploy the chosen public-site hosting target.
- Run public smoke against the canonical domain after DNS propagation.
- Keep the local `localhost` smoke as a pre-deploy check, not as final launch evidence.

Acceptance:
- `https://waggle-os.ai/`, legal pages, `/docs/methodology`, `/sign-in`, `/sign-up`, `/account`, checkout handoff, and download CTA resolve from a normal network.
- The canonical metadata, sitemap, and robots URL match the deployed host.

### T13-1: Download path is currently broken

Status: empty-release dead-end focused fixed locally; real signed installer publication remains open.

Evidence:
- Historical evidence: `DownloadCTA` and footer Product > Download pointed directly to GitHub Releases latest.
- GitHub currently reports no releases for `marolinik/waggle-os`; live 2026-07-08 refresh confirms `/releases/latest` returns no latest release and the GitHub API releases list is empty.
- Current source evidence: public Download CTAs and the footer Download link route to `/download`.
- Current route evidence: `/download` is a controlled status page explaining that Windows and macOS installers are being prepared, with source/contact actions instead of a direct empty release link.
- Current scan evidence: no `releases/latest` target remains in `apps/www/app`, `apps/www/messages/en.json`, or `apps/www/__tests__`.
- Current source evidence: `apps/www/app/_lib/os-detection.ts` returns `null` for mobile/tablet user agents, `macOS` for desktop Mac, `Windows` for desktop Windows, and `Linux` only for desktop Linux.
- `apps/www/messages/en.json:39` says the product platforms are Windows and macOS.

Impact:
- A founder no longer reaches an empty release page, but still cannot download a signed installer until releases are published.
- Mobile/tablet visitors keep a generic Download CTA, avoiding a false desktop-installer promise.
- A desktop Linux visitor can still see a Linux-specific label even though the public copy says Windows and macOS; this is less damaging now that the CTA leads to a status page, but should be revisited before artifact-specific downloads go live.

Correction:
- Completed locally: point the CTA/footer to a controlled download/status page and add a release-link guard.
- Completed locally: harden the tag release workflow so desktop artifacts build workspace packages before sidecar bundling, matching the PR Tauri verification lane.
- Remaining launch work: publish real signed Windows/macOS release assets and switch `/download` from status page to artifact-aware download page.
- Remaining polish: decide whether desktop Linux should stay generic or be shown as unsupported before signed installers go live.

Acceptance:
- Focused local acceptance met: fresh smoke proves the public CTA leads to a deliberate download landing page, and no supported persona reaches an empty GitHub Releases page from the public CTA.
- Full launch acceptance still requires valid Windows/macOS artifacts and final unsupported-OS copy for non-Windows/non-macOS desktops.

### T13-2: Deployment workflow does not match the current Next app shape

Status: focused fixed locally; deployed Vercel/DNS smoke remains open.

Evidence:
- Historical evidence: `.github/workflows/deploy-www.yml` ran the www build and uploaded `apps/www/dist` to GitHub Pages.
- `apps/www/next.config.mjs:6-13` has no `output: 'export'`.
- Current build output is `.next`, not `dist` or `out`.
- The built app includes dynamic auth/API routes and middleware.
- Current source evidence: `.github/workflows/deploy-www.yml` now installs with `npm ci`, pulls the Vercel production environment, runs public-site tests/typecheck/build, then runs Vercel `build --prod` and `deploy --prebuilt --prod`.
- Current test evidence: `deployment-workflow.test.ts` guards that the workflow contains Vercel production deployment commands and does not reference `upload-pages-artifact`, `deploy-pages`, or `apps/www/dist`.

Impact:
- The prior GitHub Pages workflow could not serve the current app as configured.
- Local source now has a coherent Next-capable deployment path, but external Vercel secrets, DNS, and deployed smoke are not proved by this local fix.

Correction:
- Completed locally: move the workflow to the existing Vercel production architecture for the dynamic Clerk/Stripe Next app.
- Remaining external launch work: configure `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, production env vars, domain DNS, and run deployed smoke against `https://waggle-os.ai`.

Acceptance:
- Focused local acceptance met: the checked-in deploy workflow no longer targets GitHub Pages/static artifacts for a dynamic Next app.
- Full launch acceptance still requires a successful production deploy and public smoke covering `/`, legal pages, auth/account routing, checkout route behavior, webhook reachability, and download CTA.

### T13-3: Signed-out Team checkout dead-ends in the pricing UI

Status: focused fixed locally.

Evidence:
- `apps/www/app/api/stripe/checkout/route.ts:213-240` has a GET flow that redirects signed-out users to sign-in.
- `apps/www/app/api/stripe/checkout/route.ts:242-284` keeps a POST compatibility flow returning JSON.
- `apps/www/app/api/stripe/checkout/route.ts:273-276` returns `{ message: 'Sign in required', signInUrl }` for signed-out POST.
- Historical source evidence: the old pricing UI used POST, read only `message` on non-OK responses, and ignored `signInUrl`.
- Historical rendered smoke clicked Annual then Get Team while signed out; the page stayed at `/`, showed only a small `Sign in required` alert, and exposed no sign-in recovery link in the pricing state.
- Current source evidence: `apps/www/app/_components/Pricing.tsx` renders the Team CTA as a link to `/api/stripe/checkout?tier=teams&billing={monthly|annual}`.
- Current rendered Browser evidence: monthly and annual Team links update correctly and signed-out users enter the route-level GET flow.

Impact:
- A buyer clicking Get Team before auth sees implementation-shaped error text instead of continuing to sign-in/sign-up and checkout.

Correction:
- Completed locally: pricing CTA migrated to the canonical GET redirect flow.
- Remaining launch evidence: verify return-to-checkout after a real Clerk sign-in/sign-up session and real Stripe checkout session.

Acceptance:
- Focused local acceptance met: signed-out Get Team starts the auth route instead of showing a dead-end POST error; billing period is preserved in the route URL.
- Full launch acceptance still requires a real signed-in checkout run against deployed auth/Stripe config.

### T13-4: Checkout cancel recovery points to a dead route

Status: focused fixed locally.

Evidence:
- Historical source evidence: `cancel_url` pointed to `/pricing?checkout=cancelled`, but pricing is a section on `/`.
- Historical local and rendered Browser smokes confirmed `/pricing?checkout=cancelled -> 404`.
- Current source evidence: the Stripe cancel URL is `/?checkout=cancelled#pricing`.
- Current test evidence: `stripe-checkout-route.test.ts` verifies the cancel URL passed to Stripe.
- Current rendered Browser evidence: `/?checkout=cancelled#pricing` renders pricing, shows a cancelled-checkout recovery notice, and exposes a retry link that tracks the selected billing period.

Impact:
- A buyer who cancels Stripe checkout can land on a 404 instead of a recoverable pricing state.

Correction:
- Completed locally: use `/?checkout=cancelled#pricing` plus an inline recovery notice and retry action.

Acceptance:
- Focused local acceptance met: cancelled checkout returns to a visible pricing recovery state, not a 404.
- Full launch acceptance still requires a real Stripe cancellation redirect on the deployed site.

### T13-5: Legal and trust pages are not launch-ready

Status: placeholder/stale-tier copy focused fixed locally; formal legal approval remains open.

Evidence:
- Historical evidence: legal pages contained "Day-0 placeholder text", `[Day-0 launch date]`, launch/address placeholders, and Privacy said "upgrade to Pro or Teams".
- Current source evidence: terms/privacy/cookies/EU AI Act pages use July 8, 2026 effective/updated dates, current Solo/Team language, non-placeholder contact/representative wording, and no named launch placeholder patterns.
- Current test evidence: `legal-copy.test.ts` guards against Day-0 placeholder text, launch-date placeholders, pre-launch address placeholders, retired "Pro or Teams" copy, and bracketed representative placeholders.

Impact:
- Team admins, enterprise reviewers, and privacy-conscious founders lose trust before installing when public legal pages expose placeholders or retired tier language.

Correction:
- Completed locally: replaced the named placeholders/stale-tier copy and added a legal-copy guard.
- Remaining launch/legal process: obtain formal Egzakta legal approval for the current text, registered details, and representative wording before treating these pages as legally final.

Acceptance:
- Focused local acceptance met: `legal-copy.test.ts` passes and the targeted `rg` launch-placeholder scan returns no matches.
- Full launch acceptance still requires legal sign-off.

### T13-6: Production smoke needs a stable browser lane

Evidence:
- Current HTTP route/API smoke passes for core routes when using `--hostname localhost`.
- Earlier rendered smoke found `127.0.0.1` binding failures and Clerk development/session-loop warning noise.
- The fresh Browser smoke exercises homepage, mobile menu, signed-out pricing CTA, checkout redirect API, and route recovery. It does not exercise Clerk modal browser behavior, signed-in checkout, or real Stripe return.

Impact:
- A route-only smoke can miss the exact UI failures buyers hit: modal auth, return-to-checkout, console warning loops, mobile nav, and visual layout.

Correction:
- Add a repeatable public-site Playwright/browser smoke using the known-good `localhost` host binding.
- Cover desktop and mobile: homepage, mobile menu, download CTA, sign-in/sign-up pages, account redirect, signed-out checkout, checkout cancel, legal pages, and methodology.

Acceptance:
- Fresh screenshots and route/API logs are attached with no unexpected 404, 500, timeout, or auth-loop noise.

### T13-7: Coverage is too narrow for a launch funnel

Evidence:
- `apps/www/__tests__` currently covers only `BrandPersonasCard`.
- Historical coverage gap: no checked-in route E2E, checkout-recovery test, legal placeholder guard, release/download target guard, or deployment artifact guard was found.
- Current local improvement: checkout recovery, legal placeholder/stale-tier, release/download target, mobile download-label, and deployment workflow guards now exist. Deployed-domain smoke, real checkout, signed installer publication, and formal legal sign-off remain open.

Impact:
- The public site can regress in the exact flows needed for acquisition and purchase while tests stay green.

Correction:
- Add focused tests/guards:
  - Download CTA target and platform labels.
  - Signed-out checkout auth continuation.
  - Checkout cancel recovery route.
  - Legal placeholder/stale-tier grep.
  - Deployment artifact/hosting mode consistency.
  - Public route smoke in CI or release checklist.

Acceptance:
- `npm run test -w apps/www`, www typecheck, www build, and the public funnel smoke all pass from a clean checkout.

## Five-Persona Impact

| Persona | Cap Until Fixed | Why |
|---|---:|---|
| Solo founder/operator | 5/10 | Canonical public domain does not resolve; local Download no longer dead-ends, but there is still no signed installer artifact to obtain. |
| Team admin/security reviewer | 5/10 | Public legal/pricing/account pages are unreachable at the canonical domain; deployment target, formal legal sign-off, and real signed-in checkout evidence remain launch blockers. |
| Mobile executive | 5/10 | Mobile cannot inspect the canonical public site; mobile download labels are honest locally, but signed download/release truth still needs fixing after deploy. |
| Engineer/power user | 6/10 | Local site is credible, but NXDOMAIN plus no signed release artifact and deploy mismatch make the product look unreleasable. |
| Privacy/compliance reviewer | 6/10 | Public legal pages no longer expose the named placeholder/stale-tier copy locally, but canonical-domain reachability and formal legal sign-off still block launch trust. |

## Approval Recommendation

Keep T13 outside Phase 1 implementation, but do not treat it as optional for the final 9/10 complete-UX goal. After the installed-app P0s are approved and fixed, run T13 as a launch-readiness slice with this order:

1. Make `waggle-os.ai` resolve and deploy the selected public-site target.
2. Publish signed installer artifacts behind the controlled `/download` path.
3. Fix deploy target or hosting architecture.
4. Verify real deployed Clerk sign-in/sign-up return-to-checkout and Stripe cancel/success redirects.
5. Complete formal legal sign-off for public legal/trust copy.
6. Add the public funnel smoke and remaining minimal guards.

T13 can be deferred only if the user explicitly says the five-persona judge score is limited to the installed desktop cockpit and excludes the public acquisition/payment/legal funnel.

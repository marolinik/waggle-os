# Waggle-OS GA Reconciliation — 2026-05-30

> Baseline: `main @ 5ccfa53` (2026-05-29). This reconciles `PRODUCTION-PLAN.md` Phases 2–5 against the code after the Phase0/Phase1 security track (AV-1/2/3/5, D1, gates) and the parallel-session Phase7a–e + S4 full type-ratchet (`no-explicit-any` 937→0 repo-wide) both landed. The plan was authored **before** that work, so some items are now closed and some plan claims — especially Phase 7d's "light-mode finish" — are corrected against verified evidence below.

## 1. Headline — what genuinely remains for GA

The hard security and supply-chain work is done (drizzle 0.45 migrated and clean; Stripe `billingPeriod` fail-closed validation in place), but **GA is not shippable as-is**: there is a live **CORS suffix-attack vulnerability in the team server** (`packages/server/src/index.ts:46` passes a raw origin array to Fastify CORS instead of the exact-match `corsOriginAllowed()` the local server already uses), a **payment-gate bypass in both Stripe webhook handlers** (checkout.session.completed grants paid tiers without checking `payment_status`), **no real browser/persona E2E or failure-injection coverage**, **deployment manifests missing all Stripe/CORS env vars**, **light mode ~0.6% migrated** (4 status tokens + 5 KG tokens missing for light theme, 60+ files still hardcoded, contrast never visually validated), and **desktop signing + R7-008 updater-signature unfixed** (these are platform-blocked on Windows). The two items the verifiers downgraded from CLOSED→OPEN/PARTIAL (P3-stripe webhook gate, P3-cors) are the most urgent because they are security regressions, not gaps.

## 2. Cluster status matrix

| Cluster | Phase | Final Status | Key Residuals | Evidence |
|---|---|---|---|---|
| P2-e2e | Phase 2 (WS-B) | **PARTIAL** | No Playwright persona journeys; no failure-injection suite; no R3-002 cycle test; CI bypasses npm scripts | `tests/e2e/user-journeys.spec.ts` (generic J1–J10 only); `.github/workflows/ci.yml:71` runs `npx playwright test tests/e2e/` directly |
| P3-sign | Phase 3 (WS-C desktop) | **PARTIAL** | Win cert not in CI; mac Developer ID/notarization not in CI; R7-008 empty `signature:""` | `release.yml:56-65,111-121,137/141/145`; `tauri.conf.json`; pilot self-sign scripts exist but manual |
| P3-cli | Phase 3 (WS-C desktop) | **PARTIAL** | `@waggle/cli` missing `files`, `publishConfig`, metadata, `exports` (publishes tests/src) | `packages/cli/package.json:7-9,16-22`; vs fully-configured `hive-mind-cli` |
| P3-deploy | Phase 3 (WS-C web) | **PARTIAL** | Stripe + CORS env vars absent from both deploy manifests; `render.yaml` build path mismatch (`cd app` vs `apps/web`) | `render.yaml:1-63`; `docker-compose.production.yml:16-57`; Dockerfile non-root OK (`:91-115`) |
| P3-stripe | Phase 3 (WS-C web) | **PARTIAL** ⚠️ *(verifier downgraded from CLOSED)* | Webhook handlers grant tiers without `payment_status` check (R1-002 bypass) | `packages/server/src/stripe/webhook.ts:115-126`; `apps/www/app/api/webhooks/stripe/route.ts:98-110` |
| P3-cors | Phase 3 (WS-C web) | **OPEN** ⚠️ *(verifier downgraded from PARTIAL)* | Team server passes raw array to Fastify CORS → suffix attack; deploy `CORS_ORIGIN` unset | `packages/server/src/index.ts:46` vs correct local `index.ts:1912-1920` + `cors-config.ts:57-59` |
| P3-drizzle | Phase 3 (WS-C migration) | **CLOSED** ✓ | None | `packages/server/package.json:32` `drizzle-orm@^0.45.2`; journal v7; commit `fb33ca8`; tsc clean |
| discovered-drift | Discovered §7.5 | **PARTIAL** ⚠️ *(verifier downgraded from CLOSED)* | Stale `packages/core/src/mind/**` paths + hard-coded script paths in deprecated sync workflows | `sync-mind.yml:51,117-118`; `mind-parity-check.yml:35,41,118,170-171` |
| P4-light | Phase 4 (WS-D) | **OPEN** | 4 light status tokens + 5 KG tokens missing; 60+ files hardcoded; contrast never validated | `apps/web/src/index.css:190`; commit `6a3d598` ("Contrast NOT visually validated"); TRUST-REPORT "~0.6% done" |
| P4-a11y-perf | Phase 4 (WS-D) | **PARTIAL** | ComplianceTemplateModal no Escape/focus-trap/labelledby; window controls absent; harvest `contentHash` never computed/passed | `ComplianceTemplateModal.tsx:171-172`; `harvest.ts:409` + `index.ts:1226,1449` call `recordSync` w/ 3 args; `tauri.conf.json:37` |

Legend: ⚠️ = adversarial verifier overrode the original investigator status.

## 3. Per-phase: what's actually left

### Phase 2 (WS-B) — E2E + failure-injection — PARTIAL
The "E2E" that exists is Vitest server-level tests plus generic Playwright UI journeys. None of the plan's persona/failure-recovery intent is met.
- Add Playwright **persona journeys** for researcher, analyst, coder, product-manager, executive-assistant (chat → tool invocation → result), distinct from generic J1–J10. The 17-persona coverage that exists is behavioral unit tests in `packages/agent/tests/behaviors/`, not browser journeys.
- Add a **failure-injection suite** (e.g. `tests/e2e/failure-injection.spec.ts`): network-drop mid-stream, capability-missing hard error, traversal-rejected 403, unpaid-tier gate, sidecar-restart.
- Add the **R3-002 circular-dependency test** asserting `@waggle/shared` / `@waggle/server` / `@waggle/agent` / `@waggle/core` form an acyclic import graph (none exists; grep for `R3-002` returns nothing).
- Fix **CI wiring**: `.github/workflows/ci.yml:71` invokes Playwright directly instead of `npm run test:all` / `test:e2e`, so CI and local diverge from the package.json scripts.
- Publish a **persona→journey coverage map** for CI visibility.

### Phase 3 (WS-C) — desktop, web, migration — mixed
**P3-drizzle is genuinely CLOSED** (verifier agreed): 0.44.7→0.45.2 across server/launcher/worker, journal v7, tsc clean, no audit findings — a pure security patch (GHSA-gpj5-g38j-94v9), 42 usage sites verified.

**P3-stripe — verifier OVERRODE CLOSED → PARTIAL.** Commit `27a98f7` correctly fixed `billingPeriod` (R1-003) and atomic writes (R1-011), but the R1-002 payment gate was only added to the `/api/stripe/sync` endpoint, **not the webhook handlers**. Both `webhook.ts:115-126` and `apps/www/.../route.ts:98-110` process `checkout.session.completed` without checking `session.payment_status`, so webhook delivery can grant a paid tier from an unpaid session. **Next action:** add a `payment_status === 'paid'` (or `'no_payment_required'`) guard in both webhook handlers before any tier grant; add a regression test.

**P3-cors — verifier OVERRODE PARTIAL → OPEN (security).** `packages/server/src/index.ts:46` passes `{ origin: config.corsOrigin }` (raw array) to `@fastify/cors`, which does substring/`includes`-style matching — vulnerable to suffix attacks (e.g. `localhost:1420.evil.com`). The local server already does it right at `index.ts:1912-1920` via `corsOriginAllowed()` (`cors-config.ts:57-59`). **Next action:** unify the team server onto the callback-based exact-match `corsOriginAllowed()`; set `CORS_ORIGIN` in both deploy manifests; add a test asserting lookalike-origin rejection. Treat as a release blocker for any team-server deployment.

**P3-deploy — PARTIAL.** `render.yaml` and `docker-compose.production.yml` declare DB/Redis/Anthropic/Clerk but **omit** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`, and `CORS_ORIGIN`. Non-root Docker user is correctly set (`Dockerfile:91-115`). **Next action:** add the Stripe + CORS env vars (`sync:false`) to both manifests; resolve the `render.yaml:16` build-path mismatch (`cd app` vs package.json `cd apps/web`) — confirm/alias or fix, since it is a latent deploy failure; document that `apps/www` is a separate Next.js deployment.

**P3-sign — PARTIAL (partly platform-blocked, see §4).** `release.yml` passes no signing secrets for Windows or macOS; the updater manifest hard-codes `signature:""` for all three targets (R7-008); pilot self-sign scripts exist but are manual. **Next action (codeable on Windows):** wire Windows EV cert + `TAURI_PRIVATE_KEY`/`TAURI_KEY_PASSWORD` into `release.yml`, add the GitHub Actions secrets, and populate the updater `signature` field from the signing step. Cert procurement (timeline T+14/2026-05-21 start) appears **overdue** with no in-repo evidence.

**P3-cli — PARTIAL.** `bin → dist/.js` routing works and workspace deps resolve, but `@waggle/cli` lacks `files`, `publishConfig.access`, standard metadata (`repository`/`bugs`/`homepage`/`types`/`author`/`keywords`/`engines`), and `exports` — so it would publish tests/src. **Next action:** mirror `hive-mind-cli`'s package.json publishing config.

**discovered-drift — verifier OVERRODE CLOSED → PARTIAL.** The stale `packages/core/src/mind/**` trigger paths in `sync-mind.yml` and `mind-parity-check.yml` won't fire (files moved to `packages/hive-mind-core` on `3b556c0`), but the shell scripts still hard-code stale paths (`mind-parity-check.yml:118,170-171`) and there's no re-activation runbook — inert by accident, not by design. **Next action:** either delete the deprecated workflows or clean the hard-coded paths and add a one-line runbook note.

### Phase 4 (WS-D) — light mode + a11y/perf — OPEN / PARTIAL
**P4-light — OPEN. The Phase 7d "light-mode finish" claim is materially false.** Verified: only `--status-healthy` has a light value (`index.css:190`); `--status-warning/error/info/ai` and `--kg-person/project/concept/org/default` have **no** light variants; 60+ component files still use hardcoded Tailwind classes (e.g. `UserProfileApp.tsx:232,268,279`); commit `6a3d598` explicitly states "Contrast NOT visually validated (no binary build)"; TRUST-REPORT puts it at "~0.6% done". **Next actions:** add the 4 missing status tokens + 5 KG tokens to the light-theme block; migrate hardcoded classes to semantic tokens; run an independent WCAG-AA contrast audit; review the ~13 flagged mid-tone `text-*-300` accents for regression.

**P4-a11y-perf — PARTIAL.** `ComplianceTemplateModal` has `role="dialog"`/`aria-modal` but no Escape handler, no `aria-labelledby`, no focus trap; `TrialExpiredModal`/`UpgradeModal` have Escape + labelledby but only focus-on-mount (no trap). Window min/max/close controls are absent (`tauri.conf.json:37` `decorations=true`, no custom titlebar). Harvest dedup is **half-wired**: `last_content_hash` exists in DDL and `recordSync()` accepts a 4th `contentHash` arg, but all three callsites (`harvest.ts:409`, `index.ts:1226`, `index.ts:1449`) pass only 3 args, so the O(n·500) rescan persists. **Next actions:** add Escape + `aria-labelledby` + a shared focus-trap to all three modals; build the custom Tauri titlebar; compute SHA-256 `contentHash`, pass it at all three callsites, and add the dedup skip on `last_content_hash`.

### Phase 5 — not present in reconciliation set
No Phase 5 clusters were verified in this pass. The plan's Phase 5 items are **unreconciled** here — treat as untracked and re-scope before GA sign-off (do not assume closed).

## 4. Platform-blocked on Windows (cannot be completed in this env)
These require a macOS host and/or real signed binary runtime and are **not codeable here**:
- **R7-008 / macOS signing + notarization** — Developer ID signing and `notarytool` need a Mac; the updater `signature` field cannot be populated with a real signature without an actual signed-build pipeline. (Windows EV signing *can* be wired from here once the cert is procured; only the mac half and live signature generation are blocked.)
- **Binary runtime smokes** — light-mode contrast validation, modal a11y smoke, and window-controls verification that the Phase 7d commit explicitly deferred ("no binary build") need a built desktop binary to observe; they cannot be visually validated in this environment.

## 5. Recommended next workflow
Fix the two security downgrades first as a TDD security pass — **P3-cors exact-match unification + P3-stripe webhook `payment_status` gate** (write failing tests, fix, verify), then run the Phase 2 E2E/failure-injection build-out and Phase 3 deploy-env wiring; defer all macOS-signing/binary-runtime items to a Mac/CI environment.

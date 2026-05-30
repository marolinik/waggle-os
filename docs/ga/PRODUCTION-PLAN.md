# Waggle OS → GA Production Plan

**Date:** 2026-05-29 · **Owner:** Marko (solo) · **Surfaces:** web SaaS **+** signed desktop (Win+mac) · **Horizon:** 6–8 weeks (thorough)
**Companions:** `TRUST-REPORT.md` (verified state) · `OPERATING-MANUAL.md` (how to run it as a fleet)

> This plan starts from *verified* reality, not the audit's claims or the commit log. Every phase closes specific findings (IDs trace to `TRUST-REPORT.md`), names the workflow that does the work, and states an **exit gate** that is *independently re-verified* — never self-graded.

---

## 0. Post-merge status — 2026-05-29 (Phase 0 + Phase 1 LANDED on `main`)

`ga/phase0-gates` (6 commits) was rebased onto `main` after the other session landed `hardening/phase7-closeout` (main `0f6bb4c → ee923d5`: Phase7a–e). Fast-forward merged to **`main @ 12c60e8`**. Re-verified on the rebased tree before merge: `tsc --build` (all pkgs) exit 0 · 65 security/D1/billing tests green · `eslint .` 0 errors / 970 warnings (ratchet backlog).

**Landed on main:**
- `9f76344` AV-1/AV-2/AV-5 — network/auth boundary residuals closed
- `3a4f70a` AV-3/R2-006 — dev tier-override gated (`WAGGLE_ALLOW_TIER_OVERRIDE=1` to enable in dev/test), debug-log recon trimmed
- `0e4dfa7` R1-011/R6-005 — Stripe webhook serialized, rate-limit mkdir
- `d28abed` **D1** — bearer token required even on loopback; same-origin `/api/auth/session-token` bootstrap; webview `connect()` fetches it
- `12c60e8` D1 test reconciliation (test env defaults trust ON; D1 tests opt into secure path)
- `811ec78` Phase0 gates — lint + tauri-tsc wired into `ci.yml` (eslint.config.js deferred to main's Phase7c config to avoid a competing gate)

**⚠️ D1 SHIPPED WITHOUT A DESKTOP SMOKE-TEST** (couldn't launch Tauri headlessly). The webview `connect()` bootstrap (HTTP `/api/auth/session-token` → `authToken` → `/ws ?token=`) is tested at the server/unit level only.
> **REVERT SWITCH if the desktop app bricks on first-run connect:** set env `WAGGLE_TRUST_LOCALHOST=1` — restores the loopback-trust exemption (reverts D1 behaviorally without reverting the commit). Verify the live desktop build at the next opportunity, then remove the switch.

**Not yet done:** push to `origin` (handoff state was local-only) · cut GA tag · the remaining Phase 2–5 workstreams below.

---

## 1. Definition of GA (the bar you chose)

GA = **both surfaces shippable to a paying stranger**, not just "tests pass."

**Desktop (Tauri, Win+mac):** signed + notarized installers; auto-updater verifies signatures; no orphaned sidecar; first-run works offline-to-online; local-trust threat model closed.
**Web SaaS:** deployable (render/docker) with live-mode Stripe, Clerk prod, prod-origin CORS, multi-tenant isolation; the `apps/www` landing live.
**Both:** all 5 quality gates give real signal; security cluster closed under adversarial re-verification; real E2E + failure-injection suite green in CI; light mode actually usable.
**Strategic:** the Enterprise CTA → KVARK path is wired (Waggle's job is to qualify KVARK demand — a credible GA *is* the demand engine).

**GA gate checklist** (Phase 5 verifies all):
- [ ] 5/5 gates real (build-web ✅, build-packages ✅, **lint**, **tauri-tsc**, test-no-flake)
- [ ] Security: AV-1..5 + R2-006 + R6-005 + R1-011 closed; verification workflow re-run → all skeptics "holds"
- [ ] E2E journeys (5 personas) + failure-injection suite green in CI
- [ ] Win signed + mac notarized installers from CI; updater verifies a real signed release
- [ ] Web deploys to staging; live-mode Stripe checkout + webhook round-trips; prod CORS exact-match
- [ ] drizzle 0.44→0.45 migrated; light-mode contrast audit passes (independently); a11y basics
- [ ] 31+ commits pushed; tag cut

---

## 2. Two decisions to make first (they gate everything)

**D1 — The localhost-trust threat model (strategic).** Today `security-middleware.ts` exempts *all* loopback callers from bearer auth. AV-3 (PATCH /api/tier free upgrade) proves any local web page/extension/app can drive the authenticated API. For a desktop app coexisting with browsers, "local = trusted" is unsafe.
→ **Decide:** require the bearer token (or a per-origin capability token) even on loopback, with the Tauri webview holding the only token. This reframes WS-A from "patch sibling routes" to "remove the trust exemption." **Recommended.** Defer only if you accept that any local software can act as the user.

**D2 — Gate repair is Workstream-0, not optional.** Until `lint` + `tauri-tsc` give signal, you're hardening blind on two axes. Do it before any other fix lands so every subsequent phase gets real verification.

---

## 3. Workstreams (mapped to verified residuals)

| WS | Theme | Closes (verified open items) |
|---|---|---|
| **0** | Gate repair + signal | lint-gate, tauri-tsc, CI branch target |
| **A** | Security to GA | D1 decision, AV-1, AV-2, AV-3, AV-5, R2-006, R6-005, R1-011 (mutex), R6-007 (wire Zod) |
| **B** | Real verification | E2E journeys, synthetic-failure injection, sibling-path sweep, R3-002 test, re-verify loop |
| **C** | Build / Release / Distribution | Win+mac signing, updater signatures, macOS notarize, npx publishable, web deploy (Stripe live, Clerk prod, prod CORS), R9-001 drizzle migration, AV-4 |
| **D** | UX to GA | R5-006 (light-mode systemic), R5-002/003, R5-004/005 (a11y), R3-004 (hot-path perf), addictiveness-audit feature triage, first-run |

---

## 4. Phased sequence (solo, ~6–8 weeks)

Each phase: **Goal · Closes · Workflow (from OPERATING-MANUAL) · Exit gate.** Fixes run on **isolated worktrees**; you keep the commit bit; every phase ends with an **independent re-verify**.

### Phase 0 — Make signal real (Days 1–3) · WS-0
- **Goal:** all 5 gates give true signal; full launch-line gap list captured; D1 decided.
- **Do:** add root `eslint.config.js` (flat) covering `packages/*`, `app/*`, `apps/*` (or scope `lint` script explicitly + lint each workspace); repoint or retire the `tauri-tsc` gate (point `app/tsconfig.json` at real `app/scripts`+`app/tests`, or delete the dead gate); fix CI branch target if still `master`. Record D1.
- **Workflow:** `2.4 release-readiness` (read-only) → the authoritative gap list for WS-C.
- **Exit:** `npm run lint` lints >0 files and is green or has a triaged error list; `tsc` for the Tauri layer compiles real files; CI runs all 5 gates on the branch.

### Phase 1 — Close security to GA (Weeks 1–2) · WS-A
- **Goal:** no unauthenticated/over-trusted path to authenticated APIs, billing, or fs.
- **Closes:** D1 (remove/replace loopback-auth exemption) → which structurally kills AV-3; then AV-1 (block empty Host), AV-2 (route waggle-signals SSE + agent-run through `corsOriginAllowed`), AV-5 (recognize `localhost`/`::1`/`::ffff:` as loopback), R2-006 (limit debug-logs columns+rows), R6-005 (confine mkdir + tight rate-limit), R1-011 (promise-queue mutex on webhook writes), R6-007 (wire `@waggle/shared` Zod into the 4 local fs routes).
- **Workflow:** `2.2 fix-execution` (worktrees; `model:'opus'` for the auth/threat-model changes) → then **re-run `2.1 verification`** with the adversarial skeptics.
- **Exit:** verification re-run shows security + billing clusters all `holds`; new tests cover empty-Host, origin-reflection, PATCH /api/tier denial, mkdir confinement, webhook race.

### Phase 2 — Real verification infrastructure (Weeks 2–3) · WS-B
- **Goal:** "done" means proven. Institutionalize catching the sibling-path gap-class (the thing the self-grading missed).
- **Closes:** zero-browser-E2E gap; untested failure paths (network drop mid-stream, capability-missing hard error, traversal-rejected, unpaid-tier gate, sidecar restart); R3-002 (circular-dep test).
- **Workflow:** `2.3 e2e-synth` → generate Playwright journeys for the 5 personas + a failure-injection test per path; land them; wire `test:all` into CI. Add a recurring `2.1 verification` as a pre-merge step.
- **Exit:** E2E + failure-injection suite green in CI; the 5 audit personas have real browser coverage; error-recovery is *tested*, not asserted.

### Phase 3 — Build / Release / Distribution, both surfaces (Weeks 3–5) · WS-C
- **Goal:** CI emits shippable artifacts for both surfaces.
- **Desktop:** Windows code-signing cert wired into `tauri.conf` + `release.yml`; macOS build target + Developer ID + notarization; fix updater `signature:""` so signed auto-updates verify (R7-008); npx-publishable CLI (bin→built .js, workspace deps resolve).
- **Web:** complete `render.yaml`/`docker-compose.production` deploy; live-mode Stripe (incl. AV-4: validate `billingPeriod`, fail-closed on missing annual price); Clerk prod; **prod-origin CORS exact-match on the team server** (`packages/server/src/index.ts` currently uses raw `CORS_ORIGIN` env, disconnected from `corsOriginAllowed` — unify it); Docker non-root.
- **Migration:** R9-001 drizzle 0.44→0.45 (+ re-tsc + server tests) — its own sub-task with full build verify.
- **Workflow:** `2.4 release-readiness` to drive the checklist; `2.2 fix-execution` for the migration + signing wiring.
- **Exit:** CI produces a signed Win installer + notarized mac DMG; updater verifies a real signed release; web deploys to staging and a live-mode test checkout + webhook round-trips; drizzle migrated, build+tests green.

### Phase 4 — UX to GA (Weeks 5–7) · WS-D
- **Goal:** light mode usable, a11y basics, hot-path perf, stickiness triaged.
- **Closes:** R5-006 (the 358 hardcoded colors → semantic tokens), R5-002/003 (add light-theme values for status tokens), R5-004 (modal role/aria/Escape/focus-trap), R5-005 (window controls), R3-004 (add `content_hash` column → kill O(n·500) on harvest), addictiveness-audit `FEATURE-REQUESTS.md` triaged into GA-must vs post-GA.
- **Workflow:** a Haiku-heavy mechanical sweep (palette→token) parallelized by component cluster, then an **independent contrast/verify pass** (don't self-grade the light mode — that's the 10/10 trap); `2.2` for a11y + perf.
- **Exit:** independent light-mode contrast audit passes (WCAG AA on load-bearing text); a11y smoke on the three modals; large-harvest no longer blocks the event loop; feature list triaged.

### Phase 5 — GA cut (Weeks 7–8)
- **Goal:** ship.
- **Do:** full `2.1 verification` over the *entire* audit + new tests; `2.4 release-readiness` all green; 5/5 gates green; push the (now 40+) commits; tag; cut beta → GA; wire Enterprise CTA → kvark.ai.
- **Exit:** GA gate checklist (§1) 100%.

---

## 5. Immediate next actions (this week)

1. **Concurrent session:** let it finish + **push** the 31 commits to `origin/hardening/prod-readiness` so both lanes share a base. One designated session pushes.
2. **This/integration session:** start **Phase 0 (gate repair)** on a fresh worktree (`git worktree add ../waggle-os-ga hardening/prod-readiness`) — it's read-mostly config work, lowest collision risk, highest signal payoff.
3. **Decide D1** (localhost-trust) — it reshapes Phase 1. I recommend "require token even on loopback."
4. Feed `TRUST-REPORT.md`'s open items as the `residuals` arg into the `2.2 fix-execution` workflow.

---

## 6. Sync protocol (active — two sessions live)

Per `OPERATING-MANUAL.md §5`: one session owns the shared tree; all *additional* mutation on new worktrees; verification stays read-only; one session pushes; deliverable docs live here in `North star/waggle-ga/` until a session owns the tree, then fold into `waggle-os/docs/`. **Recommended handoff:** fixing session pushes → this report identifies residuals → a single integration session works residuals on a worktree → merge → re-verify → GA.

---

## 7. Risks & how the fleet de-risks them

| Risk | Mitigation |
|---|---|
| Self-graded fixes hide sibling-path gaps (the recurring failure) | Phase 2 makes independent adversarial re-verify a *pre-merge gate*, not a one-off. |
| Solo bandwidth across 5 phases | Fan-out per workstream; Haiku for mechanical bulk (light-mode), Opus for security/threat-model; background workflows while you steer. |
| drizzle major migration breaks runtime (already bit once) | Isolated worktree + full re-tsc + the 19 server test files as the exit gate before merge. |
| Light-mode "looks done" but isn't (it's 0.6% now) | Independent contrast audit, not self-assessment — same doctrine as security. |
| Two sessions corrupt the tree | Worktree-per-stream is non-negotiable; only one writer per tree. |
| Scope creep from addictiveness feature-requests | Triaged into GA-must vs post-GA in Phase 4; default post-GA. |

---

*Plan is intentionally verification-anchored: if a later re-run of the verification workflow contradicts a "closed" item here, the re-run wins and the item reopens.*

# MASTER BACKLOG — 2026-04-18 (v2 · SOTA-gated launch)
### Three tiers · Test gate per step · Launch gated by benchmark proof

**Purpose:** Single definitive list. Everything we can do ourselves, organized into three tiers (High / Medium / Low), with explicit sub-steps and a test-gate per item. Externals (OpenAI export wait, EV cert purchase, Apple Dev account purchase, Perplexity manual export) are carved out — but preparatory integration work that lands around them is included.

**v2 LOCKED decisions (Marko, April 18, 2026):**
- **[M]-07 RESOLVED** — Ship `hive-mind` OSS + Waggle beta *together*, but public launch is GATED by SOTA benchmark proof. No launch without LoCoMo ≥ 91.6% OR equivalent competitive showing (e.g., SOTA on temporal/adversarial subsections, OR top 3 on SWE-ContextBench).
- **[M]-11 Pricing LOCKED** — Pro $19/mo + Teams $49/seat/mo. Final. Any doc or UI that still shows $29/$79/$15 is stale and must be corrected.
- **H-34 effort LOCKED** — 5-10 days wall time, no compression. hive-mind source extraction is real work.
- **Critical path reshapes:** Benchmark block (H-42/43/44) replaces Papers as the launch gate. Papers are publication output; benchmarks are the ship gate.

**State at write-time:** main @ `1c304cd`, tree clean, 200 commits ahead of origin. Phase A = 5/6 done (QW-3 verified in code at `apps/web/src/pages/Index.tsx:15-17`, needs Playwright regression only).

**Supersedes:** `BACKLOG-FULL-2026-04-18.md`, `BACKLOG-CONSOLIDATED-2026-04-17.md`, `POLISH-SPRINT-2026-04-18.md`, `PDF-E2E-ISSUES-2026-04-17.md`.

---

## Tier definitions

| Tier | Meaning | Examples |
|---|---|---|
| **HIGH** | Ship-blocking. Paper/launch cannot happen without. | GEPA wiring closure, Phase 1 harvest, core UX bugs, Phase 4-6 proofs, Stripe integration (code), binary build |
| **MEDIUM** | Ship-quality. Polish/UX. Launch defensible without it but rough. | PersonaSwitcher redesign, compliance PDF route, Wiki v2, Ollama installer, engagement features |
| **LOW** | Post-launch OK. Accessibility, responsive, tech debt, advanced features. | A11Y sweep, responsive collapses, dead `app/` removal, ContextRail deeper integration |

## Test-gate principle

**Every item ends with a Verify step. No item is "done" without it.**

Standard gates after each change:

```bash
npx tsc --noEmit --project packages/<touched>/tsconfig.json   # type check
npm run test -- --run <touched test files>                    # vitest green
npm run lint                                                   # eslint repo-wide
npx playwright test <relevant spec>                            # only if UI changed
```

Plus PostToolUse hooks run automatically: Prettier + tsc + console.log scan. Stop hook audits console.log repo-wide before session ends. One commit per item. Tree must be clean between items.

---

## Marko-side queue (non-coding, non-external)

What Marko can do that unblocks engineering. Externals excluded (OpenAI export wait, EV cert purchase, Apple Dev account purchase).

| ID | Task | Unblocks | Effort |
|---|---|---|---|
| **[M]-01** | **Stripe products** — in Stripe dashboard, create Pro ($19/mo) and Teams ($49/seat/mo) products per [M]-11 LOCKED pricing; capture `STRIPE_PRICE_PRO` + `STRIPE_PRICE_TEAMS` IDs | H-26 through H-33 (Stripe integration block) | 1 hr (guided) |
| [M]-02 | Judge model list revision (after w4/w25 proofs) | Phase 5 judging | Decision |
| [M]-03 | Warm-list names — 5-10 contacts to pre-email T-72h | Launch credibility | 30 min |
| [M]-04 | Papers attribution — single-author or dual-author? | Paper 1 + Paper 2 | Decision |
| [M]-05 | Marketplace model — free-with-attribution / freemium / enterprise-only? | L-12 marketplace monetization | Decision |
| [M]-06 | EvolveSchema attribution — credit Mikhail vs Zhang et al. (ACE) | Paper 2 framing | Decision |
| **[M]-07** | **RESOLVED (2026-04-18):** Ship hive-mind OSS + Waggle beta **together**, launch gated by SOTA benchmark proof. No public release without LoCoMo ≥ 91.6% OR competitive subsection showing (temporal / adversarial) OR SWE-ContextBench top 3. hive-mind OSS launch serves as Waggle launch narrative vehicle. | H-34 + H-42/43/44 sequencing | ✅ Locked |
| [M]-08 | Harvest-first onboarding — replace step 2 or parallel opt-in? | ENG-5 (M-26) | Decision |
| [M]-09 | Peer reviewer outreach — send the email I draft | Paper 1 validation | 10 min (after I draft) |
| [M]-10 | Launch date greenlight — **contingent on H-42/43/44 results**, not a fixed date | Launch block | Decision (after benchmarks) |
| **[M]-11** | **Stripe pricing LOCKED (2026-04-18):** Pro $19/mo, Teams $49/seat/mo. Final. | Stripe integration + all pricing copy | ✅ Locked |
| [M]-12..14 | Other strategic decisions — TBD in later sessions, do not block current sprint | — | TBD |

---

## HIGH tier — ship-blocking (~55 items · ~50 eng days)

Ordered by dependency, not alphabetically. Each item has Sub-steps · Verify · Effort · Deps.

### Block H1 — Polish Phase A closure (1 item)

#### H-01 · QW-3 · Skip boot screen on return visits
- Read `apps/web/src/pages/Index.tsx:16` and verify the `BOOT_KEY` localStorage check works.
- If broken: fix skip logic + ensure flag persists across sessions.
- **Verify:** Playwright — first visit shows BootScreen, second visit goes straight to Desktop.
- **Effort:** 15-30 min · **Owner:** me · **Deps:** none

### Block H2 — Polish Phase B core bugs (5 items)

#### H-02 · P35 · Spawn-agent "no models available"
- Read `apps/web/src/components/os/apps/SpawnAgentPanel.tsx` (or equivalent) to find the models dropdown source.
- Replace hardcoded/empty list with live fetch from `GET /api/providers` (returns 13 green providers today).
- Filter by tier availability from `TIER_CAPABILITIES`.
- Empty state: CTA "Add a key in Settings → Vault" instead of "check backend config".
- **Verify:** Playwright — open spawn panel, assert dropdown has ≥1 model OR empty-state CTA is visible. Unit test for provider-list mapper.
- **Effort:** 2-3 hr · **Owner:** me · **Deps:** none

#### H-03 · P36 · Dock spawn-agent icon wiring
- Inspect `apps/web/src/components/os/Dock.tsx` spawn-agent icon click handler.
- If missing: wire to `openSpawnAgentPanel` dispatcher.
- Confirm TaskCreate is called on submit from the panel.
- **Verify:** Playwright — click dock icon, panel opens; submit a spawn, assert POST to `/api/tasks`.
- **Effort:** 1 hr · **Owner:** me · **Deps:** H-02

#### H-04 · P40 · Light-mode BootScreen logo + animation
- Audit `apps/web/src/components/os/BootScreen.tsx` for `hive-950` / `text-honey` literals.
- Map animation colors to semantic tokens (`--text-primary`, `--bg-primary`, `--accent`).
- Ensure animation frames stay visible in light mode (check contrast ≥ 4.5).
- **Verify:** Playwright visual regression — BootScreen light mode snapshot matches approved baseline.
- **Effort:** 2 hr · **Owner:** me · **Deps:** none

#### H-05 · P41 · Light-mode "Waggle AI" header text
- Find the header component (likely `apps/web/src/components/os/StatusBar.tsx` or a header sibling).
- Replace any hive-950 direct refs with semantic token.
- Adjust font weight / color for light mode readability.
- **Verify:** Playwright visual test light-mode header. Manual contrast check.
- **Effort:** 30 min · **Owner:** me · **Deps:** H-04

#### H-06 · CR-2 · Residual `hive-950` → semantic token sweep
- `grep -r "hive-950\|#08090c" apps/web/src` — map every remaining direct ref to `var(--bg-primary)` or equivalent.
- Do NOT touch `waggle-theme.css` itself (that's where hive-950 legitimately lives as a dark token).
- **Verify:** grep passes with only `waggle-theme.css` matches remaining. Playwright visual regression across 5 key screens (desktop, chat, memory, settings, onboarding).
- **Effort:** 2 hr · **Owner:** me · **Deps:** H-04, H-05

### Block H3 — GEPA wiring closure (4 items)

Per CLAUDE.md §11 + `BACKLOG-FULL-2026-04-18.md` §5. These 4 gaps block the Phase 5 GEPA proof from producing a defensible real-behavior improvement.

#### H-07 · G4 · Trace outcome audit + finalization coverage
- Audit `packages/server/src/local/routes/chat.ts:1231` — what outcome gets emitted on (a) successful final message, (b) mid-turn tool error, (c) SSE disconnect, (d) rate-limit failure, (e) empty-text turns?
- Document the matrix. Ensure `'success'` is emitted for valid turns.
- Backfill migration: scan existing traces, set `outcome='success'` where final message non-empty + no fatal error was stored.
- Add counter in evolution dashboard: "Eligible traces available: N" with tooltip explaining the threshold.
- Improve `EvalDatasetBuilder` "no eligible traces" error → explain WHY (too few / all abandoned / none in date range).
- **Verify:** Vitest `packages/agent/tests/eval-dataset.test.ts` passes with a live-fixture trace dataset. New test: chat-turn → finalize → outcome='success'. Dashboard counter test in Playwright.
- **Effort:** 0.5 day · **Owner:** me · **Deps:** none

#### H-08 · G2 · Override-aware system prompt loader
- Create `loadSystemPromptWithOverrides(waggleDir)` in `packages/agent/src/prompt-loader.ts`.
- Composes: base BEHAVIORAL_SPEC → `buildActiveBehavioralSpec(overrides)` → `getPersona(id)` + custom-personas → disk `system-prompt.md` append.
- Migrate all current callers of `loadSystemPrompt` to the override-aware version (grep; expect small call-site count).
- Keep the bare `loadSystemPrompt` exported for test isolation only; add deprecation comment.
- Add a startup assertion: if override files exist on disk but activeBehavioralSpec doesn't reflect them, log structured warning.
- **Verify:** New Vitest `prompt-loader-with-overrides.test.ts` with fixture overrides + persona files. Integration test: deploy via evolution accept → chat turn uses override.
- **Effort:** 2-4 hr · **Owner:** me · **Deps:** none

#### H-09 · G3 · Running-judge wiring audit
- Grep every caller of `IterativeGEPA.run` and check whether it passes a bare judge or one wrapped with `makeRunningJudge`.
- Known-good: `/api/evolution/run` (evolution.ts:377). Known-suspect: `iterative-optimizer.ts`, `scripts/evolution-hypothesis.mjs`.
- For each suspect caller: wrap with `makeRunningJudge(base, llm)`.
- Add phantom-type brand to `makeRunningJudge` return so `IterativeGEPA.run` can enforce at compile time.
- **Verify:** Vitest asserts `IterativeGEPA.run()` rejects bare judges with a clear error. Existing `makeRunningJudge` tests still pass.
- **Effort:** 2-4 hr · **Owner:** me · **Deps:** none

#### H-10 · G1 · Evolution service + cron scheduler
- Create `packages/server/src/local/services/evolution-service.ts`: owns a daemon loop + auto-trigger policy.
- Register evolution cron in `cron-service.ts` — configurable cadence, default daily at low-traffic hour, off by default.
- Minimum-dataset gate: skip run when trace pool < N eligible examples (default 20).
- Reuse the HTTP endpoint's path for on-demand — UI "Run now" button (already shipped in Phase 8.5) hits the same service.
- Settings toggle: "Enable nightly self-evolution" + cadence picker.
- **Verify:** Vitest for gate logic (under/over threshold). Integration test: register cron → fast-forward → runOnce called → run recorded. Settings toggle E2E.
- **Effort:** 0.5-1 day · **Owner:** me · **Deps:** H-07 (traces must be eligible to mine)

### Block H4 — Phase 1 Harvest real data (9 items — mostly work we execute as M1 data arrives + concurrent)

#### H-11 · 1.3 · Re-harvest Claude Code fresh
- Run full harvest of Claude Code history into personal.mind.
- Dedup against existing 156 frames.
- **Verify:** Frame count delta > 0, no duplicates (dedup hash check). Mind health report shows harvest source distribution.
- **Effort:** 0.5 day · **Owner:** me · **Deps:** none

#### H-12 · 1.2 · Import Claude conversations (Anthropic export DONE per M2)
- Feed the Anthropic export archive through the Claude adapter.
- **Verify:** Frames added with source='claude', dedup verified, no parse errors.
- **Effort:** 1 hr (script run + verify) · **Owner:** me · **Deps:** [M]-02 ✅

#### H-13 · 1.4 · Import Gemini conversations (Google export DONE per M3)
- Feed Google Takeout Gemini JSON through Gemini adapter.
- **Verify:** Frames source='gemini', dedup verified, date range coverage.
- **Effort:** 1 hr · **Owner:** me · **Deps:** [M]-03 ✅

#### H-14 · 1.6 · Cursor adapter build
- Study Cursor's conversation export format.
- Write adapter in `packages/core/src/harvest/adapters/cursor.ts`.
- Wire into `pipeline.ts` dispatcher.
- **Verify:** Unit tests for parse → frame. Integration test: sample Cursor export → N frames → cognify pipeline runs.
- **Effort:** 0.5-1 day · **Owner:** me · **Deps:** none

#### H-15 · 1.5 · Import Perplexity (SKIPPED per user direction)
- Marked skipped in Marko queue. Not a blocker.
- **Verify:** n/a
- **Effort:** n/a · **Owner:** —

#### H-16 · 1.1 · Import ChatGPT conversations (waits on M1)
- Queue: when OpenAI export email arrives, run adapter.
- **Verify:** Frames source='chatgpt', dedup verified.
- **Effort:** 1 hr · **Owner:** me · **Deps:** ⏳ external M1 — kept as ready-to-go item

#### H-17 · 1.7 · Post-harvest cognify on imported frames
- Trigger cognify pipeline on all newly harvested frames (extract entities, concepts, write to KG).
- Dashboard progress UI.
- **Verify:** KG node count delta > 0. Concepts table populated. Vitest for cognify pipeline end-to-end.
- **Effort:** 2-3 hr · **Owner:** me · **Deps:** H-11, H-12, H-13

#### H-18 · 1.8 · Identity auto-populate from harvest
- Pipeline reads harvested frames, extracts identity signals (name, role, projects, relationships), populates IdentityLayer.
- Surface in Settings → Identity for user confirmation.
- **Verify:** Vitest for identity extractor with fixture frames. Playwright Settings shows populated identity.
- **Effort:** 4 hr · **Owner:** me · **Deps:** H-17

#### H-19 · 1.9 · Wiki compile from real data
- After harvest + cognify complete, trigger full wiki compilation.
- Verify adapter outputs, page counts, entity coverage.
- **Verify:** Wiki page count ≥ expected threshold. Sample N pages render without errors.
- **Effort:** 2 hr · **Owner:** me · **Deps:** H-17

#### H-20 · GATE · Harvest dataset threshold
- 10K-50K frames target, dedup verified, KG populated.
- **Verify:** Mind health report passes all checks. Documented in handoff.
- **Effort:** checkpoint only · **Owner:** me · **Deps:** H-11 through H-19

### Block H5 — Phase 4 Memory Proof (from MEMORY-HARVEST-TEST-PLAN.docx, 10 days, $300-500)

Test plan referenced in docx. Items extracted from the plan structure (detailed steps live in the docx):

#### H-21 · Phase 4 · Memory Proof execution
- Set up baseline (Claude 3.5 Sonnet on bare prompts, no memory).
- Set up treatment (Waggle with harvested personal.mind + agent-loop).
- Run paired queries (~50 queries) against both, 3 seeds each.
- Judge responses with 4-judge ensemble per PA v5 protocol.
- Compute effect size + confidence interval.
- **Verify:** Eval results committed to `docs/results/MEMORY-PROOF-RESULTS.md`. Win-rate ≥ statistically significant threshold. Dataset + seeds committed (gitignored raw) for replication.
- **Effort:** 10 days · **Owner:** me · **Deps:** H-20 (harvest gate), [M]-02 judge list

### Block H6 — Phase 5 GEPA Full-System Proof (from GEPA-EVOLUTION-TEST-PLAN.docx, 18 days, $1.5-2.5k)

#### H-22 · Phase 5 · GEPA Proof execution
- Baseline: Gemma 4 31B + Waggle persona prompts as-shipped.
- Treatment: same model + Waggle + evolved prompts (run evolution N cycles against held-out trace eval set).
- Paired queries, ensemble judging.
- **Verify:** Results committed. Effect size + CI. Evolution lineage reproducible from committed run records.
- **Effort:** 18 days · **Owner:** me · **Deps:** H-07 through H-10 (GEPA wiring closure MUST land first — proof is meaningless without the running judge end-to-end), H-20

### Block H7 — Phase 5b Combined Effect Proof (6 days, ~$500)

#### H-23 · Phase 5b · Combined proof
- Treatment: Memory + Evolved prompts + Gemma 4 31B.
- Control: Memory only (no evolved prompts).
- Measures additive effect of evolution on top of memory.
- **Verify:** Results committed. Decomposition of memory-only vs combined deltas.
- **Effort:** 6 days · **Owner:** me · **Deps:** H-21, H-22

### Block H8 — Phase 6 Papers (5 days writing + Marko peer review)

#### H-24 · Paper 1 · Memory system paper draft
- Write arXiv draft using Phase 4 results.
- Cite prior work (RAG, long-context, memory MCP, etc).
- Format: arXiv template, figures committed as SVG.
- **Verify:** Peer-reviewer feedback incorporated. Arxiv-ready LaTeX builds cleanly.
- **Effort:** 3 days · **Owner:** me + [M]-09 (peer review send) · **Deps:** H-21

#### H-25 · Paper 2 · GEPA + Combined paper draft
- Write arXiv draft using Phase 5 + Phase 5b results.
- EvolveSchema attribution per [M]-06.
- **Verify:** Peer-reviewer feedback incorporated. Arxiv-ready.
- **Effort:** 3 days · **Owner:** me + [M]-09 · **Deps:** H-22, H-23, [M]-06

### Block H9 — Stripe integration (M7 decomposed — 8 items, most doable today)

Marko creates products in dashboard ([M]-01). Everything else is my wiring. Works in Stripe test mode without real products; plugs into real IDs when [M]-01 lands.

#### H-26 · Stripe webhook endpoint
- Route: `POST /api/stripe/webhook`.
- Raw body handling (Fastify rawBody plugin if not present).
- Signature verification with `STRIPE_WEBHOOK_SECRET` from vault.
- Idempotency via event ID dedup table.
- **Verify:** Vitest with Stripe webhook fixture payloads. 2xx for valid, 400 for bad signature.
- **Effort:** 3 hr · **Owner:** me · **Deps:** none

#### H-27 · Subscription → tier mapping
- On `customer.subscription.created/updated/deleted`, derive effective tier (FREE/PRO/TEAMS) from price ID.
- Persist to user record. Emit `tier:changed` event.
- **Verify:** Vitest mapping function for all 5 tiers. Integration test: webhook → user tier updated.
- **Effort:** 2 hr · **Owner:** me · **Deps:** H-26

#### H-28 · Upgrade flow UI
- Settings → Billing tab: "Upgrade to Pro" + "Upgrade to Teams" buttons.
- Checkout session creation via Stripe Checkout.
- Success redirect back to app with verification modal.
- **Verify:** Playwright — click upgrade → Stripe Checkout URL returned. Mock checkout success → tier updated in UI.
- **Effort:** 4 hr · **Owner:** me · **Deps:** H-27

#### H-29 · Billing portal link
- Settings → Billing: "Manage subscription" button → `stripe.billingPortal.sessions.create`.
- **Verify:** Playwright — click → portal URL returned.
- **Effort:** 1 hr · **Owner:** me · **Deps:** H-27

#### H-30 · Trial-to-paid conversion path
- On trial expiry (day 15), modal: "Your trial ended. Choose a plan."
- Modal CTAs trigger H-28 upgrade flow.
- **Verify:** Vitest trial-expiry detection. Playwright modal shows on expired trial.
- **Effort:** 2 hr · **Owner:** me · **Deps:** H-28

#### H-31 · Tier enforcement audit
- Verify every tier-gated feature checks `getEffectiveTier(user)` (kvark-tools, marketplace install, Teams apps, connectors).
- Add missing enforcement — Teams-only UI hidden for Free/Pro.
- **Verify:** Vitest matrix — every gated operation × every tier → allowed/denied per tiers.ts.
- **Effort:** 4 hr · **Owner:** me · **Deps:** H-27

#### H-32 · Embedding quota enforcement
- `TIER_CAPABILITIES.embeddingBudget` defined but not enforced.
- Add check in `packages/core/src/mind/embedding-provider.ts` before each embed.
- On exceed: throw `TIER_QUOTA_EXCEEDED`, UI shows upgrade toast.
- **Verify:** Vitest — embed under budget ok, over budget throws. Playwright toast on exceed.
- **Effort:** 3 hr · **Owner:** me · **Deps:** H-27

#### H-33 · Stripe test-mode smoke
- End-to-end against Stripe test env once [M]-01 products exist.
- Use `stripe fixtures` / trigger CLI.
- **Verify:** Documented smoke-test checklist in `docs/OPS/stripe-smoke.md`. Execute once → all pass.
- **Effort:** 2 hr · **Owner:** me · **Deps:** [M]-01, H-26..H-32

### Block H10 — Launch prep (infra) (7 items)

#### H-34 · hive-mind source extraction (CR-6)
- Scaffold already in `docs/HIVE-MIND-INTEGRATION-DESIGN.md`.
- Extract the Apache 2.0-safe subset: MCP resources, CLI, hooks, installer.
- Create separate repo at `hive-mind/` (or push to a new GH repo per [M]-07).
- **Verify:** Independent `npm install && npm test` in the extracted repo passes. No Waggle-proprietary imports remain.
- **Effort:** 2-3 days · **Owner:** me · **Deps:** [M]-07 timing decision

#### H-35 · Binary build + clean Windows VM smoke (CR-8)
- Run `npm run tauri build` on Windows.
- Install on clean VM, exercise onboarding → chat → memory → settings.
- Verify sidecar starts, no port collisions, no missing dylibs.
- **Verify:** Smoke checklist passes. Screenshots committed to `docs/OPS/smoke-2026-04-XX/`.
- **Effort:** 1 day · **Owner:** me · **Deps:** H-01..H-10 stable

#### H-36 · Clerk auth integration
- Clerk SDK in web app.
- Sign-in / sign-up UI.
- Map Clerk user → Waggle user record.
- **Verify:** Playwright — sign in → desktop loads with correct identity. Sign out → redirect to sign-in.
- **Effort:** 1 day · **Owner:** me · **Deps:** H-27 (tier mapping — Clerk auth plus Stripe subscription = full auth)

#### H-37 · Onboarding finalized (harvest-first per [M]-08)
- Per [M]-08 decision: replace step 2 with harvest pitch OR keep parallel opt-in.
- Wire OnboardingWizard accordingly.
- **Verify:** Playwright — complete onboarding with and without harvest → desktop state correct.
- **Effort:** 4 hr · **Owner:** me · **Deps:** [M]-08

#### H-38 · Landing page final polish (apps/www)
- Review `apps/www` for any stale copy / broken links.
- Verify contact form posts to our API (not 3rd party).
- Social cards, OG tags, favicon.
- **Verify:** Lighthouse ≥ 90 on perf, accessibility, SEO, best practices.
- **Effort:** 4 hr · **Owner:** me · **Deps:** none

#### H-39 · Windows code-signing integration (scaffolding ready for cert)
- Add signing step to CI pipeline reading `WAGGLE_SIGN_CERT` from GH secrets.
- Test with a throw-away self-signed cert for pipeline validation.
- Hook `tauri.conf.json` `bundle.windows` to signing tool.
- **Verify:** CI artifact passes SignTool validation with self-signed cert. Ready to swap in real cert on arrival.
- **Effort:** 3 hr · **Owner:** me · **Deps:** none

#### H-40 · Mac notarization integration (scaffolding ready for Apple Dev acct)
- Add `xcrun notarytool submit` step to CI.
- Read `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` from secrets.
- Local dry-run with `--dry-run` flag.
- **Verify:** CI step validates syntax. Ready to run once credentials exist.
- **Effort:** 2 hr · **Owner:** me · **Deps:** none

### Block H11 — Auto-updater signing (1 item)

#### H-41 · Auto-updater keypair + latest.json signing
- Generate Tauri updater keypair.
- Public key in `tauri.conf.json`, private key in CI secret.
- Sign releases → populate `signature` field in `latest.json`.
- **Verify:** End-to-end: publish new release → older install sees update → downloads + verifies + installs.
- **Effort:** 3 hr · **Owner:** me · **Deps:** H-35

### Block H12 — Public Benchmark Runs · LAUNCH GATING (3 items)

**Critical path per [M]-07 decision.** Launch is blocked until benchmarks validate architectural claims against current SOTA. These are NOT nice-to-have — they are the public proof that legitimates the hive-mind OSS positioning and the Waggle value prop.

**Honest risk posture (documented so we don't lie to ourselves later):**
- **Scenario A** — LoCoMo ≥ 91.6% on first run: 20-30% probability. Launch narrative: "new SOTA".
- **Scenario B** — LoCoMo 85-91%, tuning can help: 40-50% probability. Launch narrative: "SOTA in local-first category" or subsection SOTA. Legitimate but less hype-friendly.
- **Scenario C** — LoCoMo < 85%: 20-30% probability. Trigger architectural investigation. LoCoMo is ShareGPT-style casual dialogue — our bitemporal strengths may not map directly. Fallback: lean on SWE-ContextBench where architecture aligns better.

**SWE-ContextBench is our strongest terrain.** If LoCoMo is B/C but SWE-ContextBench is top 3, the legitimate launch narrative becomes "hive-mind dominates context reuse for coding agents" — stronger positioning for Waggle's consumer agent harness framing.

#### H-42 · LoCoMo benchmark run (LAUNCH GATING)
- Use `snap-research/locomo` evaluation harness as-is. Do NOT reimplement — the leaderboard legitimacy requires their harness.
- Run two configs: (a) **local** — inprocess embedder + Ollama + Gemma 4 31B answer model; (b) **frontier** — same memory stack + Opus 4.7 answer model. Both cut the same benchmark.
- Sub-benchmarks to report separately: single-hop, multi-hop, temporal, open-domain, adversarial.
- Commit full raw outputs + analysis to `docs/results/LOCOMO-RESULTS.md`. Raw JSON gitignored.
- If Scenario B: document the tuning plan (hybrid search weights, RRF constants, embedding model swap) and run one iteration. If iteration still B, ship as Scenario B, do not hide.
- **Verify:** 4-judge ensemble evaluation per PA v5 protocol. Reproducible from committed config + seeds. Result published in `docs/results/LOCOMO-RESULTS.md` with honest observations section (copy PA v5's pattern — it worked).
- **Effort:** 3-4 days (2d setup, 1-2d analysis + up to 1d tuning iteration)
- **Owner:** me · **Deps:** H-34 hive-mind extraction complete

#### H-43 · LongMemEval benchmark run (LAUNCH GATING)
- Same pattern as H-42 — run upstream harness, no reimplementation.
- Targets to beat: Letta ~83%, Zep 63.8%. SOTA is ~93.4%. Even matching Zep is a legitimate floor.
- Report per-category: session recall, reasoning, knowledge update, temporal, multi-session.
- **Verify:** Results at `docs/results/LONGMEMEVAL-RESULTS.md`. Peer-reviewable.
- **Effort:** 2-3 days
- **Owner:** me · **Deps:** H-34 complete. Independent of H-42; can run in parallel.

#### H-44 · SWE-ContextBench run (STRATEGIC DIFFERENTIATOR)
- Newer benchmark (Dec 2025) — directly measures context reuse across related coding tasks. Memory architecture most aligned with our bitemporal + I/P/B frame model.
- **Highest probability win (60-70% top-3 estimate).** Potential primary launch narrative.
- Run memory-configuration track. If competitive, also run end-to-end track (more work, bigger statement).
- **Verify:** Results at `docs/results/SWE-CONTEXTBENCH-RESULTS.md`. Submission to leaderboard if rules allow.
- **Effort:** 3 days
- **Owner:** me · **Deps:** H-34 complete. Can run in parallel with H-42/H-43 once extraction done.

**Block H12 gate decision:**
- If Scenario A on H-42: proceed to launch prep aggressively.
- If Scenario B: document position, optional tuning iteration (budget ≤ 5 days before committing to ship-as-is), check H-44 for compensating narrative.
- If Scenario C on H-42: pause launch-prep conversation, open architectural investigation (what does bitemporal NOT help? Is hybrid search weighted wrong for casual dialogue?), possibly re-frame hive-mind positioning around coding agents only.

---

## MEDIUM tier — ship-quality polish (~50 items · ~25 eng days)

### Block M1 — Polish Phase C · PersonaSwitcher two-tier (OW-6)

#### M-01 · PersonaSwitcher two-tier redesign
- File: `apps/web/src/components/os/overlays/PersonaSwitcher.tsx`.
- Section 1 "UNIVERSAL MODES": 8 core personas (general-purpose, planner, verifier, coordinator, researcher, writer, analyst, coder).
- Section 2 "YOUR WORKSPACE SPECIALISTS": template-scoped personas.
- Hover tooltip: tagline + bestFor + wontDo (interface extensions already in `personas.ts`, data in `persona-data.ts`).
- **Verify:** Playwright — sections render with correct persona counts. Hover → tooltip content matches persona data. Persona switch triggers agent reload.
- **Effort:** 0.5 day · **Owner:** me · **Deps:** none

### Block M2 — Compliance UX (3.5 days, 5 items)

#### M-02 · 3b.1 · PDF export route
- Install `pdfmake` if not present.
- Wire `buildComplianceDocDefinition` → `pdfmake.createPdf → getBuffer`.
- Route: `POST /api/compliance/export-pdf`.
- **Verify:** Vitest — POST returns application/pdf, non-empty buffer. Manual: open PDF.
- **Effort:** 4 hr · **Owner:** me · **Deps:** none

#### M-03 · 3b.2 · Template system JSON schema
- Templates stored as JSON: sections, logo URL, branding, footer, risk class.
- Template loader + validator.
- **Verify:** Vitest — load, validate, render with stub data.
- **Effort:** 4 hr · **Owner:** me · **Deps:** M-02

#### M-04 · 3b.3 · Full-page ComplianceReport viewer
- Current is 324-line card — expand to full-page.
- Date range picker + section toggles + PDF download button.
- **Verify:** Playwright — date range filters apply, toggles show/hide sections, download triggers PDF.
- **Effort:** 0.5 day · **Owner:** me · **Deps:** M-02, M-03

#### M-05 · 3b.4 · Custom branding
- Company logo upload (stored in vault folder).
- Org name override + risk classification override.
- **Verify:** Vitest — branding fields round-trip. Playwright — uploaded logo appears in PDF.
- **Effort:** 4 hr · **Owner:** me · **Deps:** M-03

#### M-06 · 3b.5 · KVARK template (enterprise variant)
- Section: IAM audit, data residency proof, department breakdown.
- **Verify:** Vitest — KVARK template validates + renders. Playwright — KVARK org sees KVARK template by default.
- **Effort:** 4 hr · **Owner:** me · **Deps:** M-03, M-05

### Block M3 — Harvest UX Polish (5 days, 4 open items)

#### M-07 · 3.3 · SSE live progress streaming
- Pipeline emits progress events; UI consumes via SSE.
- HarvestTab shows real-time progress bar + per-source counts.
- **Verify:** Playwright — start harvest, observe counter increment. Vitest for SSE event shape.
- **Effort:** 1 day · **Owner:** me · **Deps:** none

#### M-08 · 3.4 · Resumable harvests
- Checkpoint every 100 frames in a resume-log file.
- On resume: read checkpoint, skip already-processed entries.
- **Verify:** Vitest — interrupt harvest mid-way, resume, verify no duplicates and completion.
- **Effort:** 1 day · **Owner:** me · **Deps:** M-07

#### M-09 · 3.5 · Identity auto-populate screen
- After harvest, UI surfaces extracted identity signals for user to confirm/edit.
- **Verify:** Playwright — completed harvest → identity review screen → save → identity persisted.
- **Effort:** 0.5 day · **Owner:** me · **Deps:** H-18

#### M-10 · 3.6 · Harvest-first onboarding tile
- Onboarding step 2 (pending [M]-08 decision) — "Where does your AI life live?"
- **Verify:** Playwright — onboarding path with harvest-first enabled shows the tile.
- **Effort:** 4 hr · **Owner:** me · **Deps:** [M]-08

### Block M4 — Wiki Compiler v2 (5 days, 4 open items)

#### M-11 · 2.2 · Incremental recompilation
- Engine supports delta recompile. Add hook: `post-harvest` → `recompile(changedFrameIds)`.
- **Verify:** Vitest — add N frames, recompile delta, observe only affected pages rebuild.
- **Effort:** 1 day · **Owner:** me · **Deps:** none

#### M-12 · 2.3 · Obsidian vault adapter
- Writer: `@waggle/wiki-compiler/adapters/obsidian` — produce `.md` files + YAML frontmatter + `[[wikilinks]]`.
- **Verify:** Vitest — generate N pages → load in Obsidian (manual) + structure verified via assertions.
- **Effort:** 1 day · **Owner:** me · **Deps:** none

#### M-13 · 2.4 · Notion structured export
- Adapter uses Notion API to create pages in a user's workspace.
- Map entity/concept/synthesis pages to Notion blocks.
- **Verify:** Vitest with Notion API mock. Integration test with real test workspace.
- **Effort:** 1.5 day · **Owner:** me · **Deps:** none

#### M-14 · 2.5 · Wiki health report dashboard UI
- Types exist in core. Build UI: coverage %, orphaned entities, stale pages, recent compile.
- **Verify:** Playwright — page loads, shows real metrics from compiled wiki.
- **Effort:** 0.5 day · **Owner:** me · **Deps:** none

### Block M5 — Installer / Ollama (INST-1/2/3 — 2 days)

#### M-15 · INST-1 · Ollama bundled installer
- Onboarding step: "Install Ollama" button → downloads + installs Ollama silently.
- Post-install: pull Gemma 4 (or recommended model per M-16).
- **Verify:** Playwright on a VM without Ollama → install succeeds → model pulled → chat reaches Ollama.
- **Effort:** 1 day · **Owner:** me · **Deps:** none

#### M-16 · INST-2 · Hardware scan + model fit
- Read RAM/GPU via Tauri Rust side or `systeminformation` npm.
- Recommend models that fit locally (e.g., "You have 32GB RAM, can run Gemma 4 31B Q4").
- **Verify:** Vitest with stubbed HW values → correct recommendations across 5 HW profiles. Playwright shows recommendation in onboarding.
- **Effort:** 4-6 hr · **Owner:** me · **Deps:** M-15

#### M-17 · INST-3 · Ollama daemon auto-start
- Windows: register service. macOS: launchd plist.
- **Verify:** On install, service registered. After reboot, `ollama list` works without manual start.
- **Effort:** 4-6 hr · **Owner:** me · **Deps:** M-15

### Block M6 — Medium UX fixes (6 items, 6-10 hr total)

#### M-18 · UX-1 · Reduce onboarding decisions (default Blank + General Purpose path)
- Add "Skip and set me up" button on step 1 → skip 2-6, land on Ready.
- **Verify:** Playwright — skip path lands on desktop in < 3 clicks.
- **Effort:** 2 hr · **Owner:** me · **Deps:** none

#### M-19 · UX-4 · Dock text labels first 7d / 20 sessions
- LocalStorage counter `sessionCount`; below threshold → show labels.
- Settings toggle to permanent.
- **Verify:** Playwright fresh-state → labels visible. After 20 sessions → labels off.
- **Effort:** 2 hr · **Owner:** me · **Deps:** none

#### M-20 · UX-5 · Hide token/cost behind dev mode
- Settings → Advanced → "Developer mode" toggle.
- When off: hide token count + cost in status bar.
- **Verify:** Playwright — toggle off hides, on shows.
- **Effort:** 1 hr · **Owner:** me · **Deps:** none

#### M-21 · UX-6 · Chat header overflow menu
- Collapse secondary controls into a `⋯` menu.
- **Verify:** Playwright — narrow viewport triggers collapse; click menu expands options.
- **Effort:** 2 hr · **Owner:** me · **Deps:** none

### Block M7 — Engagement features (ENG-1..7 — 4 days)

#### M-22 · ENG-1 · "I just remembered" toast after 5th message
- Watcher: on 5th user message in a session, if relevant memories exist, toast "I just remembered something relevant" with preview.
- **Verify:** Playwright — 5 messages → toast appears with non-empty preview (needs harvest data).
- **Effort:** 4 hr · **Owner:** me · **Deps:** none

#### M-23 · ENG-2 · WorkspaceBriefing collapsible sidebar
- Current briefing lives somewhere; make it a collapsible right sidebar tied to workspace.
- **Verify:** Playwright — expand/collapse persists across reload.
- **Effort:** 4 hr · **Owner:** me · **Deps:** none

#### M-24 · ENG-3 · Dock unlock nudge at 10/50 sessions
- Session counter; trigger animated tooltip "You've unlocked X new apps".
- **Verify:** Playwright — stub session count to 10 → nudge appears.
- **Effort:** 2 hr · **Owner:** me · **Deps:** M-19

#### M-25 · ENG-4 · LoginBriefing every launch
- Per-session (not per-install); "Don't show again" sets `loginBriefingDismissed` config.
- **Verify:** Playwright — fresh session → briefing shows. Dismiss → hidden. New session → shows again (unless dismissed).
- **Effort:** 2 hr · **Owner:** me · **Deps:** none

#### M-26 · ENG-5 · Harvest-first onboarding (depends on [M]-08)
- Covered by M-10 if [M]-08 says harvest-first.

#### M-27 · ENG-6 · Memory Score / Brain Health metric
- Metric: (frames × 0.3) + (concepts × 0.4) + (entities × 0.3), normalized.
- Display in dashboard + status bar.
- **Verify:** Vitest for metric fn. Playwright — metric displays with correct value given stubbed data.
- **Effort:** 4 hr · **Owner:** me · **Deps:** none

#### M-28 · ENG-7 · Suggested next actions after assistant response
- Generate 2-3 suggested follow-ups from the last assistant message.
- Render as chips under the message.
- **Verify:** Playwright — message appears → chips render → click → fills chat input.
- **Effort:** 4 hr · **Owner:** me · **Deps:** none

### Block M8 — Infra polish (3 items)

#### M-29 · CR-1 · MS Graph OAuth connector
- Connector for email / calendar / files.
- OAuth device-code flow (Marko's Microsoft 365 account).
- Harvest adapter writes frames from calendar events, recent emails, Drive files.
- **Verify:** Integration test against live MS Graph with test account. Frames written + dedup.
- **Effort:** 2-3 days · **Owner:** me · **Deps:** none

#### M-30 · CR-3 · KG Viewer top-5 demo gaps
- Loading state, error state, export-PNG, touch gesture support, legend.
- **Verify:** Playwright — load → see loading → data arrives → export PNG downloads.
- **Effort:** 4-6 hr · **Owner:** me · **Deps:** none

### Block M9 — Content polish (2 items)

#### M-31 · CR-4 · Demo video script (90s + 5min)
- 90s: harvest → wiki → insight loop, one ohshit moment.
- 5min: the same + governance + teams + KVARK bridge.
- **Verify:** Marko approval on script. Stored at `docs/marketing/demo-video-script.md`.
- **Effort:** 1 day · **Owner:** me · **Deps:** none

#### M-32 · CR-5 · LinkedIn launch posts (3-post sequence)
- Post 1 (T-14d): "Why we built Waggle" narrative.
- Post 2 (T-3d): "What's about to drop" + paper teaser.
- Post 3 (Launch day): "It's live" + download link + proof summary.
- **Verify:** Stored at `docs/marketing/linkedin-launch-sequence.md`. Marko approves + schedules.
- **Effort:** 4 hr · **Owner:** me · **Deps:** [M]-09 peer reviewer context, [M]-10 launch date

### Block M11 — Strategic documentation (2 items, new from v2 brief)

#### M-49 · KVARK model strategy documentation
- Document **Qwen3-30B-A3B-Thinking** as KVARK analytical default (per PA v5 data: +26.7pp on compare-type tasks with PA enabled).
- Document **Opus 4.7** as reserved tier for multilingual / high-accuracy requests.
- Reference PA v5 cost-performance advantage (60x) where applicable.
- File: `docs/KVARK-MODEL-STRATEGY.md` (new). Cross-link from `docs/kvark-http-api-requirements.md`.
- **Verify:** Doc committed. CLAUDE.md §9 KVARK Integration references the new doc.
- **Effort:** 2 hr · **Owner:** me · **Deps:** none

#### M-50 · Canonical "cognitive layer" thesis document
- File: `docs/THESIS-COGNITIVE-LAYER.md` (new), 600-800 words.
- Precision framing: "cognitive layer" (architectural category) NOT "conscious agent" (philosophical claim). Guard against marketing drift.
- Three pillars: (a) architecture — frame model, bitemporal KG, hybrid search, compliance-by-default; (b) empirical validation — PA v5 results + H-42/43/44 benchmark numbers when available; (c) real-world test — Waggle dogfooded by the team that built it.
- Serves as input for: launch blog post, pitch deck, Paper 1 intro, LinkedIn sequence (M-32).
- Draft by me, reviewed by Marko before committing.
- **Verify:** Doc committed with benchmark numbers plugged in from H-42 (if available) or placeholder + TODO marker.
- **Effort:** 3-4 hr · **Owner:** me + [M] review · **Deps:** H-42 results available (so we reference real numbers, not placeholders)

### Block M10 — PDF deferred items (21 items from PDF-E2E-ISSUES, non-P0 subset)

Grouped. P35/P36/P40/P41 are already H-02..H-05 above. Everything else here:

| ID | Item | Effort |
|---|---|---|
| M-33 | P4 · Mutation Gates + 3-level tool approval unified UX | 1 day |
| M-34 | P6 · Room 2-parallel-agents visualization verify | 4 hr |
| M-35 | P8 · Agents vs Personas naming unify (current partial) | 2 hr |
| M-36 | P10 · Bee-style per-agent icons (dark + light) | 1-2 days (design-heavy) |
| M-37 | P14 · Local browser multi-drive (C: support) | 1 day |
| M-38 | P15 · Create Template modal drag/overlap fix | 4 hr |
| M-39 | P16 · Files app local-folder create + explorer-style browse | 1-2 days |
| M-40 | P17 · App-wide hover tooltips on badges/options | 4-6 hr |
| M-41 | P18 · Waggle Dance real signal display | 4 hr |
| M-42 | P21 · Timeline wire to event stream | 4 hr |
| M-43 | P25 · Scheduled Jobs toggle persist after trigger | 2 hr |
| M-44 | P26 · New scheduled job creation UX clarity | 3 hr |
| M-45 | P29 · Skills & Apps cards clickable + detail cards | 4 hr |
| M-46 | P30 · MCP install CLI simplification | 4 hr |
| M-47 | P34 · Approvals app — move to Ops or delete (Marko picks) | 1 hr |
| M-48 | P39 · Status bar dynamic (model + folder) | 2 hr |

**Each gets: Read component → fix → Verify: Playwright test for the specific behavior + Vitest where logic changed.**

---

## LOW tier — post-launch OK (~40 items · ~15 eng days)

### Block L1 — Responsive gaps (5 items)

#### L-01 · R-1 · Dock power tier overflow <768px
- **Verify:** Playwright resize to 767px → dock scrolls or collapses gracefully.
- **Effort:** 2 hr · **Deps:** none

#### L-02 · R-2 · StatusBar narrow-viewport
- Hide non-essential items < 900px.
- **Verify:** Playwright resize → items hidden per spec.
- **Effort:** 2 hr · **Deps:** none

#### L-03 · R-3 · ChatApp session sidebar collapse
- Sidebar 192px → collapsible at narrow.
- **Verify:** Playwright resize → sidebar collapses to icon rail.
- **Effort:** 2 hr · **Deps:** none

#### L-04 · R-4 · OnboardingWizard template grid responsive
- 3 cols desktop → 2 cols tablet → 1 col mobile.
- **Verify:** Playwright at 3 breakpoints → correct col count.
- **Effort:** 1 hr · **Deps:** none

#### L-05 · R-5 · AppWindow default sizes for mobile
- Default window sizes exceed mobile viewport — adapt to max 90vw × 80vh on narrow.
- **Verify:** Playwright mobile viewport → window fits.
- **Effort:** 2 hr · **Deps:** none

### Block L2 — Accessibility A11Y-1..9 (9 items, 1 day total)

#### L-06 · A11Y-1 · BootScreen screen-reader skip announce — **Verify:** axe-core 0 violations · **Effort:** 30 min
#### L-07 · A11Y-2 · Dock 44×44 touch targets — **Verify:** measure in Playwright · **Effort:** 1 hr
#### L-08 · A11Y-3 · Window title-bar min/max button icons + labels — **Verify:** screen reader reads "Minimize"/"Maximize" · **Effort:** 30 min
#### L-09 · A11Y-4 · PersonaSwitcher aria-disabled on locked cards — **Verify:** axe + keyboard skip · **Effort:** 30 min
#### L-10 · A11Y-5 · Settings role="switch" + aria-checked on toggles — **Verify:** axe · **Effort:** 1 hr
#### L-11 · A11Y-6 · Dashboard health dots shape differentiation — **Verify:** colorblind simulation · **Effort:** 1 hr
#### L-12 · A11Y-7 · Chat feedback dropdown focus trap + arrow keys — **Verify:** keyboard-only navigation · **Effort:** 1 hr
#### L-13 · A11Y-8 · Global Search role="dialog" — **Verify:** axe · **Effort:** 30 min
#### L-14 · A11Y-9 · Memory importance slider aria-label — **Verify:** axe · **Effort:** 30 min

### Block L3 — Tech debt (from remaining-work memory)

#### L-15 · Remove old `app/` frontend
- Cleanup: `app/src/` is dead code per CLAUDE.md. Move anything still referenced to `apps/web/` and delete the dir.
- **Verify:** Full build green, all tests pass, `grep -r "from 'app/" apps/` returns 0.
- **Effort:** 4 hr · **Deps:** verify every `app/src` import is unused first

#### L-16 · ContextRail deeper integration
- Wire `setContextRailTarget` to FilesApp file click, Memory frame click, chat message click.
- **Verify:** Playwright — click each → ContextRail updates.
- **Effort:** 4 hr · **Deps:** none

#### L-17 · Scan for MOCK/stub/placeholder in production paths
- `grep -rn "MOCK:\|TODO:\|stub\|placeholder" packages/ apps/` — audit each hit.
- Remove or ticket follow-up for each.
- **Verify:** Grep returns only acceptable (test fixture) hits after cleanup.
- **Effort:** 0.5 day · **Deps:** none

#### L-18 · Agent native file access tools
- `read_file`, `write_file`, `search_files` tools wired to StorageProvider for all 3 storage types (virtual/local/team).
- **Verify:** Vitest for each tool × each storage. Integration test: agent uses tool in a real chat.
- **Effort:** 1 day · **Deps:** none

#### L-19 · TeamStorageProvider real S3/MinIO impl
- Currently stub per CLAUDE.md §2. Use `@aws-sdk/client-s3`.
- **Verify:** Integration test against MinIO Docker.
- **Effort:** 1 day · **Deps:** none

#### L-20 · File indexing for semantic search
- Workspace files auto-indexed into workspace mind on upload/change.
- **Verify:** Upload file → wait → search returns file content.
- **Effort:** 0.5 day · **Deps:** L-18

#### L-21 · Cross-workspace file read
- `read_other_workspace_file(workspace_id, path)` agent tool.
- Permission modal for first cross-read.
- **Verify:** Vitest for permission gate. Playwright modal on first cross-read.
- **Effort:** 4 hr · **Deps:** L-18, L-19

### Block L4 — Engagement advanced (from remaining-work P3)

#### L-22 · Memory bragging window (richer LoginBriefing)
- Upgrade M-25 to show concrete remembered facts per session.
- Optional: native desktop notification.
- **Verify:** Playwright — briefing card has ≥ 3 concrete recalled facts.
- **Effort:** 4 hr · **Deps:** M-25

### Block L5 — Minor PDF items (1 item)

#### L-23 · P39 · Status bar dynamic (moved here; Low priority tech-debt if not done in M)
- Already in M-48 above — keep single instance; list for cross-reference only.

---

## One-view master table (summary)

| ID | Tier | Category | Item | Owner | Effort | Deps |
|---|---|---|---|---|---|---|
| [M]-01 | — | Marko | Stripe products in dashboard | Marko | 1 hr | none |
| [M]-02..10 | — | Marko | Decisions + peer review + judge list | Marko | ~3 hr total | — |
| H-01 | HIGH | Polish | QW-3 skip boot | me | 15-30 min | — |
| H-02 | HIGH | Polish | P35 spawn-agent models | me | 2-3 hr | — |
| H-03 | HIGH | Polish | P36 dock spawn-agent | me | 1 hr | H-02 |
| H-04 | HIGH | Polish | P40 BootScreen light | me | 2 hr | — |
| H-05 | HIGH | Polish | P41 header text light | me | 30 min | H-04 |
| H-06 | HIGH | Polish | CR-2 token sweep | me | 2 hr | H-04, H-05 |
| H-07 | HIGH | GEPA | G4 trace outcomes | me | 0.5 d | — |
| H-08 | HIGH | GEPA | G2 override-aware loader | me | 2-4 hr | — |
| H-09 | HIGH | GEPA | G3 running-judge audit | me | 2-4 hr | — |
| H-10 | HIGH | GEPA | G1 evolution service + cron | me | 0.5-1 d | H-07 |
| H-11..20 | HIGH | Harvest | Phase 1 real-data harvest | me | ~3 d | [M]-01..03 (done), H-14 Cursor |
| H-21 | HIGH | Proofs | Phase 4 Memory Proof | me | 10 d | H-20, [M]-02 |
| H-22 | HIGH | Proofs | Phase 5 GEPA Proof | me | 18 d | H-07..10, H-20 |
| H-23 | HIGH | Proofs | Phase 5b Combined | me | 6 d | H-21, H-22 |
| H-24 | HIGH | Papers | Paper 1 Memory | me + [M]-09 | 3 d | H-21 |
| H-25 | HIGH | Papers | Paper 2 GEPA + Combined | me + [M]-09 | 3 d | H-22, H-23, [M]-06 |
| H-26..33 | HIGH | Stripe | Stripe integration (8 items) | me | ~2 d | [M]-01 for H-33 only |
| H-34 | HIGH | Launch | hive-mind extraction | me | 2-3 d | [M]-07 |
| H-35 | HIGH | Launch | Binary build + smoke | me | 1 d | H-01..10 |
| H-36 | HIGH | Launch | Clerk auth | me | 1 d | H-27 |
| H-37 | HIGH | Launch | Onboarding harvest-first | me | 4 hr | [M]-08 |
| H-38 | HIGH | Launch | Landing page polish | me | 4 hr | — |
| H-39 | HIGH | Launch | Windows signing scaffold | me | 3 hr | — |
| H-40 | HIGH | Launch | Mac notarize scaffold | me | 2 hr | — |
| H-41 | HIGH | Launch | Auto-updater signing | me | 3 hr | H-35 |
| **H-42** | **HIGH** | **Benchmarks** | **LoCoMo run — LAUNCH GATING** | me | 3-4 d | H-34 |
| **H-43** | **HIGH** | **Benchmarks** | **LongMemEval run — LAUNCH GATING** | me | 2-3 d | H-34 |
| **H-44** | **HIGH** | **Benchmarks** | **SWE-ContextBench run — strategic diff** | me | 3 d | H-34 |
| M-01 | MED | Polish | PersonaSwitcher two-tier | me | 0.5 d | — |
| M-02..06 | MED | Compliance | PDF + template system | me | 3.5 d | — |
| M-07..10 | MED | Harvest UX | SSE + resumable + ident + tile | me | 3 d | H-18 for M-09 |
| M-11..14 | MED | Wiki v2 | Incremental + Obsidian + Notion + health | me | 4 d | — |
| M-15..17 | MED | Installer | Ollama + HW scan + daemon | me | 2 d | — |
| M-18..21 | MED | UX | 4 medium UX fixes | me | 7 hr | — |
| M-22..28 | MED | Engagement | 7 engagement features | me | 4 d | [M]-08 for M-26 |
| M-29 | MED | Infra | MS Graph OAuth | me | 2-3 d | — |
| M-30 | MED | Infra | KG Viewer polish | me | 4-6 hr | — |
| M-31..32 | MED | Content | Demo video + LinkedIn posts | me | 1.5 d | [M]-09, [M]-10 |
| **M-49** | **MED** | **Docs** | **KVARK model strategy doc** | me | 2 hr | — |
| **M-50** | **MED** | **Docs** | **Cognitive layer thesis doc** | me + [M] | 3-4 hr | H-42 |
| M-33..48 | MED | PDF def | 16 deferred PDF items | me | ~5 d | — |
| L-01..05 | LOW | Responsive | 5 responsive fixes | me | 9 hr | — |
| L-06..14 | LOW | A11Y | 9 A11Y items | me | 1 d | — |
| L-15..21 | LOW | Tech debt | 7 tech-debt items | me | 3 d | — |
| L-22 | LOW | Engagement | Bragging window | me | 4 hr | M-25 |

**Totals (v2):**

| Tier | Items | Eng days | Notes |
|---|---|---|---|
| Marko | 12 ([M]-01..14 with [M]-07/11 locked) | ~3 hr + decisions | Blocks some H-items |
| HIGH | 44 (added H-42/43/44) | ~58 | Includes 13d proofs + 8-10d benchmarks |
| MEDIUM | 50 (added M-49/M-50) | ~26 | Parallelizable |
| LOW | 22 | ~15 | Post-launch OK |
| **Total** | **~128** | **~102 days** (cal **~8-10 wk** parallel, gated by benchmark outcome) |

**Calendar range now 8-10 weeks** (vs v1 estimate 7-8 weeks). Wider range reflects benchmark gating — Scenario A could finish at the low end; Scenario B with a tuning iteration pushes to the high end; Scenario C opens an architecture investigation that could extend further.

---

## Critical path (v2 — SOTA-gated)

**Launch is no longer on a fixed date.** Launch is gated by benchmark outcomes per [M]-07.

```
[M]-01 Stripe products ──┐
                          ├─► H-26..33 Stripe integration (2d)
                          │
H-01..06 Polish A+B (1.5d) ──┐
                              │
H-07..10 GEPA wiring (2d) ────┤
                              │
H-14 Cursor adapter (1d) ──┐  │
                            ├──► H-11..20 Phase 1 Harvest GATE (3d)
[M]-02..03 exports (done) ─┘          │
                                      │
                                      ├──► H-21 Phase 4 Memory Proof (10d) ────► H-24 Paper 1
                                      │
                                      ├──► H-22 Phase 5 GEPA Proof (18d) ──────► H-25 Paper 2
                                      │                                          ↑
                                      └──► H-23 Phase 5b Combined (6d) ──────────┘

H-34 hive-mind extraction (5-10d) ──► Block H12 LAUNCH GATE
                                      ├─► H-42 LoCoMo (3-4d)    ◄── SOTA gate
                                      ├─► H-43 LongMemEval (2-3d)
                                      └─► H-44 SWE-ContextBench (3d)
                                            │
                                            ▼
                                   [Scenario A / B / C decision]
                                            │
                                 A / B-acceptable / B+SWE-top3 win
                                            │
                                            ▼
H-35..41 Launch prep (parallel) ──────► LAUNCH (synchronized: hive-mind OSS + Waggle beta + papers + LinkedIn)
M-49/M-50 strategic docs ─────────────►
M-31/M-32 demo video + LinkedIn ──────►
```

**Longest chain (v2):** H-34 (5-10d) → H-42 (3-4d) → optional tuning iteration (0-5d) → H-43/H-44 (3d parallel) → H-35..H-41 launch prep (parallel) = **12-25 days post-harvest** depending on scenario.

**Papers (H-24/H-25) still write in parallel** with the benchmark block and launch prep — no longer on critical path for launch go/no-go, but required for launch narrative completeness.

---

## Sprint discipline

1. **One commit per item.** Tree clean between items.
2. **Test gate enforced per CLAUDE.md §3:** `npx tsc --noEmit` + `npm run test -- --run` + `npm run lint` green before next item.
3. **PostToolUse hooks auto-run** (Prettier, tsc, console.log scan).
4. **Playwright regression** on UI items.
5. **Vitest per item** for logic changes.
6. **No stacked WIP.** Next item starts only after current passes Verify.
7. **Blockers surface immediately** — if an item hits an unexpected blocker, stop + update this doc, don't hack around.

---

## Recommended execution sequence (v2 — SOTA-gated)

**Day 1 (today — alignment + Phase A close + Phase B start):**
- v2 backlog alignment ✅ this commit
- Pricing tier-rename fix (useBilling + SettingsApp + TeamGovernanceApp) — part of this commit
- H-01 QW-3 Playwright regression (code already correct at `Index.tsx:15-17`)
- H-02 P35 spawn-agent (2-3h) → H-03 P36 dock icon (1h) → commit
- H-04 P40 → H-05 P41 → H-06 CR-2 light mode sweep → commit
- [M]-01 Stripe products in Stripe dashboard (guided with Marko, parallel)

**Day 2:**
- H-26..H-28 Stripe webhook + tier mapping + upgrade flow UI
- H-07 G4 trace outcomes (0.5d)
- Start H-08 G2 override loader

**Day 3:**
- Finish H-08, H-09 G3 running-judge audit
- H-10 G1 evolution service + cron
- Full GEPA closure test pass (all 4 gaps verified)

**Day 4:**
- H-14 Cursor adapter
- H-12, H-13 Claude + Gemini imports (exports already on disk)
- H-11 Re-harvest Claude Code

**Day 5:**
- H-17 cognify → H-18 identity → H-19 wiki compile
- H-20 GATE check (frames ≥ 10K, dedup verified)
- **Start H-34 hive-mind source extraction** (5-10 day wall time — locked, don't rush)
- Start H-21 Phase 4 Memory Proof in parallel

**Week 2-3:** H-34 extraction continues. H-21 Memory Proof runs (10d). H-22 Phase 5 GEPA Proof starts (18d). H-31..33 Stripe completes once [M]-01 Stripe products land.

**Week 3-4:** H-34 complete → **Block H12 benchmarks in parallel** (H-42 LoCoMo + H-43 LongMemEval + H-44 SWE-ContextBench). H-22 GEPA Proof continues.

**Week 4-5:** Benchmark results analyzed. **Scenario A/B/C decision.** If A: launch prep aggressive. If B: optional tuning iteration (≤ 5 days). If C: architecture investigation, re-plan.

**Week 5-6:** H-35..41 launch prep (parallel with H-23 Combined + H-24/H-25 paper drafts). M-49 KVARK model strategy. M-50 cognitive layer thesis (after H-42 numbers available). M-31/M-32 demo video + LinkedIn sequence draft.

**Week 6-7:** Peer review loop ([M]-09). Marko approvals + final polish.

**Week 7-10:** Launch window opens once H-42/H-43/H-44 meet gate criteria + binary signed + landing ready + papers reviewed. **Actual launch date = earliest date where benchmark results clear the gate AND all launch-prep items are done.**

---

## Related docs (superseded)

- `docs/plans/POLISH-SPRINT-2026-04-18.md` — phased polish (absorbed)
- `docs/plans/BACKLOG-CONSOLIDATED-2026-04-17.md` — consolidated (absorbed)
- `docs/plans/PDF-E2E-ISSUES-2026-04-17.md` — PDF triage (absorbed)
- `docs/plans/BACKLOG-FULL-2026-04-18.md` — intermediate consolidation (absorbed)
- `docs/HIVE-MIND-INTEGRATION-DESIGN.md` — detail for H-34
- `docs/UX-ASSESSMENT-2026-04-16.md` — UX findings source
- `docs/test-plans/*.docx` — Phase 4/5/5b protocols (detail for H-21..H-23)
- `docs/REMAINING-BACKLOG-2026-04-16.md` — 2026-04-16 master snapshot

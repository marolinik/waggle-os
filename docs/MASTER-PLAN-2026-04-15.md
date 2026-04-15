# Waggle OS — Master Plan & Consolidated Backlog

**Date:** 2026-04-15
**Context:** After 22-commit code review sweep, all criticals resolved, 5338/5338 tests green.
**Purpose:** Single-page map of where we are, what's left, and the step-by-step path forward.

---

## WHERE WE ARE RIGHT NOW

### What's Built and Working
- **Memory system** — FrameStore, HybridSearch (FTS5+sqlite-vec RRF), KnowledgeGraph, IdentityLayer, AwarenessLayer, CognifyPipeline, WikiCompiler. 199 frames in personal.mind, 156 from harvest.
- **Self-evolution stack** — Phases 1-8 ALL COMPLETE. TraceRecorder, EvalDatasetBuilder, LLM-as-Judge, GEPA iterative, EvolveSchema, ES→GEPA composition, constraint gates, EvolutionOrchestrator, deploy helpers, server routes, boot-time merge, UI (Evolution tab + Run Now button). 357 evolution tests. v1 hypothesis EXCEEDED (108.8% C/A).
- **Compliance** — AI Act articles mapped (Art. 12/14/19/26/50), append-only triggers, input/output recording, audit PDF generator.
- **Agent runtime** — 22 personas, 60+ tools, 19 skills, 30 connectors, 148 MCP catalog.
- **Desktop** — Tauri 2.0 shell, Room canvas, per-window personas, workspace rail, approvals inbox.
- **Harvest** — 11 adapters (ChatGPT, Claude, Claude Code, Gemini, Perplexity, Markdown, Plaintext, PDF, URL, Universal).
- **Code health** — 22-commit security/correctness review sweep complete TODAY. All criticals across 10 subsystems resolved. Suite 5338/5338 green. tsc clean on agent+core+server.

### What's NOT Built Yet (Honest Gaps)
- **Persona denylist enforcement** — `disallowedTools` / `isReadOnly` are declared but never applied in chat.ts
- **Stripe billing** — code-complete but blocked on dashboard setup (Marko's action)
- **Code signing** — updater wired but blocked on cert purchase (Marko's action)
- **v2 experiment** — designed + budget approved but not run yet
- **Memory benchmarks** — no formal retrieval quality or performance numbers
- **E2E suite** — 96 tests exist but some are stale (onboarding overlay intercepts dock clicks)

---

## THE FULL BACKLOG (by priority)

### P0 — Ship Blockers (before any public demo/launch)

| # | Item | Status | Effort |
|---|------|--------|--------|
| P0.1 | Light mode polish (hardcoded hsl → tokens) | 80% done (6 swaps shipped, full audit pending) | 0.5 day |
| P0.2 | Upgrade UX modal (403 → upgrade overlay) | NOT STARTED | 0.5 day |
| P0.3 | Trial start timestamp + expiry modal | DONE (commit from S2) | — |
| P0.4 | Stripe products in dashboard + env vars | Blocked on Marko | 1 hour (Marko) |
| P0.5 | Windows code signing + updater keypair | Blocked on Marko ($300-500 cert) | 1-3 days (issuance) |
| P0.6 | Wire persona denylist + PermissionManager | NOT STARTED (review found it) | 0.5 day |

### P1 — Core Features (make the product complete)

| # | Item | Status | Effort |
|---|------|--------|--------|
| P1.1 | Shared team memory (Teams killer feature) | Architecture designed, not built | 2-3 sessions |
| P1.2 | Harvest adapter polish (verify Gemini, Perplexity) | Perplexity shipped, others need testing | 1 day |
| P1.3 | Harvest real-time progress (SSE events) | NOT STARTED | 0.5 day |
| P1.4 | WeaverPanel in Memory app | NOT STARTED | 0.5 day |
| P1.5 | Harvest source manager UI | NOT STARTED | 0.5 day |
| P1.6 | Global KG cross-workspace viewer | NOT STARTED (needs MultiMindCache) | 1 day |

### P2 — Monetization

| # | Item | Status | Effort |
|---|------|--------|--------|
| P2.1 | Stripe webhook → tier enforcement | Code-complete, needs dashboard setup | Blocked |
| P2.2 | Embedding quota enforcement | Defined in TIER_CAPABILITIES, not enforced | 0.5 day |
| P2.3 | Budget hard-cap enforcement | Monitoring only, no blocking | 0.5 day |

### P3 — Future Features

| # | Item | Status | Effort |
|---|------|--------|--------|
| P3.1 | Ollama free inference + hardware scan | Designed, not built | 2-3 days |
| P3.2 | Memory bragging window (startup briefing) | NOT STARTED | 0.5 day |
| P3.3 | Code signing (already in P0) | — | — |
| P3.4 | Agent native file access (read/write/search) | NOT STARTED | 1-2 days |
| P3.5 | TeamStorageProvider (S3/MinIO) | Stub only | 2 days |
| P3.6 | File indexing for semantic search | NOT STARTED | 1-2 days |

### P4 — Tech Debt

| # | Item | Status | Effort |
|---|------|--------|--------|
| P4.1 | Remove old app/ frontend dead code | NOT STARTED | 0.5 day |
| P4.2 | ContextRail deeper integration | Partially wired | 1 day |
| P4.3 | Remove remaining mock data | Audit needed | 0.5 day |

### RESEARCH — Papers & Proofs

| # | Item | Status | Effort | Budget |
|---|------|--------|--------|--------|
| R1 | Memory benchmarks (precision@k, MRR, latency) | NOT STARTED | 1-2 days | ~$20 |
| R2 | v2 GEPA experiment (60 examples, 4 judges) | Designed, ready to run | ~4 days | $200 approved |
| R3 | Paper 1: Hive-Mind memory (arXiv) | Concept done, needs data from R1 | 2-3 days writing | — |
| R4 | Paper 2: GEPA evolution (arXiv) | Concept done, needs data from R2 | 2-3 days writing | — |

---

## STEP-BY-STEP PLAN (recommended order)

### Phase A: Fix + Wire (1-2 sessions)
**Goal:** Get the codebase to a state where everything WORKS, not just compiles.

1. Wire persona denylist enforcement (P0.6) — 15 lines in chat.ts
2. Light mode full audit pass (P0.1) — every `hive-*` / `glass-*` token
3. Upgrade UX modal (P0.2) — 403 → overlay
4. Fix stale E2E tests (onboarding overlay clicks)
5. **Gate:** full E2E suite green (Playwright)

### Phase B: Memory Proof (1-2 sessions)
**Goal:** Get hard numbers that defend Paper 1 claims.

1. Build a retrieval benchmark suite:
   - Curate 50 ground-truth queries with expected frames
   - Measure precision@5, precision@10, MRR
   - Compare: HybridSearch (FTS5+vec) vs pure vector vs pure FTS5
2. Build a performance benchmark:
   - Ingestion: frames/sec at 1K, 10K, 100K frames
   - Search: latency at 1K, 10K, 100K frames
   - Write-path dedup: accuracy (true positive rate, false positive rate)
3. Run contradiction detection eval:
   - 20 contradicting pairs + 20 non-contradicting → precision/recall
4. **Gate:** numbers are defensible in an academic paper

### Phase C: GEPA Proof (1 session, ~4 days wall)
**Goal:** Run v2 experiment and get publishable results.

1. Pre-flight: verify all 4 judge API keys in vault
2. Smoke-test judges ($1)
3. Run GEPA training on 30 train examples ($80)
4. Run test-set evaluation: 30 test × 3 arms × 4 judges ($80)
5. Statistical analysis: bootstrap CI + permutation test
6. **Gate:** results are publishable (positive or negative — both committed)

### Phase D: Write Papers (2-3 sessions)
**Goal:** Two arXiv-quality papers.

1. Paper 1 (memory): fill in benchmarks from Phase B, write full text
2. Paper 2 (GEPA): fill in v2 results from Phase C, write full text
3. External reviewer pass on both
4. Publish to arXiv + waggle-os.ai/research/

### Phase E: Polish + Ship (2-3 sessions)
**Goal:** Product ready for public demo.

1. Stripe (blocked on Marko's dashboard setup)
2. Code signing (blocked on cert purchase)
3. Shared team memory (P1.1 — big feature, saves for last)
4. Remaining P1 items as time allows

---

## MARKO'S ACTION ITEMS (external blockers)

| # | Action | Unblocks | Time |
|---|--------|----------|------|
| 1 | Create Stripe Pro $19 + Teams $49/seat products | Revenue flow | 1 hour |
| 2 | Register Stripe webhook + populate 5 env vars | Tier enforcement | 30 min |
| 3 | Buy EV code signing cert ($300-500/yr) | Signed installer | 1-3 days |
| 4 | Generate Tauri updater keypair | Auto-updates | 10 min |
| 5 | Confirm OpenAI + Google API keys in vault | v2 experiment | 5 min |
| 6 | Review Q1-Q5 decisions + greenlight v2 run | Paper 2 | 15 min |

---

## COST SUMMARY

| Item | Budget | Status |
|------|--------|--------|
| v2 GEPA experiment | $200 | Approved |
| Memory benchmarks (embedding calls) | ~$20 | Needs approval |
| Code signing certificate | $300-500/yr | Needs purchase |
| Total pre-launch spend | ~$520-720 | — |

---

## TIMELINE (aggressive but realistic)

| Week | Focus | Deliverables |
|------|-------|-------------|
| This week | Phase A (fix + wire + E2E) | All P0s done, E2E green |
| Next week | Phase B (memory proof) | Benchmark numbers, Paper 1 data |
| Week 3 | Phase C (GEPA v2 run) | Experiment results, Paper 2 data |
| Week 4 | Phase D (write papers) | Two arXiv preprints |
| Week 5 | Phase E (polish + ship) | Stripe live, signed binary, demo-ready |

---

*This plan replaces all prior partial backlogs. Single source of truth.*

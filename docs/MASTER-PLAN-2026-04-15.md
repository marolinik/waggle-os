# Waggle OS — Master Plan & Consolidated Backlog (v2)

**Date:** 2026-04-15
**Context:** After 22-commit code review sweep + broken session recovery.
**Supersedes:** All prior partial backlogs. Incorporates LAUNCH-STRATEGY, NARRATIVE-ARCHITECTURE, FULL-BACKLOG, CODEBASE-STATE, all 10 code reviews, all 7 research reports, hypothesis v2 plan, and wiki compiler spec.

---

## WHERE WE ARE — HONEST STATUS

### Built and Working (verified against code, not handoffs)
- **Memory system** — complete: FrameStore, HybridSearch (FTS5+vec RRF), KnowledgeGraph, IdentityLayer, AwarenessLayer, CognifyPipeline. 199 frames in personal.mind (156 from Claude Code harvest).
- **Self-evolution stack** — Phases 1-8 ALL COMPLETE. TraceRecorder, EvalDatasetBuilder, LLM-as-Judge, GEPA iterative, EvolveSchema, ES→GEPA composition, constraint gates, EvolutionOrchestrator, deploy helpers, server routes, boot-time merge, UI. 357 evolution tests. v1 result: 108.8% C/A ratio.
- **Wiki Compiler v1** — 4 adapters, compiler, MCP tools, server routes, UI tab. Live-tested with 8 Haiku-synthesized pages.
- **Compliance** — Art. 12/14/19/26/50 mapped, append-only triggers, input/output recording, audit PDF generator.
- **Harvest** — 11 adapters shipped (chatgpt, claude, claude-code, gemini, perplexity, md, txt, pdf, url, universal).
- **Agent runtime** — 22 personas, 60+ tools, 19 skills, 30 connectors, 148 MCP catalog.
- **Desktop** — Tauri 2.0 shell, Room canvas, per-window personas, workspace rail, approvals inbox.
- **Code health** — 22-commit security sweep complete. All criticals resolved across 10 review areas. 5338/5338 tests, tsc clean.

### NOT Built (honest gaps)
- **Persona denylist** — `disallowedTools` / `isReadOnly` declared but never enforced in chat.ts
- **Harvest UX** — pipeline works but no live progress, no dedup summary, no harvest-first onboarding, no resumability
- **Full harvest test on Marko's accounts** — only Claude Code tested live. ChatGPT/Claude/Gemini/Perplexity/Cursor/MS Graph untested with real data
- **Wiki v2** — v1 works but needs: more adapters (Obsidian, Notion), MS Graph integration, MD export, OSS split
- **Memory benchmarks** — zero formal retrieval/performance numbers
- **Comprehensive GEPA proof (v3)** — v1 was n=10 single-domain; production-grade test = 500-1000 tasks, 5 domains, ablation grid
- **Stripe billing** — code-complete, blocked on Marko's dashboard setup
- **Code signing** — updater wired, blocked on cert purchase

---

## THE LAUNCH VISION (from broken session)

**Two crown jewels. One ship day. Three artifacts.**

### Crown Jewel #1 — "AI with memory that complies by default"
Memory + Harvesting + EU AI Act. Proven on Marko's real data across ALL platforms.

### Crown Jewel #2 — "Gemma + evolution: cheap models at flagship tier"  
Full-system E2E test. 500-1000 tasks, 5 domains, ablation grid, multi-gen evolution curves.

### Same-day ship bundle
1. Waggle OS free app (signed binary + auto-updater)
2. `hive-mind` OSS repo (Apache 2.0 — memory primitives + harvest + wiki)
3. Two research notes (arXiv preprints)

---

## COMPREHENSIVE TEST PLAN + BUDGETS

### Crown Jewel #1 — Memory Bulletproof Test (~$300-500)

| Step | What | Budget | Time |
|------|------|--------|------|
| 1 | **Harvest ALL of Marko's AI accounts** — ChatGPT + Claude + Claude Code + Gemini + Perplexity + Cursor (build adapter) + MS Graph (build connector) | ~$50 (embeddings) | 3 days |
| 2 | **Retrieval benchmarks** — precision@k, MRR, recall on curated test set + public benchmarks (LoCoMo, LongMemEval) | ~$100 | 2 days |
| 3 | **Baseline comparisons** — mem0, Letta, raw vector+keyword fallback on same dataset | ~$100 | 2 days |
| 4 | **Performance benchmarks** — ingestion rate, search latency p50/p95/p99 at 10K/100K frames | ~$20 | 1 day |
| 5 | **Write-path eval** — dedup accuracy, contradiction detection P/R, KG extraction P/R | ~$20 | 1 day |
| 6 | **Wiki quality** — LLM-judged quality of compiled pages vs raw frames | ~$50 | 1 day |
| 7 | **Compliance completeness** — audit report vs manual Art. 12 checklist | $0 | 0.5 day |
| | **Subtotal** | **~$340** | **~10 days** |

### Crown Jewel #2 — Gemma + Evolution Bulletproof Test (~$1500-2500)

| Step | What | Budget | Time |
|------|------|--------|------|
| 1 | **Task suite curation** — 500-1000 tasks across 5 domains (writing/analysis/research/code/decision) | $0 | 3-4 days |
| 2 | **Baseline runs** — Opus 4.6 + GPT-5.4 + Gemma 4 raw on full suite | ~$300 | 2-3 days |
| 3 | **Multi-gen evolution** — GEPA + EvolveSchema (gen 1 → gen 2 → gen 3) | ~$500 | 5-7 days |
| 4 | **Ablation runs** — 7-8 arms (raw → memory-only → engineered → GEPA → ES → full stack) | ~$400 | 2-3 days |
| 5 | **Judge evaluation** — 1000 tasks × 8 arms × 4 judges (Opus + GPT-5 + Gemini 2.5 Pro + Haiku) | ~$800 | 2-3 days |
| 6 | **Statistical analysis** — bootstrap CI, permutation tests, per-domain/per-persona breakdown | $0 | 1-2 days |
| | **Subtotal** | **~$2000** | **~15-21 days** |

### Combined Envelope

| | Budget | Time |
|---|--------|------|
| Crown Jewel #1 (Memory) | ~$300-500 | ~10 days |
| Crown Jewel #2 (GEPA) | ~$1500-2500 | ~15-21 days |
| **TOTAL** | **~$2000-3000** | **~18-25 days (parallel)** |

---

## STEP-BY-STEP ROADMAP

### Phase 0: Wire + Fix (THIS SESSION / next session)
**Goal:** All code working, not just compiling. Full E2E green.

1. Wire persona denylist enforcement in chat.ts (~15 lines)
2. Light mode full audit pass
3. Fix stale E2E tests (onboarding overlay intercepts)
4. Upgrade UX modal (403 → overlay)
5. **GATE:** Playwright E2E full suite green

### Phase 1: Harvest Marko's Real Data (~3 days)
**Goal:** Memory populated with real production data from all 7 AI platforms.

1. Export ChatGPT conversations → harvest
2. Export Claude conversations → harvest
3. Re-harvest Claude Code (fresh, larger corpus)
4. Export Gemini conversations → harvest
5. Export Perplexity threads → harvest
6. **BUILD** Cursor adapter (~0.5-1 day) → harvest
7. **BUILD** MS Graph OAuth connector (~2 days) → harvest email/calendar/files
8. Post-harvest cognify on all imported frames
9. Identity auto-populate from harvest (show Marko what the system learned)
10. **GATE:** 10K-50K frames across all sources, dedup verified, KG populated

### Phase 2: Wiki Compiler Enhancement (~1 week)
**Goal:** Wiki becomes a real "second brain" surface.

1. More synthesis adapters (Obsidian vault import, Notion structured export)
2. Incremental recompilation after each harvest batch
3. Wiki health report dashboard (coverage, freshness, gaps)
4. Export to markdown (for offline reading / sharing)
5. **GATE:** Wiki compiles a navigable, interlinked knowledge base from Marko's real data

### Phase 3: Harvest UX Polish (~1 week)
**Goal:** Harvest feels like a superpower, not an import chore.

Per Report 3's six principles:
1. Harvest-first onboarding wizard (tile UI: "Where does your AI life live?")
2. Live progress streaming (phase/bar/counter via SSE)
3. Dedup summary ("Found 2134 new, 487 already known, linking 143 people...")
4. Resumable harvests (checkpoint every 100 frames)
5. Identity auto-populate screen ("Here's what I learned about you")
6. Privacy headline above every harvest button

### Phase 4: Memory Proof Test (~10 days, ~$300-500)
**Goal:** Bulletproof numbers for Paper 1.

1. Retrieval benchmarks (precision@k, MRR, recall)
2. Public benchmark runs (LoCoMo, LongMemEval)
3. Baseline comparisons (mem0, Letta, raw vector)
4. Performance benchmarks (ingestion, search latency at scale)
5. Write-path correctness (dedup, contradiction, KG extraction P/R)
6. Wiki quality eval (LLM-judged)
7. Compliance completeness check
8. **GATE:** Numbers defend Paper 1 claims in peer review

### Phase 5: GEPA Full-System Proof (~15-21 days, ~$1500-2500)
**Goal:** Bulletproof numbers for Paper 2.

1. Task suite curation (500-1000 tasks, 5 domains)
2. Baseline runs (Opus + GPT-5 + Gemma raw)
3. Multi-gen evolution (GEPA + EvolveSchema, gen 1→2→3)
4. Ablation grid (7-8 arms)
5. 4-judge multi-vendor evaluation
6. Statistical analysis (bootstrap CI, permutation tests)
7. Per-persona + per-domain breakdown
8. **GATE:** Results publishable (positive or negative — Q5 pre-committed)

### Phase 6: Write Papers (~1 week)
**Goal:** Two arXiv preprints.

1. Paper 1 (Memory): fill in Phase 4 data into concept skeleton
2. Paper 2 (GEPA): fill in Phase 5 data into concept skeleton
3. External ML peer review
4. Publish to arXiv + waggle-os.ai/research/

### Phase 7: Polish + Launch Prep (~1 week)
**Goal:** Ship-ready product.

1. Stripe dashboard setup + smoke test (Marko)
2. Code signing cert + updater keypair (Marko)
3. `hive-mind` OSS repo extraction (Apache 2.0 boundary cut)
4. Binary build + smoke test on clean Windows VM
5. Onboarding flow finalized
6. **GATE:** All 3 launch artifacts ready simultaneously

---

## REMAINING CODE REVIEW ITEMS (non-critical)

All **criticals fixed** (22 commits). Remaining majors/minors by priority:

### Worth fixing before launch
| Review | Item | Severity | Effort |
|--------|------|----------|--------|
| Vault | M5: readVault silent data loss on corrupt JSON → backup to .bak | Major | 30 min |
| Vault | M6: Windows atomic write (unlink+rename instead of fallback overwrite) | Major | 30 min |
| Vault | M8: reveal endpoint origin check (startsWith → exact match) | Major | 15 min |
| Chat Route | M1/M2: `as any` casts on security-relevant paths | Major | 1 hr |
| Orchestrator | M5: silent catch in recallMemory → log.error | Major | 15 min |
| Orchestrator | M8: markSummarySurfaced called before model call succeeds | Major | 30 min |
| Harvest | M3: batch parallelism (Promise.all with cap ~5) | Major | 1 hr |

### Nice-to-have (defer to post-launch)
- Orchestrator M15: extract autoSaveFromExchange into detectors/ module (229→40 LOC)
- Cognify M2: getEntityByExactName indexed lookup (currently searchEntities)
- All minor items across all reviews

---

## MARKO'S ACTION ITEMS

| # | Action | Unblocks | Time |
|---|--------|----------|------|
| 1 | **Export ChatGPT conversations** (Settings → Data controls → Export data) | Phase 1 harvest | 5 min |
| 2 | **Export Claude conversations** (claude.ai → Settings → Export) | Phase 1 harvest | 5 min |
| 3 | **Export Gemini conversations** (Google Takeout → Gemini) | Phase 1 harvest | 10 min |
| 4 | **Export Perplexity threads** (Settings → Account → Export data) | Phase 1 harvest | 5 min |
| 5 | **Provide OpenAI + Google API keys** for judge pool | Phase 5 GEPA proof | 5 min |
| 6 | **Approve $2000-3000 total budget** for both crown jewel tests | Phases 4+5 | Decision |
| 7 | **Create Stripe products** (Pro $19 + Teams $49/seat) | Revenue flow | 1 hour |
| 8 | **Buy EV code signing cert** ($300-500/yr) | Signed installer | 1-3 days |
| 9 | **Contact external ML peer reviewer** for Paper 2 | Phase 6 peer review | 1 day |
| 10 | **Greenlight launch date** (week of ?) | Everything | Decision |

---

## OPEN STRATEGIC DECISIONS (from C-track)

| # | Decision | Unlocks |
|---|----------|---------|
| C1 | `hive-mind` OSS timing — now / Q2 / Q3? | OSS launch prep |
| C5 | Harvest-first onboarding — replace step 2 or parallel opt-in? | Phase 3 UX |
| C8 | Warm list — 5-10 names to pre-email 72h before launch | Launch credibility |
| C9 | Single-author or dual-author on papers? | Paper attribution |
| C11 | Marketplace model — free+attribution / freemium / enterprise-only? | Skills monetization |
| Keep/reattribute "Mikhail's EvolveSchema" in public? | Paper 2 framing |

---

## CRITICAL PATH

```
Marko exports AI accounts ──► Phase 1 Harvest (3d) ──► Phase 2 Wiki (7d) ──► Phase 4 Memory Proof (10d) ──► Paper 1
                                                    └──► Phase 5 GEPA Proof (15-21d) ──────────────────────► Paper 2
Phase 0 Fix+Wire (1-2d) ──► Phase 3 Harvest UX (7d) ──► Phase 7 Polish ──► LAUNCH DAY
Stripe setup + code signing ─────────────────────────────────────────────► LAUNCH DAY (parallel)
hive-mind extraction (7d) ───────────────────────────────────────────────► LAUNCH DAY (parallel)
```

**Earliest launch:** ~4 weeks from keys + exports delivery, if Marko's external actions start immediately.

---

*v2 — replaces initial master plan. Single source of truth for all work streams.*

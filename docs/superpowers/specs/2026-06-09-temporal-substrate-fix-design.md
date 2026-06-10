# Temporal Substrate Fix — Design Spec

**Date:** 2026-06-09 · **Status:** approved (brainstorming), pre-implementation
**Origin:** Memori head-to-head (`benchmarks/results/memori-head-to-head-RESULT-2026-06-09.md`) — our substrate ties Memori overall (80.84 substrate-vs-substrate / 82.21 our-prompt vs 81.98) but **loses temporal −9pp** (73.5/73.8 vs 82.7). Code map: temporal info is captured in the DB but stripped before the LLM sees it.
**Scope:** "Surface time" (additive only). NOT time-aware re-ranking, NOT timestamped-triple re-representation.
**Goal:** lift LoCoMo temporal toward peer-best (~82–87%) without regressing single (89) / multi (77) / open (66); change the **real substrate** (`hive-mind-core` → waggle-os), measurable on the existing harness; keep OSS subtree-split clean.

## Root cause (from `Explore` map, file:line)
- `memory_frames.created_at` IS populated from source timestamps (schema.ts:59; LoCoMo ingest 02b:93 passes the session date). Importance/semantic hits SELECT `created_at` (fetchImportantFrames). **The data exists.**
- **The loss is in rendering + distillation + prompt:**
  - GAP 2 (load-bearing): benchmark `buildContext` (40:135-153) renders fact/snippet text only — **strips `created_at`**. Production `renderRecallResult` shows date-only for snippets, nothing for facts.
  - GAP 3: our answer prompt has **no temporal-arithmetic instruction**. (Memori's `ANSWER_PROMPT` does — but our `theirs` arm still scored 73.5 because the context we fed it had no timestamps for that instruction to use. **Proof the fix is in the context, not the prompt.**)
  - GAP 1: distilled facts written with `createdAt=null` (28:137, 31:124) AND `fetchDistilledFacts` doesn't even SELECT created_at. Distilled facts are cross-session syntheses → no single meaningful date → deferred to Phase 2.

## Approach (chosen): shared renderer in `hive-mind-core`, additive
One source of truth the whole stack imports; no benchmark/production drift; OSS-clean.

## Phase 1 — Surface snippet time + prompt guidance (ZERO LLM re-cost)
The high-leverage, cheap lever. No re-ingest, no re-distill — only rendering + prompt, then re-run answer+judge.

**Production (`packages/hive-mind-core/src/mind/`):**
1. Add/extend a context renderer (near `recall-context.ts` renderRecallResult) so each retrieved snippet is prefixed `[YYYY-MM-DD]` (from `created_at`), and the memory block opens with one anchor line: `Reference date (most recent memory): YYYY-MM-DD`. Compact format (≤~8 tokens/item) to bound the token bump.
2. Export a reusable `TEMPORAL_GUIDANCE` prompt fragment: *"Memories are timestamped [YYYY-MM-DD]. Resolve relative time ('last year', 'two months ago') to absolute dates using the memory's timestamp as the anchor. On conflicting facts, prefer the most recent."* Attach it to the injected-memory block in the agent's memory-recall path — **scoped to memory recall, NOT a global system-prompt change.**

**Benchmark (`hive-mind-test/scripts/locomo/`):**
3. `40-cell-retrieval-gpt41mini.mjs` `buildContext`: render each importance+semantic snippet with its `[YYYY-MM-DD]` (hits already carry `created_at`; verify) + the reference-date anchor line. Mirror the production renderer's format.
4. `ours` prompt arm: prepend `TEMPORAL_GUIDANCE`. `theirs` arm: keep Memori's verbatim ANSWER_PROMPT unchanged (it already has the instruction — now it finally has timestamps to act on; this is the cleanest before/after).
5. (Readiness only) add `created_at` to the `fetchDistilledFacts` SELECT so Phase 2 can use it.

**Measure:** re-run both arms on the identical ruler (gpt-4.1-mini answerer+judge, Memori judge prompt, 1540 Qs) via the existing orchestrator. Compare temporal + the other three + tokens/query.

## Phase 2 — Dated distilled facts (OPTIONAL, only if Phase 1 underdelivers; has LLM re-cost)
Re-distillation prompts the distiller to attach the relevant absolute date(s) into time-bearing fact text, and stamps each distilled frame with the latest contributing session date. Costs a re-distillation LLM pass + re-run. Decide after Phase 1 numbers.

## Success / regression gate
- **PASS:** temporal ↑ materially (target ≥ ~82, Memori parity), AND single/multi/open each within **±1.5pp** of today (89.1 / 77.0 / 65.6), AND tokens/query bump disclosed (expected small, compact format).
- Overall projected: temporal 73.8→82.7 ≈ **+1.9pp → ~84% overall** (our-prompt arm), clearing Memori beyond single-run noise.

## Repos & OSS hygiene
- Canonical change in `waggle-os/packages/hive-mind-core` (production). Benchmark imports the built `D:/Projects/hive-mind` (OSS checkout) — rebuild its dist after mirroring, OR the renderer change is small enough to mirror directly; verify the benchmark picks up the new renderer before the paid run.
- All new logic in `hive-mind-core` (not vault/evolution/compliance) → subtree-split filter unaffected.

## Risks
- Token bump from per-item dates (worsens the efficiency axis we already lose) → keep format compact, measure avg/p50.
- Benchmark uses a built `hive-mind` dist, not waggle-os source directly → must ensure the renderer change reaches the benchmark (rebuild/mirror) or the measurement won't reflect the fix.
- `recall.hits` must expose `created_at` to `buildContext` — verify in implementation; if absent, add to the recall projection.

## Out of scope (YAGNI)
Time-aware re-ranking (GAP 5), since/until wiring into default recall (GAP 6), full triple re-representation. Revisit only if Phase 1+2 miss the gate.

## Follow-on sub-project B (separate spec)
SOTA campaign: run Zep/LangMem/Mem0 on our ruler + judge hardening (trio-strict) + public write-up. Depends on this fix landing a number.

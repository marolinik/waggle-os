# W4 — Production Parity Port Plan (2026-06-11)

**Goal:** port the benchmark-proven LoCoMo retrieval stack (W3.3 FINAL: **87.66 overall,
+5.71pp vs Memori, z=4.42**; see `benchmarks/results/memori-phase22-RESULT.md`) into the
Waggle OS production recall path. Pre-approved by Marko ("if results within projected we
implement on production" — they are, above projection).

**Evidence base per component** = the wave-gated z-tests (W1 answer policy → W2a profiles
→ W3.1 date-window → W3.3 raw-detail + caption parity). Anti-goals from the arc apply
verbatim (proposal §4): never strip write-time dating; no relevance-only episodic; no
agentic multi-turn retrieval in the hot path; keep conditional abstention in production
(never-refuse was benchmark-cell policy ONLY); no Neo4j/cloud.

**Recon provenance:** 4-agent workflow `w4-port-recon` (2026-06-11) over
`packages/agent`, `packages/hive-mind-core`, `packages/server`, benchmark harness
`D:/Projects/hive-mind-test/scripts/locomo/`. Full gap matrix below.

---

## 0. Headline findings

1. **Production auto-recall uses 1 of the benchmark's 7 lanes.**
   `chat.ts:761 → orchestrator.recallMemory` (default opts) → HybridSearch FTS5+vec
   RRF — that's it. No reranker, no distilled/episodic/profile lanes, no date windows,
   no raw escalation. The benchmark's win is the *orchestration* (7 lanes, id-dedup,
   fixed render order), not any single lane.
2. **The OSS repo is AHEAD of the monorepo** — `inprocess-reranker.ts`
   (Xenova/ms-marco-MiniLM-L-6-v2, transformers.js ONNX, ~22MB) + reranker options in
   HybridSearch exist ONLY in `D:/Projects/hive-mind/packages/core`. This contradicts
   the CLAUDE.md §7.5 "byte-identical subtree-split" assumption. **W4.2 reverse-ports
   it; a §7.5 sync-policy decision is flagged for Marko.**
3. **Ollama is NOT a hard dependency for anything.** LLM extraction passes route via
   the existing `LLMCallFn` 'fast' tier → LiteLLM (Ollama = optional sovereign-local
   routing target). Reranker is in-process CPU ONNX. Components #1/#2/#3/#7/#9/#10
   are pure code.
4. **Three production scoring/filter bugs must not be built on top of** (§3 below).

---

## 1. Gap matrix (impact × ease order)

| # | Component | Verdict | Where it lands |
|---|---|---|---|
| 1 | Date rendering + TEMPORAL_GUIDANCE | **PARTIAL** — helpers shipped in `recall-context.ts`, ZERO consumers; guidance text is stale pre-W1 wording | orchestrator.ts:486-498/:529-537, tools.ts:217/:232, prompt-assembler.ts:280-282 |
| 2 | Importance K=5 lane | **PARTIAL** — identical SQL exists (orchestrator.ts:422-432) but gated behind 13 catch-up regexes | make unconditional in recallMemory; dedup at :440-447 reused |
| 3 | Date-window parser + Events-during-X | **MISSING** parser; substrate since/until exists w/ 2 defects | new pure module beside resolve-relative-date.ts; wire at orchestrator.ts:453-458 |
| 4 | Cross-encoder reranker | **MISSING** in waggle-os (0 grep hits) — reverse-port from OSS `inprocess-reranker.ts` | optional peer dep @huggingface/transformers; caller-level seam covers merged personal+workspace pool |
| 5 | Distilled-facts lane | **PARTIAL** — 4-pass HarvestPipeline (pipeline.ts:83-338) is DEAD CODE (zero call sites); no wholesale fetch lane | distillation cron (cron-store.ts/setup-crons.ts) + prefix-fetch lane + "Memory Facts" section |
| 6 | Episodic events block | **MISSING** — only resolveRelativeDate shipped, wired into MCP harvest ONLY; sidecar + memory-mcp paths unwired (twin drift: memory-mcp passes NO timestamp) | port script-33 pass into pipeline; unify 3 ingest surfaces; chronological render; CE top-K needs #4 |
| 7 | Caption-aware harvest | **MISSING** — all 4 adapters drop image content (exact production counterpart of the W3.3 4.5pp single-hop fix); exports ALREADY carry extracted text (Claude `extracted_content`, ChatGPT caption parts, Gemini inlineData) | chatgpt/claude/gemini/universal adapters; no vision model needed |
| 8 | Profile cards | **MISSING** — IdentityLayer is single-user; wiki person pages never injected | script-35 pass keyed off KnowledgeGraph person entities; render-FIRST + seen-set exclusion |
| 9 | Token packing | **PARTIAL** — PromptAssembler exists, flag OFF, **3 bugs block enabling**: double-inject (chat.ts:879), double-compute (orchestrator.ts:340-343), dateless renderFrames; fleet spawns get zero recall | fix bugs → route lanes through budget → flip flag |
| 10 | RAWDETAIL escalation lane | **MISSING — hardest, do LAST.** Blockers: (a) per-turn verbatim dialogue is NOT stored (harvest collapses to 1 summary frame, 2000/10000-char truncation divergence), (b) needs #4, (c) no conversational-adjacency key (base_frame_id is I/P delta chains) | per-turn storage decision + turn-index metadata + lane port |

## 2. Render order (port as a pure `buildContext`-style renderer in hive-mind-core)

profiles → distilled facts → episodic (chronological) → Events-during-window →
importance+semantic snippets (+ reference-date anchor) → raw excerpts.
Natural location: beside `recall-context.ts` (its stated purpose), consumed by
`orchestrator.recallMemory` — benchmark/production format parity by construction.

## 3. Production bugs to fix in-line (NOT build on top of)

1. **graphDistances never passed** → contextual score always 0 → 20% of 'balanced' /
   60% of 'connected' weight permanently dead. Worse: `bfsDistances` returns ENTITY-id
   keys where scoring looks up FRAME ids — wiring it naively silently fails.
   Decision: build the frame-anchored bridge (docs/memory-architecture.md:296 describes
   the intent) **or zero out the dead weight** in SCORING_PROFILES. Default: zero-out in
   W4.2, bridge as follow-up (benchmark won without graph signal).
2. **since/until zero deterministic callers**; SQL filter applied POST-fusion (filtered
   frames consume lane slots → results shrink below limit) + until-fencepost
   (string-compare excludes same-day frames). Fixed by #3.
3. **'temporal' scoring decays on last_accessed** (touch() bumps it → constant noise on
   historical corpora). Switch to created_at/event-date decay in W4.2 (resolved
   created_at from #6 makes it meaningful).

## 4. Non-negotiable constraints (every new lane)

- `scanForInjection` over ALL recalled text (orchestrator.ts:517-527 blocks all recall
  on hit; chat.ts:763-771 re-scans).
- Anti-confabulation provenance preamble stays (orchestrator.ts:529-537).
- temporary/deprecated post-filter respected (orchestrator.ts:466-471).
- Conditional abstention preserved — do NOT port the benchmark's never-refuse prompt.
- Profile frames importance='normal' (out of K5 lane), excluded from snippet lane.
- Wholesale chronological episodic block is load-bearing — no top-K-only "optimization"
  without the CE floor (P5 lesson).

## 5. Phases (≤5 files each, commit + verify per phase)

| Phase | Scope | Components | Verify |
|---|---|---|---|
| **W4.1** | Query-time quick wins (pure code) | #1 temporal render+W1 guidance text, #2 unconditional importance lane, #3 date-window parser + since/until substrate fixes | new unit tests; tsc agent+hive-mind-core; existing suites green |
| **W4.2** | Reranker reverse-port + scoring bug fixes | #4 inprocess-reranker + HybridSearch options (from OSS); bugs 1+3 | reranker unit tests (OSS has them); scoring tests updated |
| **W4.3** | Extraction passes + lanes | #5 distillation cron + facts lane, #6 episodic pass + ingest unification (3 surfaces), #8 profile cards; new renderer module | pipeline tests w/ mocked LLMCallFn; ingest-path tests incl. memory-mcp timestamp fix |
| **W4.4** | Harvest input parity | #7 caption-aware adapters ×4; truncation reconciliation (2000 vs 10k) | adapter fixture tests w/ real export shapes |
| **W4.5** | Budget + assembly | #9 PromptAssembler 3 bug fixes, route lanes through budget, flag flip; ≤1.5k token packing target | assembler tests; double-inject regression test; live smoke |
| **W4.6** | RAWDETAIL (last) | #10 per-turn storage decision + turn-index key + lane | needs Marko sign-off on storage growth tradeoff first |

Re-validation after W4.3 and W4.5: LongMemEval N=100 spot-check (knowledge-update +
single-session categories) per proposal §5 — guards the production-policy variants
(conditional abstention) against regression.

## 6. Open decisions for Marko

1. **§7.5 sync policy** — OSS repo evolved ahead (reranker). One-off reverse-port (W4.2
   does this regardless) vs re-establishing the subtree-split invariant afterward.
2. **W4.6 storage tradeoff** — per-turn raw dialogue storage grows the .mind footprint
   substantially (LoCoMo: ~600 turns/conv). Gate W4.6 on explicit GO.
3. **graphDistances** — zero-out (default) vs build the frame-anchored bridge now.
4. **Distillation cron cadence + model tier** — 'fast' tier via LiteLLM default;
   Ollama-only mode reserved for the sovereign story.

## 7. Status log

- 2026-06-11: Plan written from w4-port-recon workflow output.
- 2026-06-11 (W3.4 ablation DONE): **attribution resolved — captions alone +0.26 ns;
  raw-detail lane on top +2.40 (z=1.95).** The lane is the delivery mechanism, captions
  the payload. W4 consequence: **#7 and #10 are a coupled pair** — caption-aware
  adapters deliver little recall value through existing lanes; schedule #7 WITH (or
  immediately before) #10, or route caption text through the #5/#6 extraction passes
  so distilled/episodic facts carry it. The W4.4 phase stays (input parity is still
  correct), but its measured-win expectation moves to W4.6.

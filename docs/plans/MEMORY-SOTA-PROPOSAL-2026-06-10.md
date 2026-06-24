# Memory SOTA Proposal — 2026-06-10

**Status:** PROPOSAL (no code). Research basis: 6-agent workflow (substrate map, failure
mining of 1,540 judged answers × 2 arms, Zep/Graphiti, LangMem, academic survey
2024–2026, open-domain deep-dive). Constraints: **fully local** (SQLite + sqlite-vec,
Ollama embeddings, in-process ONNX cross-encoder, optional local LLM via Ollama),
**personal + workspace minds preserved**, OSS subtree-split clean.

---

## 0. THE RE-BASELINE — we were chasing a phantom (read this first)

The Memori paper's baseline rows are **column-scrambled**. Its Table 1 says baselines
were "retrieved from Du et al. [2025]" (= MemR3, arXiv:2512.20237). MemR3's column
order is `Multi | Temporal | Open | Single`; Memori printed the same values under
`Single | Multi | Open | Temporal`. Verified by extracting both PDFs + MemR3's §C.3
("existing works have misaligned category labels") + Memori's own self-contradictory
narrative ("72.70 trailing 61.06").

**Audited our harness: our labels are CORRECT** (temporal n=321 with "When did..."
questions, open n=96, multi n=282, single n=841 — exact canon counts + semantic
spot-checks pass). Our numbers stand. The *competitor* numbers move:

### Corrected LoCoMo landscape (GPT-4.1-mini protocol)

| Category | FC ceiling | MemR3* | **Ours (P4)** | Memori | Zep† | LangMem† | Mem0† |
|---|---|---|---|---|---|---|---|
| Temporal | 86.82 | 82.14 | **80.06** ⭐ | 80.37 | 77.26 | 61.06 | 57.32 |
| Open-domain | 71.88 | 71.53 | 60.42 ❌ | 63.54 | 64.58 | **67.71** | 44.79 |
| Single-hop | 93.73 | 92.17 | **88.59** ⭐ | 87.87 | 83.49 | 86.92 | 66.47 |
| Multi-hop | 86.43 | 81.20 | **79.43** ⭐ | 72.70 | 72.34 | 74.47 | 62.41 |
| **Overall** | — | — | **83.38** ⭐ | 81.95 | — | 78.05 | 62.47 |

\* MemR3 = agentic reflective-retrieval pipeline (different class, not a memory system).
† Corrected per MemR3 Table 1. Zep's self-published 83.33/73.96 don't match any MemR3
version — provenance unclear; cross-lab LoCoMo numbers are noisy, which makes our
**in-harness same-judge comparison the defensible standard**.

**Corrected verdict: we are ALREADY the leading memory system on overall, single-hop,
multi-hop, and (≈tied with Memori) temporal.** The phantom "LangMem temporal 86.92"
was LangMem's *single-hop* score; LangMem's real temporal is 61.06 — its extractor
never receives conversation timestamps (verified in its source), which validates our
write-time dating as the right design (+19pp over LangMem on temporal).

**The ONE real gap: open-domain 60.42** vs LangMem 67.71 / FC 71.88.
**The second axis: tokens** — 2,742/q vs Memori's 1,294.

Caveat: open-domain n=96 → SE ≈ ±5pp; deltas <8pp are noise-adjacent. All wave gates
below use two-proportion z-tests on full N (no mid-run proxies — they burned us twice).

---

## 1. What the failure data says (1,540 judged answers × 2 arms, mined)

### Open-domain (34 fails / 96)
- **16/34 are ABSTENTIONS** ("Not stated in the retrieved context") on speculative
  questions ("Would Caroline be considered religious?"). The protocol dropped the
  adversarial category, so abstention is a guaranteed zero. In 4 cases the *theirs*
  arm answered the same question correctly from the SAME substrate → prompt-induced.
- ~12 wrong inferences (persona signal too dispersed; vocabulary mismatch:
  "console" never co-occurs with "Xenoblade").
- ~3 counting errors from **episodic duplicates** (same hike narrated twice → "five" vs gold "four").
- Question type: ~50% persona/preference inference, ~25% world-knowledge bridging,
  ~10% entity-ID, ~15% aggregation. **It is persona synthesis + licensed speculation,
  not retrieval.** Fact-list systems (us, Memori) bottom out here; profile/summary
  systems (LangMem, Zep, MIRIX) lead.

### Temporal (71 fails / 321) — ~60% prompt-side, ~40% substrate
- **15 precision-miscalibration fails**: we emit a confident exact ISO date 1–7 days
  off where the judge accepts coarse answers — 22 of 31 ours-only fails PASSED in the
  theirs arm with "Early June 2023"-style granularity.
- **11 session-date echoes**: gold is "the week before <session date>"; our write-time
  resolution stamped the mention date (forward resolution exists, backward ranges don't).
- **18 wrong event bindings** (Tokyo vs Boston; reversed adoption order) — episodic
  duplicates + no date-window filtering at retrieval.
- **11 refusals** (dated event not retrieved), 6 duration fencepost errors.

### Multi-hop (71 fails) — dominant cluster: partial enumeration on cross-session
aggregation ("Which US cities...?" → returns 1 of 3) + duplicate-inflated counting.
### Single-hop (95 fails) — fine-grained detail lost by distillation (gold: "painting
inspired by sunsets with pink sky"; we retrieve the distilled "an abstract painting").

### Substrate map findings (production-relevant)
- **KnowledgeGraph contributes ZERO to recall** — `bfsDistances→contextual-score`
  wiring exists in scoring.ts but no caller passes graphDistances → 20% of the
  'balanced' relevance weight is permanently 0.
- **since/until SQL filters exist in HybridSearch + FrameStore — never called by anyone.**
- Production recall (orchestrator.ts) has NO reranker/chunking/distilled/episodic
  layers — those exist only in the OSS repo + benchmark harness. Production lags the
  benchmark substrate substantially.
- Scoring "temporal" dimension decays on `last_accessed` (access recency) — constant
  noise on a 2023 corpus, not event time.

---

## 2. The proposal — four waves, each gated by a full-N z-tested re-run

### WAVE 1 — Answer-policy fixes (prompt-only, zero substrate risk, ~1 day)
Targets the measured prompt tax. No regression risk to the substrate.
1. **Conditional abstention**: speculative/inferential questions ("would/might/could/
   likely") → forbid refusal, force committed best-effort inference from retrieved
   evidence + world knowledge. Factual questions keep abstention (production safety).
   *Evidence: 16 guaranteed-zero abstentions; judge demonstrably accepts directional guesses.*
2. **Granularity-calibrated dates**: emit exact day ONLY when explicitly stated;
   otherwise answer at week/month granularity ("early June 2023").
   *Evidence: 22 ours-only temporal fails passed in theirs arm with coarser answers.*
3. **Duration brevity + endpoint few-shot**: final value only (verbose multi-date
   reasoning triggers harsh judging); fencepost examples.
4. **Commit-to-one-option**: forbid hedged dual answers ("both") on either/or questions.
5. **Parametric-knowledge gating** (arXiv:2510.23730): for world-knowledge-bridging
   questions, instruct "combine retrieved facts with general world knowledge" —
   retrieval-only instructions measurably suppress the model's own knowledge (FC 56.4
   vs RAG 49.5 F1 on this category).

**Expected: open +6–10pp, temporal +4–6pp, overall → ~85.** Cost: ~$6 re-run.

### WAVE 2 — Profile cards + episodic hygiene (write-time substrate, local LLM)
The dominant open-domain lever, converging from three independent sources (Zep entity
summaries, LangMem profiles, MIRIX core-memory; all profile-carrying systems lead this
category).
1. **Per-speaker rolling profile cards**: ~500-char abstractive profile per
   speaker/entity, updated incrementally at ingest (Graphiti fast-path: append facts
   without LLM call while under cap; consolidate-compress via Ollama when over).
   Rendered as a "PERSONA" block in context. Per-scope (personal + per-workspace) —
   isomorphic with our existing split.
2. **Episodic event canonicalization**: dedup same-event-renarrated rows at ingest
   (fixes counting failures in open + multi).
3. **Event-date RANGES**: backward resolution for retrospective narration — store
   `[event_date_min, event_date_max]` + mention date ("last week" → 7-day window),
   render ranges; answer at range granularity (pairs with Wave-1 #2).

**Expected: open → ≥70 (combined with Wave 1), temporal +2–3pp, tokens −10–20%**
(one profile card replaces many weak-signal facts).

### WAVE 3 — Retrieval lanes (query-time; mostly wiring existing code)
1. **Temporal retrieval lane** (MRAG arXiv:2412.15540 / Hindsight TEMPR): parse the
   query's temporal constraint (deterministic, extends resolve-relative-date.ts to
   query side) → **pass the already-existing-but-never-called since/until filters** →
   add a date-window lane into RRF fusion before the cross-encoder. MRAG: +9.3% top-1
   recall on temporal QA.
2. **Entity-keyed exhaustive retrieval** for enumeration/counting questions: pull ALL
   episodic rows for the focal entity (not top-K), dedup-by-event before answering.
   *Targets the dominant multi-hop cluster (~16/24 sampled fails).*
3. **Raw-detail escalation lane**: when the question asks for concrete perceptual
   detail and distilled facts match only generically, fetch the raw session turn
   around the matching fact (256-token chunks; sqlite-vec + FTS — our existing stack).
   *Targets the dominant single-hop cluster.*
4. **Wire graphDistances into scoring** (the dead 20% weight) + BFS-expansion lane
   self-seeded from search-hit entities (depth ≤2, recursive CTE — sub-ms at our scale).

**Expected: temporal → ~84–86 (FC ceiling is 86.82), multi → ~82–84, single → ~90.**

### WAVE 4 — Bi-temporal substrate + production parity (architecture; product-first)
1. **Bi-temporal validity on facts** (Zep model): `valid_at/invalid_at` (event time) +
   `created_at/expired_at` (transaction time); facts never deleted, only closed.
2. **Ingest-time invalidation**: one small-Ollama call per new fact against same-entity
   + RRF-similar existing facts → `duplicate[]`/`contradicted[]`; a deterministic
   temporal-overlap rule does the actual invalidation (LLM proposes, arithmetic disposes).
   Gives latest-wins for "what is X now" while preserving "what was true then" —
   fixes the knowledge-update losses we measured on LongMemEval too.
3. **Production parity**: port the benchmark-proven stack (reranker, distilled facts,
   episodic dated events, date rendering, TEMPORAL_GUIDANCE, profile cards) into the
   production recall path (orchestrator.ts) — production currently has none of it.
4. **Token-budget context packing** (Zep's 1.6k-token block beats 115k full-context):
   target ≤1,500 tokens/q — closes the efficiency gap with Memori while raising scores.

**Expected: durable product wins beyond LoCoMo; tokens → ~1.5k/q.**

---

## 3. Projected end-state (honest ranges, ±noise)

| Category | Now | After W1 | After W2 | After W3/W4 | FC ceiling |
|---|---|---|---|---|---|
| Temporal | 80.06 | ~84 | ~85 | **85–87** | 86.82 |
| Open-domain | 60.42 | ~67 | **70–74** | 72–75 | 71.88 |
| Single-hop | 88.59 | 88.5 | ~89 | **90–92** | 93.73 |
| Multi-hop | 79.43 | ~80 | ~81 | **82–84** | 86.43 |
| **Overall** | **83.38** | **~85.3** | **~86.3** | **87–88.5** | — |
| tokens/q | 2,742 | 2,742 | ~2,300 | **≤1,500** | — |

At ~86–88 overall we'd clear every published memory system by a decisive (significant)
margin and approach Hindsight's local-model result (85.67 w/ GPT-OSS-20B) — whose
architecture (same CE reranker + temporal lane + observation summaries + graph lane)
independently validates this exact roadmap, with local open-weight models.

## 4. Anti-goals (lessons paid for)
- **Never strip write-time dating** (LangMem's undated extraction = its 61.06 temporal).
- **No relevance-ranked-only episodic** (P5 proved top-K filtering reverts the timeline-
  scaffold benefit; keep the chronological block, dedup it instead).
- **No agentic multi-turn retrieval loops in production hot path** (LangMem p95 ~60s).
  MemR3-style reflection is benchmark-viable but a latency hazard; defer, lane-gate.
- **Keep abstention for factual unknowns in production** (conditional policy only
  loosens speculative questions; adversarial robustness must not regress).
- **No Neo4j / no cloud** — everything above is SQLite tables + Ollama + in-process ONNX.

## 5. Verification protocol
Each wave: full N=1540 both-prompt-arms re-run on the Memori-protocol harness, ours-vs-
previous two-proportion z-tests per category, gate = target category up significantly
OR (up + nothing down >1.5pp). Plus LongMemEval N=100 spot-check after W2/W4 (knowledge-
update + temporal-reasoning types) to confirm cross-benchmark transfer. Publish per-wave
in benchmarks/results/.

## 6. Decision requested
Approve wave order? W1 is ~1 day and pure prompt; W2 is the substrate centerpiece
(~2–4 days); W3 mostly wires existing dead code (~2–3 days); W4 is the long-pole
architecture + production-parity arc (~1–2 weeks, product value beyond benchmarks).

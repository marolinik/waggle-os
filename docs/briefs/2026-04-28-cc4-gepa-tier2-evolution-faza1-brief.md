# CC-4 Brief — GEPA Tier 2 Prompt-Shapes Evolution (Faza 1 pilot)

**Date:** 2026-04-28
**Author:** PM
**Status:** Authored, awaiting Marko ratification before paste-into-CC-4
**Sesija type:** CC-4 fresh (paralelno sa CC-1 Phase 4.4/4.5 + CC-3 memory shims)
**Critical path:** Korak 1 → GEPA Faza 1 → Faza 2 (gated) → Phase 5 GEPA-evolved
**Cost cap:** $100 hard, halt at $80
**Wall-clock projection (not trigger):** 3–5 dana CC time, ~2–3 dana wall-clock if no rate-limit blockers

---

## §1 — Context (zašto smo ovde)

Phase 4.3 verdikt (CC-1, commit be8f702→c9bda3d) empirijski potvrdio da H3/H4 fail je **72.2% Tier 2** (reasoning/planning failure koji zahteva prompt evoluciju), samo 5.6% Tier 1 (presentation artifact koji bi se popravio Phase 1.1 normalize). Phase 1.1 normalize delta = 0% kroz svih 12 cells. Worst-case T1 ceiling = 27.8%, ispod 30% threshold-a koji bi nam dao paper claim #2 multiplier signal. H4 je 100% T2 unanimnost.

Implikacija: agent fix sprint Phase 1-4 sam, ma koliko ga doteramo, ne može da spase multiplier tezu. Treba reasoning/planning evolucija nad prompt-ima — što je GEPA (Agrawal et al., genetic evolutionary prompt adaptation).

Ovo je gated work: Faza 1 = pilot proof-of-concept (1 cell, $100 cap). Ako Faza 1 PASS → Faza 2 expansion (sve T2-saturated cells, $200-300 cap, posebna ratifikacija). Ako Faza 1 FAIL → fallback na PHF (PASS-with-honest-framing) per Decision Matrix amendment.

---

## §2 — Scope LOCK (Faza 1)

**Što GEPA evoluira:** prompt-shapes templates u `packages/core/src/prompt-shapes/`. **NE** evoluira system prompts (cell semantics) — ti ostaju lock-ovani na manifest v6 specifikaciju da očuvamo apples-to-apples kontrolu sa Stage 3 v6 N=400 results.

**Razlog:** prompt-shapes evolucija je niži rizik za leakage cross-cell, evolution boundary je čist + auditable. System prompt evolucija bi compoundova confounders i ugrozila reproducibility paper claim #1 substrate (74% > Mem0 66.9%).

**Cell scope Faza 1:** **H3 only** (najjača T2 saturacija per Phase 4.3 verdict). H2 + H4 ulaze u Fazu 2 ako Faza 1 PASS. Zašto H3 prvi: maksimalni signal-to-cost ratio za "does GEPA help at all" gate.

**Prompt shapes scope:** svih 5 (claude / qwen-thinking / qwen-non-thinking / gpt / generic-simple). GEPA evoluira **per-shape**, ne unified. Selection metric = best-per-shape-per-cell (ne aggregate).

**N per evaluation:** 15 instanci per candidate per generation (per shape per cell). Insufficient za publishable paper claim, **dovoljno za GEPA fitness signal** (per Agrawal paper — fitness signal stabilizes around N=10-20 in inner loop).

**Generations:** 2 (initial population + 1 mutation round). Faza 1 = proof-of-concept, ne convergence search. Faza 2 expansion može da poveća na 3-5 generations.

**Population:** 3 candidates per shape per cell. Initial population = current shape (baseline) + 2 LLM-generated mutations (Opus 4.7 as mutation oracle).

---

## §3 — Methodology

### 3.1 — Fitness function

Composite score per candidate:
- **Primary:** trio-strict accuracy (Opus 4.7 + GPT-5.4 + MiniMax M2.7 ensemble, 2/3 must agree, max_tokens=3000 per Stage 3 v6 fix)
- **Cost penalty:** −0.5pp per $0.10 cost above baseline median (encourages efficiency)
- **Tie-breaker:** trio-soft accuracy (any 1/3 agreement)

Aggregate fitness per candidate = trio-strict − cost_penalty.

### 3.2 — NULL-baseline gate (binding)

Pre Faza 1 GEPA run, CC-4 mora da reproducira **NULL-baseline** = current prompt-shape on H3 cell, N=15, trio-judged. Ovo lockuje fitness floor pre evolucije.

Acceptance: NULL-baseline trio-strict mora pasti u predikcionom range-u iz Phase 4.3 (h3 cell est. 18-24% trio-strict baseline). Ako NULL-baseline ispod 15% ili iznad 30%, halt-and-PM (signal da nešto fundamentally drift-ovalo između Phase 4.3 i sad).

### 3.3 — Mutation oracle

Opus 4.7 generates 2 mutations per shape per generation, prompted with:
- Current shape template
- Failure mode summary (top-3 T2 failures from Phase 4.3 categorization)
- Constraint: preserve cell semantics (system prompt boundaries, output format contract)
- Mutation guidance: "modify reasoning scaffold, planning step structure, or chain-of-thought triggers — do not modify task framing or scoring criteria"

### 3.4 — Reproducibility

- **Seed:** GEPA evolution algorithm seeded with `42` (configurable in manifest v7)
- **Selection set:** 15 instances per cell sampled deterministic-stratified iz LoCoMo full corpus (same stratification as Stage 3 v6 manifest)
- **Manifest v7:** new manifest extending v6 sa GEPA section (population seed, mutation oracle SHA, generation count, candidate hashes)
- **Audit trail:** every candidate prompt hashed (SHA256), every evaluation logged sa raw judge outputs

### 3.5 — Substrate dependency

GEPA radi nad **post-Phase 4.6 HEAD** (mind/ + harness sa svih Phase 1-4 fix-eva integrated). Substrate version stays v6 (zero changes). Manifest v7 audit chain references manifest v6 anchor SHA.

---

## §4 — Acceptance criteria (Faza 1 → Faza 2 gate)

Faza 1 PASS conditions (binding, all 4 must hold):

1. **Best GEPA candidate per shape beats NULL-baseline by ≥ +5pp on trio-strict** (per H3 cell)
2. **At least 3/5 shapes show positive delta** (avoids cherry-picking single shape that lucked out)
3. **Trio judge κ remains within ±0.05 of canonical 0.7878** (validates judge ensemble didn't drift mid-run)
4. **Zero cell semantic violations detected** (audit step §6.4)

Faza 1 FAIL conditions (any single condition triggers FAIL verdict):

- Best candidate delta < +5pp on majority shapes
- Best candidate beats NULL-baseline only by overfitting evaluation set (detected via held-out 5 instances per cell)
- κ drift > 0.05 (judge ensemble unreliable)
- Cell semantic violation found

If FAIL → fallback PHF, GEPA work parked, paper claim #2 multiplier tezu reframe-uje na "demonstrated only under V2 retrieval + Tier 1 normalize, GEPA insufficient at this scope" (acceptable academic framing, ne mora se hide).

---

## §5 — Cost & halt

**Faza 1 cost projection (rigorous, not trigger):**
- NULL-baseline: 5 shapes × 15 instances × $0.50/run × 1 cell = **$37.50**
- GEPA Gen 1: 5 shapes × 3 candidates × 15 instances × $0.50 × 1 cell = **$112.50**
- Held-out validation: 5 shapes × top-1 × 5 instances × $0.50 = **$12.50**

Wait — that exceeds $100 cap. Recalc with Gen 1 reduced:

**Revised Faza 1 with $100 cap:**
- NULL-baseline: 5 shapes × 10 instances × $0.50 × 1 cell = **$25**
- GEPA Gen 1: 5 shapes × 3 candidates × 10 instances × $0.50 × 1 cell = **$75**
- Held-out: 5 shapes × top-1 × 5 instances × $0.50 = **$12.50**

**Total: ~$112** — still over. Final cut:

**Faza 1 LOCKED scope ($100 cap, $80 halt):**
- NULL-baseline: 5 shapes × **8 instances** × $0.50 × 1 cell = **$20**
- GEPA Gen 1: 5 shapes × 3 candidates × **8 instances** × $0.50 × 1 cell = **$60**
- Held-out: top-1 per shape × 5 instances × $0.50 = **$12.50**

**Total: $92.50 expected, $100 hard cap.** N=8 per evaluation is at lower bound of GEPA fitness signal — acceptable for proof-of-concept Faza 1, NOT acceptable for Faza 2 expansion (Faza 2 scales N to 20+).

**Halt triggers (any single triggers immediate halt + PM ratify):**
- Cumulative spend > $80
- κ drift detected mid-run (judge sample audit every 20 calls)
- Cell semantic violation detected (audit § 6.4)
- Mutation oracle (Opus 4.7) returns 2 consecutive invalid mutations (e.g. mutates system prompt instead of shape)
- Any LLM API blocker (rate-limit cascade, auth failure) — halt, restart with diagnostic pre-flight

---

## §6 — Pre-flight checks (binding, all 8 sub-rules from feedback memory)

Per `feedback_config_inheritance_audit.md` Extensions 1-6 + sub-rules 6-8, CC-4 mora da verifikuje pre run:

### 6.1 — Config inheritance audit
Eksplicitno specify Qwen + Opus + GPT + MiniMax model strings + reasoning_effort + max_tokens u manifest v7. Ne nasleduj iz manifest v6 implicitly. Naročito: Qwen reasoning mode (thinking vs non-thinking) MUST match per-shape configuration (qwen-thinking shape → reasoning enabled, qwen-non-thinking → disabled).

### 6.2 — Mixed-methodology baseline
NULL-baseline mora prijavljivati **trio-strict + self-judge razdvojeno** (ne shared aggregate). Phase 4.3 koristi trio-strict; pisanje "GEPA delta" mora citirati trio-strict numbers, ne self-judge.

### 6.3 — Scope verification
Pre run, CC-4 verifikuje da H3 cell ima ≥40 instanci u source corpus (potrebno za 8 NULL + 24 GEPA + 5 held-out = 37 instances + buffer). Ako H3 ima <40 instanci, halt-and-PM (signal da scope estimate pogrešan).

### 6.4 — Cell semantics prompt strictness preservation
Audit step pre commit Faza 1 results: za svaki GEPA candidate prompt, diff vs baseline. Diff mora biti samo unutar prompt-shape template body (between defined boundaries u shape file). Diff koji touch-uje cell.system_prompt ili cell.scoring_rubric = automatic INVALID, candidate dropped, mutation oracle re-prompted.

### 6.5 — σ-aware acceptance range
N=8 per cell daje cca CI ± 17pp at 95% (binomial), što je široko. **+5pp acceptance threshold je ne-statistički-rigorozan na N=8** — uzima se kao **fitness signal indicator**, ne kao publishable claim. To je razlog zašto Faza 1 = proof-of-concept, ne paper-ready evidence. Faza 2 scale-up je tek tu za publishable σ-bounded delta.

### 6.6 — Mixed-methodology variant
Trio-strict je primary; self-judge je supplementary diagnostic only. Faza 1 acceptance rule (§4) bazira se na trio-strict, ne self-judge.

### 6.7 — Cost super-linear input growth
GEPA candidates have variable token length (mutations may grow prompts). Cost calculation must use **worst-case 1.5× baseline token count** per candidate (encodes mutation overhead). If actual mid-run cost exceeds projection by >30%, halt.

### 6.8 — Source data structure
Verify H3 source data is **agentic knowledge work format** (not factoid LoCoMo). Phase 4.3 categorization confirms H3 = agentic. CC-4 spot-check 3 random H3 instances pre run, confirm task structure matches pilot 2026-04-26 corpus.

---

## §7 — Halt-and-PM checkpoints

Faza 1 ima 3 mandatory halt-and-PM points:

**Checkpoint A (post NULL-baseline, $25 cumulative):**
- Report NULL-baseline results per shape
- Confirm trio-strict in 18-24% range per shape
- Confirm κ within ±0.05 of canonical
- PM authorize GEPA Gen 1 kick

**Checkpoint B (mid-Gen 1, $50 cumulative):**
- Report intermediate κ from first 30 evaluations
- Report any cell semantic violation
- Report mutation oracle behavior (valid mutation rate)
- PM authorize completion of Gen 1

**Checkpoint C (post Gen 1 + held-out, ~$92 cumulative):**
- Final results per shape (NULL-baseline vs best GEPA candidate)
- κ stability report
- Acceptance rule (§4) verdict
- PM authorize either Faza 2 expansion OR FAIL fallback PHF

---

## §8 — Deliverables

1. **Code:**
   - `packages/core/src/prompt-shapes/gepa-evolved/` — directory sa best-per-shape candidates (5 files)
   - `packages/core/src/prompt-shapes/gepa-evolved/manifest.json` — selection metadata + audit chain
   - `benchmarks/gepa/faza-1/` — run logs + raw judge outputs + κ audit + diff snapshots

2. **Manifest v7:**
   - `benchmarks/preregistration/manifest-v7-gepa-faza1.yaml`
   - Extends v6 sa GEPA section (seed, oracle SHA, candidate hashes, generation count)
   - SHA256 logged u Checkpoint C report

3. **Decisions:**
   - `decisions/2026-04-28-gepa-faza1-launch.md` (LOCK upon paste-into-CC-4)
   - `decisions/2026-04-XX-gepa-faza1-results.md` (post-Checkpoint C)

4. **Test coverage:**
   - GEPA selection logic unit-tested (≥80% coverage)
   - Mutation validator (cell semantic check) unit-tested
   - κ audit utility unit-tested

5. **Memory entry:**
   - `.auto-memory/project_gepa_faza1_results.md` post Checkpoint C

---

## §9 — Out-of-scope (Faza 1)

Explicitly NOT in Faza 1:

- H2 + H4 cells (Faza 2 expansion)
- More than 2 GEPA generations
- Population > 3 candidates per shape
- N > 8 per evaluation
- System prompt evolucija (locked by §2 scope)
- Substrate (mind/) modifications (locked by §3.5)
- Apples-to-apples re-eval against pilot 2026-04-26 (separate Korak 12 work)
- Paper §5.4 framing update (post Phase 5 GEPA-evolved variant complete)

---

## §10 — Sequencing

**Predicates (must be done before CC-4 starts):**
- CC-1 Phase 4.3 verdict ratified ✅
- PM brief landed in `briefs/` ✅ (this file)
- Marko ratifikuje + executes paste-into-CC-4

**Successors (depend on Faza 1 outcome):**
- Faza 1 PASS → Faza 2 expansion brief authoring → CC-4 sledeća sesija
- Faza 1 PASS → Phase 5 GEPA-evolved variant brief (CC-1 sesija, post NULL-baseline)
- Faza 1 FAIL → PHF fallback decision memo + paper §5.4 reframe

**Parallel (CC-1 + CC-4 + CC-3):**
- CC-1: Phase 4.4 (skills sweep) → 4.5 (tools sweep) → Phase 5 NULL-baseline
- CC-4: Faza 1 GEPA pilot
- CC-3: Memory shims monorepo (Wave 1.3 next)

No code path conflicts between CC-1 and CC-4 (CC-1 touches harness around prompt-shapes, CC-4 produces new files in `gepa-evolved/` subdir).

---

## §11 — Cross-references

- Phase 4.3 results: `decisions/2026-04-28-phase-4-3-rescore-delta-report.md`
- Manifest v6 anchor: `benchmarks/preregistration/manifest-v6-preregistration.yaml`
- Stage 3 v6 5-cell summary: `D:\Projects\waggle-os\benchmarks\results\stage3-n400-v6-final-5cell-summary.md`
- Pilot 2026-04-26 result: `decisions/2026-04-26-pilot-verdict-FAIL.md`
- Decision Matrix PHF amendment: `decisions/2026-04-26-decision-matrix-self-judge-reframe.md`
- arxiv §5.4 multiplier framing: `research/2026-04-26-arxiv-paper/01-paper-skeleton.md`
- Feedback memory rules: `.auto-memory/feedback_config_inheritance_audit.md`
- 14-step launch plan: `.auto-memory/project_launch_plan_14_step_2026_04_27.md`

---

## §12 — Open questions for Marko

1. **Cost cap $100** — OK ili treba hard $80? PM rec $100 sa $80 internal halt.
2. **GEPA Faza 2 escalation budget** — predaj sad ili odluči post-Faza-1? PM rec post-Faza-1 (gated decision).
3. **Mutation oracle = Opus 4.7** — OK ili koristimo Sonnet 4.6 za cost reduction? PM rec Opus 4.7 (better mutation quality justifies cost; only 5×3×2 = 30 mutation calls total).
4. **Wall-clock priority** — paralelno sa CC-1 sweep ili sequential? PM rec paralelno (no conflict).

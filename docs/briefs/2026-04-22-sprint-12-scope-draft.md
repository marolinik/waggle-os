# Sprint 12 Scope — Draft Skica

**Datum:** 2026-04-22 (Sprint 11 Day 2 PM, drafted u anticipaciji Sprint 12 kickoff-a)
**Author:** PM (Marko Marković)
**Status:** 📝 **DRAFT** — ratifikacija se očekuje na Sprint 12 kickoff session-u
**Trajanje:** 5-7 radnih dana projected (Task 1 ~2-3 CC-1 sesije, Task 2 1 sesija, Task 4 anchor task 1-2 sesije)
**Total budget projected:** $1420-2500 LLM spend (Task 2 + Task 4); $0 za Task 1 (infra-build, zero LLM)

---

## 1. Purpose

Ovaj dokument je **working draft Sprint 12 scope skice**, spreman za ratifikaciju na Sprint 12 kickoff session-u. Sprint 11 zatvara se 9/10 CLOSED sa C3 DEFERRED → Sprint 12 Task 1 per Path C verdict (`sessions/2026-04-22-c3-standdown-path-c-ratified.md`). Sprint 12 svrha je: (a) infra-backfill A3 LOCK v1 substrate, (b) izvršenje C3 Stage 2 mini kao pre-requisite za H-42a/b authorization, (c) izvršenje H-42a/b pune eval-e kao SOTA launch-gating signal.

Nije execution authorization. Nije LOCKED. Služi kao substrate iz kojeg se Sprint 12 kickoff brief derivuje.

## 2. Task taxonomy

| Task | Naslov | Trajanje (CC-1 sesije) | LLM budget | Zavisnost |
|------|--------|------------------------|-----------|-----------|
| 1 | Infra-build (6 blockera + 2 non-blocking) | 2-3 | $0 | Sprint 11 close ratified |
| 2 | C3 Stage 2 mini execution | 1 (+1 buffer) | $120-200 cap $250 | Task 1 CLOSED |
| 3 | B4 finalization + H-42a/b pre-flight gate | 0.5 (PM-side) | $0 | Task 2 PASS |
| 4 | H-42a/b execution (6120 evals) | 1-2 (anchor) | $1300-2300 cap $2600 | Task 3 authorization |

## 3. Task 1 — Infra-build (6 blockera dependency-ordered)

**Svrha:** Backfill A3 LOCK v1 runtime substrate tako da C3 i H-42a/b mogu biti verbatim-executed bez brief relaxation-a. CC-1 engineering only, $0 LLM spend (sve lokalno development + test).

**Acceptance gate za Task 1 CLOSURE:** 6 blockera CLOSED + 2 non-blocking kompletisani + B3 addendum §5 implemented + smoke test za full invocation shape-a runner-a pass-uje na 10-instance dry run (bez actual LLM calls — mock client za substrate verification).

**Dependency DAG:**

```
#1 Dataset loader ──┐
#2 Cell enum rename ┤
                    ├──> #5 Metric computation (reads from loader + cells)
#3 Pre-reg CLI     ──┤
#4 Judge registry   ┤
                    ├──> #6 Failure taxonomy (reads from judge + metrics)
B3 addendum §4/§5 ──┘
```

### Blocker #1 — LoCoMo dataset loader

**Trajanje estimate:** 3-4h
**Acceptance criteria:**
- `benchmarks/data/locomo/` sadrži N=1540 canonical LoCoMo instance fajlove ili single archive (JSONL/JSON) sa `conversation_id` + `question` + `gold_answer` + `category` poljima.
- `datasets.ts:121` više ne silent-fallback-uje na 60-instance synthetic set. Loader throws `DatasetMissingError` ako canonical path missing.
- `dataset_version` hash (SHA-256 of canonical archive) emitted kao pre-registration manifest field i JSONL row header.
- 10-instance smoke test (bez LLM calls, samo loader verification) pass.

**Why first:** Sve ostale blocker-e zavise od real dataset-a. C3 mini (400 evals) bez real LoCoMo ne proizvodi SOTA signal.

### Blocker #2 — Cell enum rename

**Trajanje estimate:** 2-3h
**Acceptance criteria:**
- `cells.ts:54-86` key-ovi promenjeni sa `raw|memory-only|evolve-only|full-stack` → `raw|filtered|compressed|full-context` per A3 LOCK §cell-taxonomy.
- `isCellName` tip guard updated.
- Svi cell-specific testovi pass.
- Sprint 10 JSONL artifakti re-keyed ili annotirani sa `legacy_cell_name` polje (PM odluka za Sprint 12 kickoff brief: hipoteza prepisivanje jer su Sprint 10 artefakti pre-publication; backward-compat fallback opcija samo ako PM eksplicitno ratifikuje).

**Why parallel with #1:** Nezavisan od dataset loader-a (pure type refactor), može ići paralelno sa #1 u istoj CC-1 sesiji.

### Blocker #3 — Pre-registration CLI surface

**Trajanje estimate:** 4-5h
**Acceptance criteria:**
- `runner.ts` parseArgs dodaje: `--manifest-hash <sha256>`, `--emit-preregistration-event`, `--per-cell`, `--judge-tiebreak <policy>` flagove.
- Novi modul `benchmarks/harness/src/preregistration.ts` sa pino-compatible event emitter za `bench.preregistration.manifest_hash` event.
- Emitter payload sadrži: `manifest_sha256`, `manifest_path`, `run_id`, `timestamp_utc`, `dataset_version_hash`, `target_model_pinning` block (per B3 addendum §4 YAML schema).
- H-AUDIT-2 spot-verification test harness može match-ovati run-start event sa committed YAML SHA-256 u A3 LOCK twin-u.

**Why after #1/#2:** Event emitter reads from loader + cells state, tako da mora biti after dataset + enum sanity.

### Blocker #4 — Judge model registry

**Trajanje estimate:** 2h
**Acceptance criteria:**
- `config/models.json` extended sa entry-ijima za `claude-opus-4-7` (Surface B default + dated alias variant), `gpt-5.4`, `gemini-3.1`, `grok-4.20`.
- Svaki entry ima: LiteLLM route, pricing input/output per 1M token, `pinning_surface` (A ili B per B3 addendum), `carve_out_reason` gde primenljivo.
- `createJudgeLlmClient` resolves all four bez errors.
- Cost accounting attribution works end-to-end (test: 100-token mock call kroz svaku od 4 rute, total cost u USD computed correctly sa tolerance ±$0.0001).

**Why parallel with #3:** Nezavisan od CLI surface-a (config-only), može ići paralelno sa #3 u istoj CC-1 sesiji.

### Blocker #5 — Metric computation

**Trajanje estimate:** 4-6h
**Acceptance criteria:**
- Fleiss' κ mid-run sa baseline 0.7458 anchor (Sprint 10 baseline) + HALT threshold < 0.60 trigger.
- Wilson 95% score CI (per-cell aggregate score, asymmetric bounds za small-sample correctness).
- Cluster-bootstrap 95% CI (10K iterations, seed 42 fixed, cluster variable = `conversation_id` per A3 LOCK §7).
- Aggregate output JSONL emit-uje sve tri metrike alongside failure taxonomy distribution.
- Unit test: poznat input (50 mock evals sa known verdict distribution) reproduces analytically-expected κ, Wilson bounds, cluster-bootstrap bounds within numerical tolerance.

**Why after #1+#2:** Metric reads from dataset + cell-keyed results.

### Blocker #6 — Failure taxonomy F1-F6 judge rubric integration

**Trajanje estimate:** 3-4h
**Acceptance criteria:**
- `judge-runner.ts` judge prompt proširuje rubric sa F1-F6 + null + F-other kategorijama per A3 LOCK §6.
- JSONL rows emit-uju `verdict` + `failure_code` + `failure_rationale` polja per judge per instance.
- Unit test: mock judge response sa svakom od 8 kategorija (F1-F6, null, F-other) parse-uje correctno.

**Why last:** Judge runner reads from judge registry (#4) + cell-keyed inputs (#2) + metric aggregation schema (#5).

### Non-blocking kompletacija A — B3 addendum §4/§5 implementation

**Trajanje estimate:** 1-2h (uglavnom piggy-backs na #3 i #4)
**Acceptance criteria:**
- JSONL row schema dodaje `model_pinning_surface`, `model_pinning_carve_out_reason`, `model_revision_hash` polja.
- Pre-registration manifest emitter (#3) extend-uje `target_model_pinning` block per B3 addendum §4 YAML schemu.
- Integration test: single dry run sa DashScope Qwen + Anthropic Opus judge ensemble produces manifest + JSONL sa correct pinning surface annotations per row.

### Non-blocking kompletacija B — Smoke test suite

**Trajanje estimate:** 1-2h
**Acceptance criteria:**
- 10-instance dry-run (mock LLM clients) kroz full runner invocation shape per C3 brief §4.
- Verifies: dataset loaded (1540 count), cell enum correct keys, pre-reg event emitted sa valid YAML SHA-256, judge registry resolves all 4, metrics computed (κ/Wilson/bootstrap placeholders od mock data), failure taxonomy attached.
- $0 LLM spend (mock clients only). Execution time < 60 sekundi.

**Why:** Ovo je Task 1 CLOSURE gate — ako smoke test pass-uje, Task 1 je CLOSED i Task 2 može kick-ovati.

### Task 1 agregirani estimate

- **Total CC-1 hours:** 15-22h (dependency-ordered, neke parallelizable — #1+#2 together, #3+#4 together, #5/#6 linear).
- **Total CC-1 sessions:** 2-3 (po 6-8h realnog engineering work-a sa break-ovima).
- **LLM spend:** $0 (mock clients samo, no real API calls u Task 1).
- **Risk:** Ako #1 dataset sourcing duži od očekivanog (LoCoMo canonical license/access issue), Task 1 se extend-uje. Fallback: Sprint 12 Task 1 brief eksplicitno imenuje data-sourcing kao #0 (pre-blocker-1).

## 4. Task 2 — C3 Stage 2 mini execution

**Svrha:** Izvršiti C3 brief (`briefs/2026-04-22-cc-c3-stage2-mini-kickoff.md`) verbatim posle Task 1 CLOSURE, uz minimalne updates za Blocker 2 rename (cell enum novi key-ovi) i Blocker 4 judge ensemble literal (eksplicitna concrete model ID lista).

**Parametri:**
- 4 cells × 100 instances = 400 total evals
- Judge ensemble: `claude-opus-4-7,gpt-5.4,gemini-3.1` (Surface B za Opus, Surface A za GPT/Gemini per B3 addendum)
- Budget: $120-200 cap $250 per C3 brief §3
- Exit criteria: 11 per C3 brief §5 (aggregate score trend, κ ≥ 0.60, Wilson CI width ≤ 6pp per-cell, failure taxonomy distribution, et al.)
- Abort triggers: 6 per C3 brief §6 (κ collapse, cost overrun, judge availability)

**Ratification gate:** PM (Marko) ratifikuje Task 1 CLOSURE → CC-1 kickuje Task 2 per C3 brief §4 invocation template (minor flag adjustments za rename + judge literal).

**Projected outcome:** Ako PASS (per §5 thresholds), B4 final memo unlock-uje za H-42a/b execution authorization (Task 3).

## 5. Task 3 — B4 finalization + H-42a/b pre-flight gate

**Svrha:** Po C3 mini PASS-u, PM potpisuje B4 final memo kao "execution-approved" umesto "methodology intent". Dvojni dokument evolution:

1. **Update B4 memo (`decisions/2026-04-22-stage-2-full-kickoff-memo.md`):** Status "FINAL" → "EXECUTION-APPROVED". Section 2 reframe iz "zavisi od Sprint 12 Task 2" u "Task 2 PASS-ovan sa [scores/κ/CI], H-42a/b unlock authorized".
2. **Pre-flight checklist dry run:** Substrate readiness §0 re-check (per `feedback_substrate_readiness_gate.md`): grep evidence da sva Task 1 work ostaje intact (dataset hash match, enum unchanged, CLI flags functional, judge registry resolves, metrics testovi pass, event emitter live). Ako bilo koji substrate regression, R4 risk trigger-uje (per B4 memo §7 R4).

**Trajanje:** 30-60 min PM-side, 30-60 min CC-1 substrate re-check.
**Budget:** $0.

## 6. Task 4 — H-42a/b execution

**Svrha:** Pre-registration-conformant puna eval-a za SOTA-gated launch signal.

**Parametri:**
- **H-42a (Qwen primary):** 4 cells × 1540 instances × 3 judges (sve judges agreement-based per B2 tie-break policy) = 4620 evals operational count (instance-judge pairs aggregate). Estimated LLM cost $1000-1700.
- **H-42b (Opus probe):** Reduced eval (1500 instances subset per B4 memo §3) za probe signal za cross-model validation. Estimated LLM cost $300-600.
- **Total:** 6120 evals cumulative operational count, $1300-2300 LLM spend cap $2600.

**Exit criteria (per A3 LOCK §10 + B4 memo §5):**
- **STRONG-PUBLISHABLE:** Aggregate score ≥ 91.6% (Mem0 reper matched/surpassed) + κ ≥ 0.75 + Wilson CI lower bound ≥ 88% per-cell + failure taxonomy distribution consistent with Sprint 10 baseline.
- **PUBLISHABLE:** Aggregate score 88-91.5% + κ ≥ 0.70 + Wilson CI lower bound ≥ 85%.
- **WEAK:** Aggregate score 85-87.9% + κ ≥ 0.65. Launch narrative adjusts tone — not "SOTA matched" nego "competitive with published".
- **FAIL:** Aggregate score < 85% or κ < 0.60. Halt. Triggeruje post-mortem + potencijalno Sprint 13 deep-dive.

**Abort triggers:**
- Cumulative cost exceeds $2600 hard cap → HALT.
- Live κ drops below 0.60 at 25% checkpoint → HALT, post-mortem.
- Any single judge model unavailable for > 30min → HALT, retry with reduced ensemble option (PM call).

**Ratification gate:** Task 3 B4 execution-approved + substrate §0 re-check passed → CC-1 kickuje H-42a, then H-42b.

## 7. Sprint 12 total budget

- **Task 1:** $0 LLM (pure infra)
- **Task 2:** $120-200 cap $250
- **Task 3:** $0
- **Task 4:** $1300-2300 cap $2600
- **Total Sprint 12 projected spend:** $1420-2500, hard cap $2850

Budget rationale: Sprint 12 je execution-heavy anchor sprint. Unlike Sprint 11 koji je budget-conservative ($0.018893 cumulative), Sprint 12 investira u signal-gating evidence za SOTA launch claim. Cost-per-signal je ~$0.40-0.50 per eval, acceptable za pre-registration-conformant benchmark.

## 8. Sprint 12 success criteria (exit condition)

1. Task 1 CLOSED (6 blockera + 2 non-blocking + B3 addendum implementation verified).
2. Task 2 PASS per C3 brief §5 thresholds.
3. Task 3 B4 execution-approved + substrate §0 re-check clean.
4. Task 4 H-42a/b completed sa verdict u STRONG-PUBLISHABLE ili PUBLISHABLE kategoriji.
5. Sprint 12 close memo documented sa scores + κ + CI + cost ledger + next-sprint implications (Sprint 13 likely = launch narrative + brand assets finalization ako Task 4 STRONG-PUBLISHABLE).

Ako Task 4 verdict je WEAK ili FAIL, Sprint 12 close memo documentuje to evenhandedly i Sprint 13 preuzima post-mortem + remediation scope umesto launch narrative.

## 9. Risks i mitigations

**R1 — Task 1 duže nego projected (substrate issues surface kasno):** Sprint 12 extend-uje za 1-2 dana. Mitigation: #0 pre-blocker dataset sourcing check na samom kickoff-u.

**R2 — Task 2 FAIL na C3 mini:** Ne ide u Task 4 dok se uzrok ne ustanovi. Mitigation: post-mortem obavezan, potencijalni re-run sa adjusted thresholds (PM call, NE brief relaxation bez explicit LOCK revisit).

**R3 — Task 4 cost overrun:** Hard cap $2600 halt-uje pre nego što budžet eksplodira. Mitigation: live cost tracking emitter, alert na 80% threshold.

**R4 — Substrate regression između Task 1 i Task 4:** B4 memo §7 R4 mitigation (substrate §0 re-check pre Task 4 kickoff-a).

**R5 — Provider drift (κ collapse mid-run Task 4):** HALT + post-mortem. A3 LOCK §10 protokol triggeruje.

**R6 — Judge model unavailability (API outage):** Retry-with-reduced-ensemble opcija + PM call za proceed/halt decision.

## 10. Open questions za Sprint 12 kickoff brief

1. **Legacy JSONL handling (Blocker 2 rename):** Prepisivanje Sprint 10 artefakata novim key-ovima, ili `legacy_cell_name` polje za backward-compat? Hipoteza prepisivanje (Sprint 10 je pre-publication), ali PM odluka obavezna pre Task 1 kickoff-a.
2. **Canary drift-detection subset (B3 addendum §3):** Da li Sprint 12 Task 1 uvodi 50-instance canary set za drift monitoring, ili se to defer-uje u Sprint 13? Trenutni default: defer.
3. **Task 4 H-42b probe scope:** 1500 instances subset je trenutni estimate; alternative 2000 instances za tighter Wilson CI (trošak +$80-120). PM call na kickoff-u.
4. **B4 memo evolution path:** Da li update DRAFT-u ili novi "EXECUTION-APPROVED" verzioni fajl? Preporuka: update in-place jer je B4 već jedna-datoteka autoritativ.
5. **Sprint 13 preview:** Ako Task 4 STRONG-PUBLISHABLE, Sprint 13 scope je launch narrative + brand + wiki publication. Ako WEAK, Sprint 13 je remediation. Oba skica ne drafted dok Task 4 verdict nije poznat.

## 11. Related

- `decisions/2026-04-22-bench-spec-locked.md` — A3 LOCK v1 (strategy intact, Sprint 12 Task 1 backfill-uje runtime)
- `decisions/2026-04-22-bench-spec-locked.manifest.yaml` — A3 LOCK YAML twin
- `decisions/2026-04-22-stage-2-full-kickoff-memo.md` — B4 final memo, reframed to "execution-gated"
- `decisions/2026-04-22-b3-lock-dashscope-addendum.md` — B3 addendum za non-Anthropic pinning surface
- `briefs/2026-04-22-cc-c3-stage2-mini-kickoff.md` — C3 brief source (execution-deferred, ne superseded)
- `sessions/2026-04-22-c3-blocked-substrate-gap.md` — CC-1 pre-kick verification + 6-blocker taxonomy
- `sessions/2026-04-22-c3-standdown-path-c-ratified.md` — Path C verdict
- `.auto-memory/feedback_substrate_readiness_gate.md` — §0 grep evidence protokol
- `.auto-memory/project_sprint_11_c3_deferred_path_c.md` — Sprint 11 close state

---

**DRAFT — awaits PM ratification na Sprint 12 kickoff session-u. Open pitanja §10 blokiraju direct execution-LOCK; Task 1 kickoff čeka PM clarifikaciju na #1 (legacy JSONL) minimum. Remainder open pitanja mogu biti resolved inline tokom Sprint 12 tok-a.**

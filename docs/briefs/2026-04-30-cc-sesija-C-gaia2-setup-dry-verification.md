# CC Brief — Sesija C: Gaia2 ARE Setup + GEPA Dry Verification

**Brief ID:** `cc-sesija-c-gaia2-setup-dry-verification-v1`
**Date:** 2026-04-30
**Author:** PM
**Status:** LOCKED (Marko ratifikovao 2026-04-30 "sve yes potvrdjeno", benchmark portfolio refresh ratification ask #1 = YES)
**Stream:** CC Sesija C (paralelno sa Sesija A + Sesija B)
**Branch:** Kreirati `feature/gaia2-are-setup` iz `main` (ne zavisi od Sesija A ili B grana)
**Wall-clock:** 1-2 dana CC implementation (projection NOT trigger)
**Cost cap:** $15 hard / $10 halt / $5-8 expected (dry run only, no full benchmark)
**Authority chain:**
- `decisions/2026-04-30-pre-launch-sprint-consolidation-LOCKED.md`
- `briefs/2026-04-29-benchmark-portfolio-refresh-2026-venues.md` (§2.1 Gaia2 + §2.3 ERL)
- Faza 1 closure (substrate evidence): `decisions/2026-04-29-gepa-faza1-results.md`

---

## §0 — Pre-flight gates (BLOCKING — must PASS before §1)

### §0.1 — Gaia2 ARE platform availability

CC mora dokumentovati u `gaia2-setup-evidence.md`:

1. ARE platform repo accessible: `https://github.com/facebookresearch/meta-agents-research-environments`
2. Gaia2 paper anchor: arxiv 2602.11964 (Froger et al., 12 Feb 2026)
3. Gaia2 dataset license verified (research use OK za dry run + future Phase 3 sprint)
4. Gaia2 Search split task count verified (target N=50-100 tasks za dry run, full N=200+ deferred za Phase 3)

### §0.2 — GEPA-evolved variants accessible

1. claude::gen1-v1 + qwen-thinking::gen1-v1 shape definitions reachable u `packages/agent/src/prompt-shapes/` ili monorepo migrated location
2. `registerShape` canonical API working (Amendment 8 native)
3. runRetrievalAgentLoop accessible iz Gaia2 harness adapter

### §0.3 — Cost projection probe

3-request dry run probe sa Gaia2 sample tasks, beleziš per-request cost p50/p95. Compute total dry run projection. Halt-and-PM ako probe-validated total > $10.

---

## §1 — Scope declaration

CC setup-uje **Gaia2 ARE platform lokalno** + verifikuje da GEPA-evolved variants rade na Gaia2 Search split bez harness modifikacije + autoring ERL methodology integration plan u `retrieval-agent-loop.ts`. Output je preparation za post-launch Phase 3 sprint Week 4-8.

**Scope LOCKED:**
- ARE platform install (Python venv ili Docker)
- Gaia2 dataset download + preprocessing
- Adapter sloj koji wraps Gaia2 task → runRetrievalAgentLoop call sa selected shape
- Dry run N=10-20 tasks na Gaia2 Search split (subset, ne full)
- ERL methodology integration plan dokumentacija (kod ne implementira u ovom briefu)

**Out of scope (post-launch Phase 3 sprint):**
- Full N=200 Gaia2 Search + Execution split run
- ReAct baseline vs ERL-augmented A/B comparison
- Trio-strict + self-judge dual reporting
- arxiv submission ka MemAgents Workshop

---

## §2 — Implementation plan

### §2.1 — ARE platform install (Day 1 morning)

**Task C1:** Clone `facebookresearch/meta-agents-research-environments` u `D:/Projects/waggle-os/external/meta-agents-research-environments/` (or external/ submodule). Follow ARE installation README (Python venv, dependencies, dataset download).

**Task C2:** Verify ARE platform smoke test prema platform's own quick-start guide. Run their default agent on 1-2 sample Gaia2 tasks, verify expected output format.

### §2.2 — Adapter za GEPA-evolved variants (Day 1 afternoon)

**Task C3:** Adapter sloj `D:/Projects/waggle-os/benchmarks/gaia2/adapter.ts` koji:
- Loads Gaia2 task definicije iz dataset
- Wraps task za runRetrievalAgentLoop call
- Selects shape (`claude::gen1-v1` ili `qwen-thinking::gen1-v1`) iz config
- Captures response + write-action verifier output
- Logs to JSONL `D:/Projects/waggle-os/benchmarks/gaia2/runs/<ISO_date>/`

**Task C4:** Configuration file `D:/Projects/waggle-os/benchmarks/gaia2/config.yaml` sa:
- task_count_dry_run: 10-20
- shapes: ["claude::gen1-v1", "qwen-thinking::gen1-v1", "claude::base", "qwen-thinking::base"]
- baseline_shape: "claude::base" (control)
- judge_methodology: "self-judge-dry-run" (full trio-strict deferred Phase 3)
- cost_cap: 10
- halt_trigger: 8

### §2.3 — Dry run execution (Day 1 evening — Day 2 morning)

**Task C5:** Run 4 dry run scenarios:
1. claude::base baseline (10 tasks)
2. claude::gen1-v1 GEPA-evolved (10 tasks)
3. qwen-thinking::base baseline (10 tasks)
4. qwen-thinking::gen1-v1 GEPA-evolved (10 tasks)

Total 40 task invocations. Cost projection ~$5-8.

**Task C6:** Beleziš:
- Per-shape Pass@1 rate na 10-task subset
- Per-task cost (input + output tokens)
- Per-task latency
- Failure modes (loop_exhausted, timeout, parse_fail, judge_failure)

### §2.4 — ERL methodology integration plan (Day 2)

**Task C7:** ERL paper review (`arxiv:2603.24639`). Document u `benchmarks/gaia2/erl-integration-plan.md`:
- ERL methodology summary (retrieval of heuristics from accumulated experience)
- Integration point u Waggle: `packages/agent/src/retrieval-agent-loop.ts` (38.3 KB file koji već radi adjacent work)
- Heuristic source: hive-mind frame store (use I/P/B distinction, importance weighting)
- Injection point: agent system prompt enrichment pre execution
- Acceptance criteria za Phase 3 sprint: ERL-augmented variant +5pp Pass@1 over ReAct baseline na Gaia2 Search split

**Task C8:** ERL methodology poređenje sa Waggle native retrieval. Document differences:
- ERL retrieves "transferable heuristics" iz experience
- Waggle retrieves "facts/decisions/insights/tasks" frames sa importance scoring
- Mapping: Waggle insight frames + decision frames ≈ ERL heuristics
- Hypothesis: Waggle's bitemporal-KG-conditioned retrieval = ERL extension, ne replication

### §2.5 — Cost validation + final acceptance (Day 2)

**Task C9:** Cost reconciliation. Total spent vs projection. Acceptance: actual cost < $10 hard cap.

**Task C10:** Dry run results memo `benchmarks/gaia2/dry-run-results-memo.md`. Format:
- Per-shape Pass@1 (4 shapes × 10 tasks)
- Cost per task per shape
- Failure modes distribution
- Comparison sa Faza 1 in-sample evidence (na N=13 GEPA validation)
- Disposition: ako dry run signal je consistent sa Faza 1 (+12.5pp lift), Phase 3 sprint Week 4-8 kick-off authorized post-launch

**Task C11:** Final commit + emit "PHASE 5 SESIJA C COMPLETE — Gaia2 ARE setup + GEPA dry verification done, ERL integration plan authored, ready za post-launch Phase 3 sprint". Push grana origin.

---

## §3 — Halt-and-PM triggers

- §0 sub-gate FAIL (ARE platform inaccessible, GEPA shapes not loadable)
- Cost overshoot >$8 (halt) ili >$10 (hard cap)
- Discovery van scope-a (Gaia2 task format incompatible sa runRetrievalAgentLoop input expectations)
- Dry run signal contradicts Faza 1 evidence (npr. GEPA-evolved variants underperform baseline na Gaia2 — would require investigation pre Phase 3 sprint)

---

## §4 — Acceptance criteria (sve PASS pre §2.5 close)

1. ARE platform installed lokalno + smoke test pass
2. Adapter sloj funkcionalan, integrates Gaia2 task → runRetrievalAgentLoop
3. Dry run N=40 tasks complete (4 shapes × 10 tasks)
4. JSONL logs presented sa per-task evidence
5. Cost validation: actual < $10
6. ERL integration plan dokumentovan (8 sekcija minimum)
7. Dry run results memo emit-uje go/no-go signal za Phase 3 sprint
8. Tests passing (no regression u postojećim test suite)
9. Commit + push grana

---

## §5 — Cross-stream dependencies

**Sesija A + Sesija B — paralelno, no blocker:** Sesija C ne dotice se apps/web ili monorepo migration. Independent stream.

**Post-launch Phase 3 sprint (Week 4-8 per benchmark portfolio brief §5):** Build na Sesija C output. Pre-existing setup eliminira ~1 dan overhead u Phase 3 sprint Week 4.

---

## §6 — Audit trail anchors

- Pre-launch sprint consolidation: `decisions/2026-04-30-pre-launch-sprint-consolidation-LOCKED.md`
- Benchmark portfolio brief (Gaia2 + ERL section): `briefs/2026-04-29-benchmark-portfolio-refresh-2026-venues.md`
- Faza 1 closure (substrate evidence): `decisions/2026-04-29-gepa-faza1-results.md`
- ARE platform: github.com/facebookresearch/meta-agents-research-environments
- Gaia2 paper: arxiv 2602.11964
- ERL paper: arxiv 2603.24639
- This brief: `briefs/2026-04-30-cc-sesija-C-gaia2-setup-dry-verification.md`

---

**End of brief. Awaiting CC kick-off.**
